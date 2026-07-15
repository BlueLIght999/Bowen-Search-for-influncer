"""B站视频发现器 — UP主视频列表 + 关键词搜索"""

from __future__ import annotations

import logging
from datetime import datetime

from ...domain.types import VideoMeta, CreatorConfig
from ...domain.filters import apply_filters
from ...ports.discoverer import VideoDiscovererPort
from .bilibili_api import BilibiliAPI

logger = logging.getLogger("interview-collector.bilibili")


class BilibiliDiscoverer(VideoDiscovererPort):
    """B站视频发现器

    搜索策略 (三级降级):
    1. UID 直查: 获取 UP 主全部视频列表
    2. 关键词搜索: 按创作者名搜索
    3. 返回空列表 (触发泛搜索)
    """

    def __init__(self, api: BilibiliAPI | None = None):
        self._api = api or BilibiliAPI()

    def discover(self, config: CreatorConfig) -> list[VideoMeta]:
        """发现创作者的视频"""
        videos: list[VideoMeta] = []

        # 策略 1: UID 直查
        if config.bilibili_uid:
            logger.info("Fetching videos by UID: %s", config.bilibili_uid)
            raw_videos = self._api.fetch_up_videos(config.bilibili_uid, page=1, page_size=30)
            videos = [self._map_up_video(v) for v in raw_videos]
            logger.info("Found %d videos by UID", len(videos))

        # 策略 2: 关键词搜索
        if not videos and config.bilibili_search_keyword:
            logger.info("Searching by keyword: %s", config.bilibili_search_keyword)
            raw_results = self._api.search_videos(config.bilibili_search_keyword, page=1, page_size=20)
            videos = [self._map_search_result(r) for r in raw_results]
            logger.info("Found %d videos by keyword", len(videos))

        # 应用过滤器(时长/标题)，去重由 pipeline 层处理
        filtered = apply_filters(videos, config, set())
        logger.info("After filters: %d videos", len(filtered))

        return filtered

    def search_general(self, keywords: list[str], min_metric: int = 0) -> list[VideoMeta]:
        """泛搜索模式"""
        all_results: list[VideoMeta] = []
        seen_ids: set[str] = set()

        for keyword in keywords:
            logger.info("General search: %s", keyword)
            raw_results = self._api.search_videos(keyword, page=1, page_size=20)

            for item in raw_results:
                video = self._map_search_result(item)

                # 去重
                if video.id in seen_ids:
                    continue
                seen_ids.add(video.id)

                # 互动量过滤
                if min_metric > 0 and video.view_count < min_metric:
                    continue

                all_results.append(video)

        logger.info("General search found %d unique videos", len(all_results))
        return all_results

    def _map_up_video(self, raw: dict) -> VideoMeta:
        """映射 UP主视频列表响应为 VideoMeta"""
        return VideoMeta(
            id=raw.get("bvid", ""),
            platform="bilibili",
            title=raw.get("title", "").replace("<em class=\"keyword\">", "").replace("</em>", ""),
            author=raw.get("author", ""),
            url=f"https://www.bilibili.com/video/{raw.get('bvid', '')}",
            duration=self._parse_duration(raw.get("length", "0:00")),
            view_count=raw.get("play", 0),
            like_count=0,  # UP列表接口不返回点赞
            favorite_count=0,
            comment_count=raw.get("video_review", 0),
            published_at=datetime.fromtimestamp(
                raw.get("created", 0)
            ).isoformat() if raw.get("created") else "",
            cover_url=raw.get("pic", ""),
            description=raw.get("description", ""),
        )

    def _map_search_result(self, raw: dict) -> VideoMeta:
        """映射搜索结果为 VideoMeta"""
        return VideoMeta(
            id=raw.get("bvid", ""),
            platform="bilibili",
            title=raw.get("title", "").replace("<em class=\"keyword\">", "").replace("</em>", ""),
            author=raw.get("author", ""),
            url=f"https://www.bilibili.com/video/{raw.get('bvid', '')}",
            duration=self._parse_duration(raw.get("duration", 0)),
            view_count=raw.get("play", 0),
            like_count=raw.get("like", 0),
            favorite_count=raw.get("favorites", 0),
            comment_count=raw.get("review", 0),
            published_at=datetime.fromtimestamp(
                raw.get("pubdate", 0)
            ).isoformat() if raw.get("pubdate") else "",
            cover_url=raw.get("pic", "").replace("//", "https://"),
            description=raw.get("description", ""),
        )

    @staticmethod
    def _parse_duration(value) -> int:
        """解析时长为秒数

        支持格式: "15:32" (MM:SS) 或 int (秒)
        """
        if isinstance(value, int):
            return value
        if isinstance(value, str) and ":" in value:
            parts = value.split(":")
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        try:
            return int(value)
        except (ValueError, TypeError):
            return 0

    def close(self):
        self._api.close()
