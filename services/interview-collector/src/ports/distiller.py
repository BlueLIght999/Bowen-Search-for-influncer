"""内容蒸馏器抽象接口"""

from __future__ import annotations

from abc import ABC, abstractmethod
from ..domain.types import VideoMeta, TranscriptResult, DistilledCase


class ContentDistillerPort(ABC):
    """内容蒸馏器端口 — 从文稿中提取可复用的创作知识"""

    @abstractmethod
    def distill(self, video: VideoMeta, transcript: TranscriptResult) -> DistilledCase:
        """蒸馏内容

        Args:
            video: 视频元数据
            transcript: 转写结果

        Returns:
            蒸馏后的案例知识
        """
        ...
