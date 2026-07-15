"""
博闻知识入库脚本

读取 knowledge/ 目录下的 Markdown 文件（带 frontmatter），
解析为结构化条目，调用 /embed 生成向量，调用 /vector/upsert 入库。

用法：
  cd differentiation-service
  python ingest_knowledge.py --knowledge-dir ../knowledge --endpoint http://localhost:8766

支持增量更新：基于 id + version 判断是否需要重新嵌入。
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import json
import hashlib
import logging
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("ingest-knowledge")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """解析 Markdown frontmatter（--- 之间的 YAML）和正文"""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", content, re.DOTALL)
    if not match:
        return {}, content

    raw_yaml = match.group(1)
    body = match.group(2).strip()

    # 简易 YAML 解析（避免额外依赖）
    metadata: dict[str, Any] = {}
    for line in raw_yaml.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()

        # 处理列表 [item1, item2]
        if value.startswith("[") and value.endswith("]"):
            items = [item.strip().strip('"').strip("'") for item in value[1:-1].split(",")]
            metadata[key] = [item for item in items if item]
        elif value.startswith('"') and value.endswith('"'):
            metadata[key] = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            metadata[key] = value[1:-1]
        else:
            metadata[key] = value

    return metadata, body


def collect_knowledge_files(knowledge_dir: Path) -> list[Path]:
    """收集 knowledge/ 目录下所有 .md 文件"""
    return sorted(knowledge_dir.rglob("*.md"))


def build_entry(filepath: Path, metadata: dict[str, Any], body: str) -> dict[str, Any]:
    """构建向量入库条目"""
    entry_id = metadata.get("id", filepath.stem)
    title = metadata.get("title", filepath.stem)
    category = metadata.get("category", "通用")
    entry_type = metadata.get("type", "hook_strategy")
    dimension = metadata.get("dimension")
    tags = metadata.get("tags", [])
    source = metadata.get("source", "local-markdown")
    version = metadata.get("version", "1.0.0")

    # 拼接用于嵌入的文本：title + body 前 500 字
    embed_text = f"{title}\n{body[:500]}"

    entry_metadata = {
        "title": title,
        "category": category,
        "type": entry_type,
        "source": source,
        "version": version,
    }
    if dimension:
        entry_metadata["dimension"] = dimension
    if tags:
        entry_metadata["tags"] = tags

    return {
        "id": entry_id,
        "text": embed_text,
        "metadata": entry_metadata
    }


def load_manifest(manifest_path: Path) -> dict[str, str]:
    """加载入库清单（记录已入库条目的 hash）"""
    if manifest_path.exists():
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_manifest(manifest_path: Path, manifest: dict[str, str]) -> None:
    """保存入库清单"""
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def compute_hash(entry: dict[str, Any]) -> str:
    """计算条目内容 hash（用于增量更新判断）"""
    content = json.dumps(entry, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def ingest(
    knowledge_dir: Path,
    endpoint: str,
    collection: str = "bowen-knowledge",
    force: bool = False,
) -> int:
    """执行知识入库"""
    files = collect_knowledge_files(knowledge_dir)
    if not files:
        logger.warning("No .md files found in %s", knowledge_dir)
        return 0

    logger.info("Found %d knowledge files", len(files))

    manifest_path = knowledge_dir / ".ingest-manifest.json"
    manifest = load_manifest(manifest_path)

    entries_to_upsert: list[dict[str, Any]] = []
    skipped = 0

    for filepath in files:
        content = filepath.read_text(encoding="utf-8")
        metadata, body = parse_frontmatter(content)

        if not metadata.get("id"):
            logger.warning("Skipping %s: no id in frontmatter", filepath)
            continue

        entry = build_entry(filepath, metadata, body)
        entry_hash = compute_hash(entry)

        if not force and manifest.get(entry["id"]) == entry_hash:
            skipped += 1
            continue

        entries_to_upsert.append(entry)

    if skipped > 0:
        logger.info("Skipped %d unchanged entries", skipped)

    if not entries_to_upsert:
        logger.info("All entries up to date, nothing to ingest")
        return 0

    logger.info("Ingesting %d entries to %s", len(entries_to_upsert), endpoint)

    # 调用 /vector/upsert
    upsert_url = f"{endpoint}/vector/upsert"
    upsert_payload = {
        "collection": collection,
        "entries": entries_to_upsert
    }

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(upsert_url, json=upsert_payload)
            response.raise_for_status()
            result = response.json()
            upserted = result.get("upserted", 0)

            if upserted != len(entries_to_upsert):
                logger.warning("Expected %d upserted, got %d", len(entries_to_upsert), upserted)

            # 更新清单
            for entry in entries_to_upsert:
                manifest[entry["id"]] = compute_hash(entry)
            save_manifest(manifest_path, manifest)

            logger.info("Successfully ingested %d entries", upserted)
            return upserted

    except httpx.ConnectError:
        logger.error("Cannot connect to %s — is the service running?", endpoint)
        return 0
    except httpx.HTTPStatusError as e:
        logger.error("HTTP error: %s", e.response.text)
        return 0
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        return 0


def main():
    parser = argparse.ArgumentParser(description="博闻知识入库脚本")
    parser.add_argument(
        "--knowledge-dir",
        type=str,
        default="../knowledge",
        help="知识文件目录（默认 ../knowledge）"
    )
    parser.add_argument(
        "--endpoint",
        type=str,
        default="http://localhost:8766",
        help="向量服务端点（默认 http://localhost:8766）"
    )
    parser.add_argument(
        "--collection",
        type=str,
        default="bowen-knowledge",
        help="ChromaDB 集合名（默认 bowen-knowledge）"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="强制重新嵌入所有条目（忽略清单）"
    )

    args = parser.parse_args()
    knowledge_dir = Path(args.knowledge_dir).resolve()

    if not knowledge_dir.exists():
        logger.error("Knowledge directory not found: %s", knowledge_dir)
        sys.exit(1)

    count = ingest(knowledge_dir, args.endpoint, args.collection, args.force)
    logger.info("Done. Ingested %d entries.", count)


if __name__ == "__main__":
    main()
