"""视频发现器抽象接口"""

from __future__ import annotations

from abc import ABC, abstractmethod
from ..domain.types import VideoMeta, CreatorConfig


class VideoDiscovererPort(ABC):
    """视频发现器端口 — 搜索平台上的视频"""

    @abstractmethod
    def discover(self, config: CreatorConfig) -> list[VideoMeta]:
        """发现创作者的视频列表

        Args:
            config: 创作者配置(含平台 UID 和过滤规则)

        Returns:
            视频元数据列表
        """
        ...

    @abstractmethod
    def search_general(self, keywords: list[str], min_metric: int = 0) -> list[VideoMeta]:
        """泛搜索模式 — 按关键词搜索

        Args:
            keywords: 搜索关键词列表
            min_metric: 最低互动量阈值(播放/点赞)

        Returns:
            视频元数据列表
        """
        ...
