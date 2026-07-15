"""文稿提取器抽象接口"""

from __future__ import annotations

from abc import ABC, abstractmethod
from ..domain.types import VideoMeta, TranscriptResult


class TranscriptExtractorPort(ABC):
    """文稿提取器端口 — 从视频中提取文字文稿"""

    @abstractmethod
    def extract(self, video: VideoMeta) -> TranscriptResult | None:
        """提取视频文稿

        Args:
            video: 视频元数据

        Returns:
            转写结果，失败返回 None
        """
        ...
