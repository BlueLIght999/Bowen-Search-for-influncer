"""B站 CC 字幕提取器 — 优先使用人工字幕，降级 AI 字幕"""

from __future__ import annotations

import logging

from ...domain.types import VideoMeta, TranscriptResult, TranscriptSegment
from ...ports.transcriber import TranscriptExtractorPort
from .bilibili_api import BilibiliAPI

logger = logging.getLogger("interview-collector.bilibili")


class BilibiliSubtitleExtractor(TranscriptExtractorPort):
    """B站 CC 字幕提取器

    提取流程:
    1. bvid → aid + cid (get_video_info)
    2. aid + cid → 字幕列表 (get_subtitle_info)
    3. 选择最佳字幕 → 下载 JSON (fetch_subtitle_json)
    4. 解析为 TranscriptResult

    字幕优先级: 人工字幕(zh-CN) > AI字幕(ai-zh) > 无字幕(返回None)
    """

    def __init__(self, api: BilibiliAPI | None = None):
        self._api = api or BilibiliAPI()

    def extract(self, video: VideoMeta) -> TranscriptResult | None:
        """提取视频字幕

        Returns:
            TranscriptResult 或 None(无字幕时触发音频兜底)
        """
        try:
            # Step 1: 获取 aid + cid
            video_info = self._api.get_video_info(video.id)
            if not video_info:
                logger.warning("无法获取视频信息: %s", video.id)
                return None

            aid = video_info.get("aid")
            cid = video_info.get("cid")
            if not aid or not cid:
                logger.warning("视频缺少 aid/cid: %s", video.id)
                return None

            # Step 2: 获取字幕列表
            subtitles = self._api.get_subtitle_info(aid, cid)
            if not subtitles:
                logger.info("视频无字幕: %s", video.id)
                return None

            # Step 3: 选择最佳字幕
            subtitle_url, subtitle_type = self._select_best_subtitle(subtitles)
            if not subtitle_url:
                logger.info("无可用中文字幕: %s (可用字幕: %s)",
                            video.id, [s.get("lan") for s in subtitles])
                return None

            # Step 4: 下载字幕 JSON
            subtitle_body = self._api.fetch_subtitle_json(subtitle_url)
            if not subtitle_body:
                logger.warning("字幕JSON下载失败: %s", video.id)
                return None

            # Step 5: 解析为 TranscriptResult
            segments = self._parse_subtitle_body(subtitle_body)
            if not segments:
                logger.warning("字幕解析为空: %s", video.id)
                return None

            full_text = " ".join(seg.text for seg in segments if seg.text).strip()
            duration = segments[-1].end if segments else 0.0

            logger.info("字幕提取成功: %s (source=%s, %d segments, %d chars)",
                        video.id, subtitle_type, len(segments), len(full_text))

            return TranscriptResult(
                source=subtitle_type,
                full_text=full_text,
                segments=segments,
                language="zh",
                duration=duration,
            )

        except Exception as e:
            logger.error("字幕提取异常 %s: %s", video.id, e)
            return None

    def _select_best_subtitle(self, subtitles: list[dict]) -> tuple[str, str]:
        """选择最佳字幕

        优先级: 人工中文字幕(zh-CN) > AI中文字幕(ai-zh)

        Returns:
            (subtitle_url, source_type) 或 ("", "")
        """
        # 优先: 人工中文字幕
        for sub in subtitles:
            lan = sub.get("lan", "")
            if lan == "zh-CN":
                url = sub.get("subtitle_url", "")
                if url:
                    return url, "cc_subtitle"

        # 次选: AI 中文字幕
        for sub in subtitles:
            lan = sub.get("lan", "")
            if lan.startswith("ai-zh") or lan == "zh-Hans":
                url = sub.get("subtitle_url", "")
                if url:
                    return url, "ai_subtitle"

        return "", ""

    @staticmethod
    def _parse_subtitle_body(body: list[dict]) -> list[TranscriptSegment]:
        """解析字幕 JSON body 为 TranscriptSegment 列表

        字幕格式: [{"from": 0.5, "to": 2.1, "content": "大家好"}, ...]
        """
        segments: list[TranscriptSegment] = []
        for item in body:
            if not isinstance(item, dict):
                continue
            text = str(item.get("content", "")).strip()
            if not text:
                continue
            start = float(item.get("from", 0))
            end = float(item.get("to", 0))
            segments.append(TranscriptSegment(start=start, end=end, text=text))
        return segments

    def close(self):
        self._api.close()
