"""博闻访谈视频收集与蒸馏流水线 — 领域类型定义"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class VideoMeta:
    """视频元数据（统一格式，跨平台）"""
    id: str                    # BV号(B站) 或 视频ID(抖音)
    platform: str              # "bilibili" | "douyin"
    title: str
    author: str
    url: str
    duration: int = 0          # 秒
    view_count: int = 0
    like_count: int = 0
    favorite_count: int = 0
    comment_count: int = 0
    published_at: str = ""     # ISO 8601
    cover_url: str = ""
    description: str = ""


@dataclass
class TranscriptSegment:
    """转写片段"""
    start: float
    end: float
    text: str


@dataclass
class TranscriptResult:
    """转写结果"""
    source: str                # "cc_subtitle" | "ai_subtitle" | "funasr" | "whisper" | "fallback"
    full_text: str
    segments: list[TranscriptSegment] = field(default_factory=list)
    language: str = "zh"
    duration: float = 0.0


@dataclass
class InterviewTechnique:
    """访谈技巧"""
    technique: str
    description: str
    example_quote: str
    timestamp_range: str
    applicable_scene: str


@dataclass
class HookPattern:
    """钩子模式"""
    pattern: str
    opening_line: str
    psychological_trigger: str
    retention_mechanism: str
    score_estimate: int = 0


@dataclass
class ContentSection:
    """内容结构片段"""
    name: str
    duration_ratio: float
    purpose: str
    technique: str


@dataclass
class ContentStructure:
    """内容结构"""
    overall_structure: str
    sections: list[ContentSection] = field(default_factory=list)
    rhythm_pattern: str = ""


@dataclass
class CollectibleMoment:
    """收藏触发点"""
    moment: str
    reason: str
    timestamp_range: str = ""


@dataclass
class ViralitySignal:
    """传播力信号（适配自 VIRALITY_CRITERIA 8 维框架）"""
    dimension: str       # hook|emotional|opinion|revelation|conflict|quotable|story|practical
    matched_text: str    # 文稿原文片段
    score: int           # 0-100
    reason: str          # 为什么命中该维度


@dataclass
class DistilledCase:
    """蒸馏后的案例知识"""
    interview_techniques: list[InterviewTechnique] = field(default_factory=list)
    hook_patterns: list[HookPattern] = field(default_factory=list)
    virality_signals: list[ViralitySignal] = field(default_factory=list)
    content_structure: ContentStructure | None = None
    emotional_design: dict[str, Any] = field(default_factory=dict)
    collectible_moments: list[CollectibleMoment] = field(default_factory=list)
    reusable_formulas: list[str] = field(default_factory=list)


@dataclass
class ProcessedVideoEntry:
    """已处理视频状态记录"""
    platform: str
    creator: str
    title: str
    processed_at: str
    transcript_source: str
    distilled: bool
    markdown_path: str = ""
    json_path: str = ""


@dataclass
class CreatorConfig:
    """创作者配置"""
    key: str
    name: str
    description: str = ""
    bilibili_uid: str = ""
    bilibili_search_keyword: str = ""
    douyin_sec_uid: str = ""
    douyin_search_keyword: str = ""
    min_duration_seconds: int = 120
    max_duration_seconds: int = 1800
    title_keywords: list[str] = field(default_factory=list)
    title_exclude: list[str] = field(default_factory=list)
