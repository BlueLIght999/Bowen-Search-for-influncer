"""视频过滤规则 — 时长/标题/去重"""

from __future__ import annotations

from ..domain.types import VideoMeta, CreatorConfig


def apply_filters(
    videos: list[VideoMeta],
    config: CreatorConfig,
    processed_ids: set[str] | None = None
) -> list[VideoMeta]:
    """应用所有过滤规则

    1. 去重: 排除已处理的视频 ID
    2. 时长过滤: min_duration <= duration <= max_duration
    3. 标题关键词: 标题包含至少一个关键词(如果有配置)
    4. 标题排除: 排除包含排除词的视频
    """
    processed_ids = processed_ids or set()
    result: list[VideoMeta] = []

    for video in videos:
        # 去重
        if video.id in processed_ids:
            continue

        # 时长过滤
        if video.duration > 0:
            if video.duration < config.min_duration_seconds:
                continue
            if video.duration > config.max_duration_seconds:
                continue

        # 标题排除
        title_lower = video.title.lower()
        excluded = False
        for exclude_word in config.title_exclude:
            if exclude_word.lower() in title_lower:
                excluded = True
                break
        if excluded:
            continue

        # 标题关键词匹配 (如果配置了关键词)
        if config.title_keywords:
            matched = any(
                kw.lower() in title_lower
                for kw in config.title_keywords
            )
            if not matched:
                continue

        result.append(video)

    return result
