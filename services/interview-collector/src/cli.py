"""CLI 命令行入口 — argparse 参数解析"""

from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    """构建 CLI 参数解析器"""
    parser = argparse.ArgumentParser(
        description="博闻访谈视频收集与蒸馏流水线",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python main.py --platform bilibili --creator cheganxuan
  python main.py --platform all --creator all --max-videos 5
  python main.py --general-search --ingest
  python main.py --platform bilibili --creator cheganxuan --discover-only
        """
    )

    parser.add_argument(
        "--platform",
        choices=["bilibili", "douyin", "all"],
        default="bilibili",
        help="目标平台 (默认 bilibili)"
    )

    parser.add_argument(
        "--creator",
        default="all",
        help="创作者 key (cheganxuan/aiweiqi_vic/all，默认 all)"
    )

    parser.add_argument(
        "--general-search",
        action="store_true",
        help="泛搜索模式（按关键词搜索而非指定创作者）"
    )

    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="仅发现视频不处理（用于调试）"
    )

    parser.add_argument(
        "--ingest",
        action="store_true",
        help="处理后自动调用 ingest_knowledge.py 入库"
    )

    parser.add_argument(
        "--max-videos",
        type=int,
        default=0,
        help="限制单次处理视频数（0=不限制，调试用）"
    )

    return parser


def parse_args():
    """解析命令行参数"""
    return build_parser().parse_args()
