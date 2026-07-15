"""博闻访谈视频收集与蒸馏流水线 — 主入口"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from pathlib import Path

# 确保可以 import src.*
sys.path.insert(0, str(Path(__file__).parent))

from src.config import load_env, load_config, get_creator_by_key
from src.infrastructure.bilibili.bilibili_api import BilibiliAPI
from src.infrastructure.bilibili.bilibili_discoverer import BilibiliDiscoverer
from src.infrastructure.bilibili.bilibili_subtitle import BilibiliSubtitleExtractor
from src.infrastructure.transcribe.audio_transcriber import AudioTranscriber
from src.infrastructure.transcribe.whisper_fallback import WhisperTranscriber
from src.infrastructure.douyin.douyin_discoverer import DouyinDiscoverer
from src.infrastructure.distill.llm_distiller import LLMContentDistiller
from src.infrastructure.storage.markdown_store import MarkdownStore
from src.infrastructure.storage.json_store import JsonStore
from src.infrastructure.storage.state_store import StateStore
from src.pipeline.collector_pipeline import InterviewCollectorPipeline
from src.cli import parse_args

logger = logging.getLogger("interview-collector")


def setup_logging():
    """配置日志（控制台 + 文件）"""
    logs_dir = Path("storage/interview-collector/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)

    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # 控制台
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(fmt, datefmt))
    root_logger.addHandler(console)

    # 文件
    file_handler = logging.FileHandler(logs_dir / "collection.log", encoding="utf-8")
    file_handler.setFormatter(logging.Formatter(fmt, datefmt))
    root_logger.addHandler(file_handler)


def health_check():
    """启动前健康检查（不阻断，仅警告）"""
    import httpx

    checks = []

    # FunASR
    funasr_url = os.getenv("FUNASR_SERVICE_URL", "http://localhost:8765")
    try:
        resp = httpx.get(f"{funasr_url}/health", timeout=3.0)
        if resp.status_code == 200:
            checks.append(("FunASR", True, "running"))
        else:
            checks.append(("FunASR", False, f"HTTP {resp.status_code}"))
    except Exception:
        checks.append(("FunASR", False, "unreachable"))

    # differentiation-service
    vector_url = os.getenv("VECTOR_STORE_URL", "http://localhost:8766")
    try:
        resp = httpx.get(f"{vector_url}/vector/health", timeout=3.0)
        if resp.status_code == 200:
            checks.append(("VectorStore", True, "running"))
        else:
            checks.append(("VectorStore", False, f"HTTP {resp.status_code}"))
    except Exception:
        checks.append(("VectorStore", False, "unreachable"))

    # LLM 配置
    llm_key = os.getenv("BOWEN_VLM_API_KEY", "")
    checks.append(("LLM", bool(llm_key), "configured" if llm_key else "BOWEN_VLM_API_KEY not set"))

    for name, ok, detail in checks:
        level = logging.INFO if ok else logging.WARNING
        logger.log(level, "健康检查 %s: %s (%s)", name, "OK" if ok else "WARN", detail)

    return checks


def build_pipeline() -> InterviewCollectorPipeline:
    """构建流水线组件"""
    # B站组件
    bili_api = BilibiliAPI()
    bili_discoverer = BilibiliDiscoverer(api=bili_api)
    subtitle_extractor = BilibiliSubtitleExtractor(api=bili_api)

    # 音频转写
    audio_transcriber = AudioTranscriber()

    # 抖音组件
    douyin_discoverer = DouyinDiscoverer()

    # 蒸馏器
    distiller = LLMContentDistiller()

    # 存储
    knowledge_dir = Path(os.getenv("KNOWLEDGE_DIR", "../knowledge"))
    storage_dir = Path(os.getenv("STORAGE_DIR", "../storage/interview-collector"))

    markdown_store = MarkdownStore(knowledge_dir=knowledge_dir)
    json_store = JsonStore(storage_dir=storage_dir)
    state_store = StateStore(state_dir=storage_dir / "state")

    return InterviewCollectorPipeline(
        bilibili_discoverer=bili_discoverer,
        douyin_discoverer=douyin_discoverer,
        subtitle_extractor=subtitle_extractor,
        audio_transcriber=audio_transcriber,
        distiller=distiller,
        markdown_store=markdown_store,
        json_store=json_store,
        state_store=state_store,
    )


def run_ingest():
    """调用 ingest_knowledge.py 入库"""
    logger.info("开始知识入库...")
    try:
        result = subprocess.run(
            [sys.executable, "ingest_knowledge.py",
             "--knowledge-dir", "../knowledge",
             "--endpoint", os.getenv("VECTOR_STORE_URL", "http://localhost:8766")],
            cwd=str(Path(__file__).parent.parent / "differentiation-service"),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            logger.info("入库完成: %s", result.stdout.strip()[-200:])
        else:
            logger.error("入库失败: %s", result.stderr[-200:])
    except Exception as e:
        logger.error("入库执行异常: %s", e)


def main():
    """主入口"""
    # 加载环境变量
    load_env()

    # 配置日志
    setup_logging()

    logger.info("=" * 60)
    logger.info("博闻访谈视频收集与蒸馏流水线启动")
    logger.info("=" * 60)

    # 健康检查
    health_check()

    # 解析参数
    args = parse_args()
    logger.info("参数: platform=%s creator=%s general_search=%s discover_only=%s ingest=%s max_videos=%d",
                args.platform, args.creator, args.general_search,
                args.discover_only, args.ingest, args.max_videos)

    # 加载配置
    creators, general_search_configs = load_config()
    logger.info("已加载 %d 个创作者配置", len(creators))

    # 构建流水线
    pipeline = build_pipeline()

    # 执行
    all_stats = []

    if args.discover_only:
        # 仅发现模式
        platforms = ["bilibili", "douyin"] if args.platform == "all" else [args.platform]
        creator_keys = [c.key for c in creators] if args.creator == "all" else [args.creator]

        for platform in platforms:
            for key in creator_keys:
                videos = pipeline.discover_only(platform, key)
                if videos:
                    print(f"\n=== {platform} / {key}: {len(videos)} videos ===")
                    for v in videos[:10]:
                        print(f"  {v['id']} | {v['title'][:50]} | {v['duration']}s | views={v['view_count']}")
        return

    if args.general_search:
        # 泛搜索模式
        for config in general_search_configs:
            platform = config.get("platform", "bilibili")
            keywords = config.get("keywords", [])
            stats = pipeline.run_general_search(keywords, platform)
            all_stats.append(stats)
    else:
        # 指定创作者模式
        platforms = ["bilibili", "douyin"] if args.platform == "all" else [args.platform]
        creator_keys = [c.key for c in creators] if args.creator == "all" else [args.creator]

        for platform in platforms:
            for key in creator_keys:
                stats = pipeline.run_platform(platform, key, max_videos=args.max_videos)
                all_stats.append(stats)

    # 输出统计
    print("\n" + "=" * 60)
    print("处理统计汇总")
    print("=" * 60)
    for stats in all_stats:
        print(json.dumps(stats, ensure_ascii=False, indent=2))

    # 入库
    if args.ingest:
        run_ingest()

    # 状态统计
    state_store = pipeline._state_store
    state_stats = state_store.get_stats()
    print(f"\n累计处理: {state_stats['total']} 个视频，{state_stats['distilled']} 个已蒸馏")

    logger.info("流水线执行完毕")


if __name__ == "__main__":
    main()
