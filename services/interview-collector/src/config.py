"""配置加载器 — 解析 creators.yaml 和 .env 环境变量"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

from .domain.types import CreatorConfig


def load_env(env_path: Path | None = None) -> None:
    """加载 .env 文件到环境变量

    简单解析，不依赖 python-dotenv
    """
    if env_path is None:
        env_path = Path(__file__).parent.parent / ".env"

    if not env_path.exists():
        return

    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            # 不覆盖已存在的环境变量
            if key not in os.environ:
                os.environ[key] = value


def load_config(config_path: Path | None = None) -> tuple[list[CreatorConfig], list[dict]]:
    """加载创作者配置和泛搜索配置

    Returns:
        (creators, general_search_configs)
    """
    if config_path is None:
        config_path = Path(__file__).parent.parent / "config" / "creators.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"配置文件不存在: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    creators: list[CreatorConfig] = []
    for item in raw.get("creators", []):
        bilibili = item.get("bilibili", {})
        douyin = item.get("douyin", {})
        filters = item.get("filters", {})

        creators.append(CreatorConfig(
            key=item.get("key", ""),
            name=item.get("name", ""),
            description=item.get("description", ""),
            bilibili_uid=str(bilibili.get("uid", "")),
            bilibili_search_keyword=bilibili.get("search_keyword", ""),
            douyin_sec_uid=str(douyin.get("sec_uid", "")),
            douyin_search_keyword=douyin.get("search_keyword", ""),
            min_duration_seconds=int(filters.get("min_duration_seconds", 120)),
            max_duration_seconds=int(filters.get("max_duration_seconds", 1800)),
            title_keywords=list(filters.get("title_keywords", [])),
            title_exclude=list(filters.get("title_exclude", [])),
        ))

    general_search = raw.get("general_search", [])

    return creators, general_search


def get_creator_by_key(creators: list[CreatorConfig], key: str) -> CreatorConfig | None:
    """按键查找创作者配置"""
    for c in creators:
        if c.key == key:
            return c
    return None
