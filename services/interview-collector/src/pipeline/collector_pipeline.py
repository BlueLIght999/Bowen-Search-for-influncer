"""主流水线编排 — 串联发现、转写、蒸馏、存储全链路"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from ..domain.types import VideoMeta, TranscriptResult, DistilledCase
from ..ports.discoverer import VideoDiscovererPort
from ..ports.transcriber import TranscriptExtractorPort
from ..ports.distiller import ContentDistillerPort
from ..infrastructure.storage.markdown_store import MarkdownStore
from ..infrastructure.storage.json_store import JsonStore
from ..infrastructure.storage.state_store import StateStore

logger = logging.getLogger("interview-collector.pipeline")


class InterviewCollectorPipeline:
    """访谈视频收集蒸馏流水线

    编排流程:
    discover → filter → extract transcript → distill → write MD → archive JSON → mark processed
    """

    def __init__(
        self,
        bilibili_discoverer: VideoDiscovererPort,
        douyin_discoverer: VideoDiscovererPort,
        subtitle_extractor: TranscriptExtractorPort | None,
        audio_transcriber: TranscriptExtractorPort,
        distiller: ContentDistillerPort,
        markdown_store: MarkdownStore,
        json_store: JsonStore,
        state_store: StateStore,
    ):
        self._bilibili_discoverer = bilibili_discoverer
        self._douyin_discoverer = douyin_discoverer
        self._subtitle_extractor = subtitle_extractor
        self._audio_transcriber = audio_transcriber
        self._distiller = distiller
        self._markdown_store = markdown_store
        self._json_store = json_store
        self._state_store = state_store
        self._logs_dir = Path("../storage/interview-collector/logs")

    def run_single(self, video: VideoMeta, creator_key: str) -> bool:
        """处理单个视频

        Returns:
            True 表示成功处理，False 表示跳过或失败
        """
        # Step 1: 检查是否已处理
        if self._state_store.is_processed(video.id):
            logger.info("跳过已处理视频: %s", video.id)
            return False

        try:
            # Step 2: 提取文稿
            transcript = self._extract_transcript(video)
            if not transcript:
                logger.error("文稿提取失败: %s", video.id)
                self._log_error(video, "transcript_extraction_failed")
                return False

            # Step 3: 蒸馏
            logger.info("开始蒸馏: %s", video.id)
            distilled = self._distiller.distill(video, transcript)

            # Step 4: 生成 Markdown
            md_path = self._markdown_store.write(video, transcript, distilled, creator_key)

            # Step 5: 归档 JSON
            json_path = self._json_store.archive(video, transcript, distilled, md_path)

            # Step 6: 标记已处理
            self._state_store.mark_processed_simple(
                video_id=video.id,
                platform=video.platform,
                creator=creator_key,
                title=video.title,
                transcript_source=transcript.source,
                distilled=True,
                markdown_path=str(md_path),
                json_path=str(json_path),
            )

            logger.info("处理完成: %s (source=%s, techniques=%d)",
                        video.id, transcript.source,
                        len(distilled.interview_techniques))
            return True

        except Exception as e:
            logger.error("处理失败 %s: %s", video.id, e, exc_info=True)
            self._log_error(video, str(e))
            return False

    def run_platform(self, platform: str, creator_key: str, max_videos: int = 0) -> dict:
        """处理指定平台和创作者

        Returns:
            统计信息 dict
        """
        from ..config import get_creator_by_key, load_config

        creators, _ = load_config()
        creator = get_creator_by_key(creators, creator_key)
        if not creator:
            logger.error("创作者未找到: %s", creator_key)
            return {"error": f"Creator not found: {creator_key}"}

        # 选择发现器
        if platform == "bilibili":
            discoverer = self._bilibili_discoverer
        elif platform == "douyin":
            discoverer = self._douyin_discoverer
        else:
            logger.error("不支持的平台: %s", platform)
            return {"error": f"Unsupported platform: {platform}"}

        # 发现视频
        logger.info("发现视频: platform=%s creator=%s", platform, creator_key)
        videos = discoverer.discover(creator)

        # 过滤已处理
        processed_ids = self._state_store.get_processed_ids()
        new_videos = [v for v in videos if v.id not in processed_ids]
        logger.info("发现 %d 视频，已处理 %d，待处理 %d",
                    len(videos), len(videos) - len(new_videos), len(new_videos))

        if max_videos > 0:
            new_videos = new_videos[:max_videos]
            logger.info("限制处理数量: %d", len(new_videos))

        # 逐个处理
        success = 0
        failed = 0
        for video in new_videos:
            if self.run_single(video, creator_key):
                success += 1
            else:
                failed += 1

        stats = {
            "platform": platform,
            "creator": creator_key,
            "total_found": len(videos),
            "already_processed": len(videos) - len(new_videos),
            "success": success,
            "failed": failed,
        }
        logger.info("平台处理完成: %s", stats)
        return stats

    def run_general_search(self, keywords: list[str], platform: str = "bilibili") -> dict:
        """泛搜索模式

        Returns:
            统计信息 dict
        """
        if platform == "bilibili":
            discoverer = self._bilibili_discoverer
        elif platform == "douyin":
            discoverer = self._douyin_discoverer
        else:
            return {"error": f"Unsupported platform: {platform}"}

        videos = discoverer.search_general(keywords)

        # 过滤已处理
        processed_ids = self._state_store.get_processed_ids()
        new_videos = [v for v in videos if v.id not in processed_ids]
        logger.info("泛搜索发现 %d 视频，待处理 %d", len(videos), len(new_videos))

        success = 0
        failed = 0
        for video in new_videos:
            if self.run_single(video, "general"):
                success += 1
            else:
                failed += 1

        return {
            "mode": "general_search",
            "platform": platform,
            "total_found": len(videos),
            "success": success,
            "failed": failed,
        }

    def discover_only(self, platform: str, creator_key: str) -> list[dict]:
        """仅发现视频不处理

        Returns:
            视频元数据列表（dict 格式）
        """
        from ..config import get_creator_by_key, load_config

        creators, _ = load_config()
        creator = get_creator_by_key(creators, creator_key)
        if not creator:
            return []

        if platform == "bilibili":
            discoverer = self._bilibili_discoverer
        elif platform == "douyin":
            discoverer = self._douyin_discoverer
        else:
            return []

        videos = discoverer.discover(creator)
        return [
            {
                "id": v.id,
                "title": v.title,
                "author": v.author,
                "url": v.url,
                "duration": v.duration,
                "view_count": v.view_count,
                "published_at": v.published_at,
            }
            for v in videos
        ]

    def _extract_transcript(self, video: VideoMeta) -> TranscriptResult | None:
        """提取文稿 — CC字幕优先，音频转写兜底"""
        # B站: 先尝试 CC 字幕
        if video.platform == "bilibili" and self._subtitle_extractor:
            result = self._subtitle_extractor.extract(video)
            if result:
                logger.info("CC字幕提取成功: %s", video.id)
                return result
            logger.info("无CC字幕，降级到音频转写: %s", video.id)

        # 音频转写兜底
        return self._audio_transcriber.extract(video)

    def _log_error(self, video: VideoMeta, error: str) -> None:
        """记录错误到 errors.jsonl"""
        self._logs_dir.mkdir(parents=True, exist_ok=True)
        error_file = self._logs_dir / "errors.jsonl"

        entry = {
            "video_id": video.id,
            "platform": video.platform,
            "title": video.title,
            "url": video.url,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        with open(error_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
