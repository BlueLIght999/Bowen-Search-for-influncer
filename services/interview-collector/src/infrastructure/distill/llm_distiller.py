"""LLM 内容蒸馏器 — 从文稿中提取可复用的创作知识"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from ...domain.types import (
    VideoMeta,
    TranscriptResult,
    DistilledCase,
    InterviewTechnique,
    HookPattern,
    ContentStructure,
    ContentSection,
    CollectibleMoment,
    ViralitySignal,
)
from ...ports.distiller import ContentDistillerPort

logger = logging.getLogger("interview-collector.distill")

# 文稿最大字符数（超过则截断）
MAX_TRANSCRIPT_CHARS = 12000
TRANSCRIPT_HEAD = 6000
TRANSCRIPT_TAIL = 6000

# LLM 超时（秒）
LLM_TIMEOUT = 60

# Prompt 模板路径
PROMPT_PATH = Path(__file__).parent.parent.parent.parent / "config" / "prompts" / "distill_interview.txt"


class LLMContentDistiller(ContentDistillerPort):
    """LLM 内容蒸馏器

    使用 OpenAI 兼容接口调用 LLM，从访谈文稿中提取：
    - 访谈技巧
    - 钩子模式
    - 内容结构
    - 情绪设计
    - 收藏触发点
    - 可复用公式

    降级链: LLM JSON → repair retry → 规则降级提取
    """

    def __init__(self, prompt_path: Path | None = None):
        self._api_key = os.getenv("BOWEN_VLM_API_KEY", "")
        self._base_url = os.getenv("BOWEN_VLM_BASE_URL", "https://api.openai.com/v1")
        self._model = os.getenv("BOWEN_VLM_MODEL", "gpt-4o")
        self._prompt_path = prompt_path or PROMPT_PATH
        self._client = None

    def _get_client(self):
        """懒加载 OpenAI 客户端"""
        if self._client is None:
            if not self._api_key:
                raise ValueError("BOWEN_VLM_API_KEY 未设置")
            from openai import OpenAI
            self._client = OpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
                timeout=LLM_TIMEOUT,
            )
        return self._client

    def distill(self, video: VideoMeta, transcript: TranscriptResult) -> DistilledCase:
        """蒸馏内容

        Returns:
            DistilledCase 对象
        """
        # 文稿截断
        transcript_text = self._truncate_transcript(transcript.full_text)

        # 加载 prompt 模板
        prompt_template = self._load_prompt()
        prompt = prompt_template.format(
            title=video.title,
            author=video.author,
            duration=video.duration,
            platform=video.platform,
            transcript=transcript_text,
        )

        # 调用 LLM
        try:
            raw_response = self._call_llm(prompt)
            if not raw_response:
                logger.warning("LLM 返回空响应，使用规则降级: %s", video.id)
                return self._rule_based_fallback(video, transcript)

            # 解析 JSON
            data = json.loads(raw_response)
            case = self._build_distilled_case(data)
            logger.info("蒸馏成功: %s (techniques=%d, hooks=%d, formulas=%d)",
                        video.id,
                        len(case.interview_techniques),
                        len(case.hook_patterns),
                        len(case.reusable_formulas))
            return case

        except json.JSONDecodeError as e:
            logger.warning("JSON 解析失败，尝试 repair: %s", e)
            repaired = self._repair_retry(prompt, str(e))
            if repaired:
                try:
                    data = json.loads(repaired)
                    case = self._build_distilled_case(data)
                    logger.info("Repair 后蒸馏成功: %s", video.id)
                    return case
                except json.JSONDecodeError:
                    pass

            logger.warning("Repair 失败，使用规则降级: %s", video.id)
            return self._rule_based_fallback(video, transcript)

        except Exception as e:
            logger.error("蒸馏异常: %s — %s", video.id, e)
            return self._rule_based_fallback(video, transcript)

    def _truncate_transcript(self, text: str) -> str:
        """截断过长的文稿"""
        if len(text) <= MAX_TRANSCRIPT_CHARS:
            return text
        head = text[:TRANSCRIPT_HEAD]
        tail = text[-TRANSCRIPT_TAIL:]
        return f"{head}\n\n[...中间部分省略...]\n\n{tail}"

    def _load_prompt(self) -> str:
        """加载 prompt 模板"""
        if self._prompt_path.exists():
            return self._prompt_path.read_text(encoding="utf-8")
        logger.warning("Prompt 模板不存在: %s，使用内置模板", self._prompt_path)
        return DEFAULT_PROMPT

    def _call_llm(self, prompt: str) -> str | None:
        """调用 LLM 并返回原始文本"""
        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": "你是一位专业的短视频内容分析师，只输出JSON。"},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=4096,
            )
            return response.choices[0].message.content

        except Exception as e:
            logger.error("LLM 调用失败: %s", e)
            return None

    def _repair_retry(self, original_prompt: str, error_msg: str) -> str | None:
        """一次 repair retry — 让 LLM 修正格式"""
        repair_prompt = (
            f"你之前的输出存在 JSON 格式错误: {error_msg}\n"
            f"请重新输出正确的 JSON，确保：\n"
            f"1. 所有字符串值都用双引号包裹\n"
            f"2. 没有尾随逗号\n"
            f"3. 只输出 JSON，不要输出其他内容"
        )

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": "你是一位专业的短视频内容分析师，只输出JSON。"},
                    {"role": "user", "content": original_prompt},
                    {"role": "assistant", "content": "(之前的输出有格式错误)"},
                    {"role": "user", "content": repair_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=4096,
            )
            return response.choices[0].message.content

        except Exception as e:
            logger.error("Repair retry 失败: %s", e)
            return None

    @staticmethod
    def _build_distilled_case(data: dict) -> DistilledCase:
        """从 JSON dict 构建 DistilledCase"""
        # 访谈技巧
        techniques = []
        for item in data.get("interview_techniques", []):
            if not isinstance(item, dict):
                continue
            techniques.append(InterviewTechnique(
                technique=item.get("technique", ""),
                description=item.get("description", ""),
                example_quote=item.get("example_quote", ""),
                timestamp_range=item.get("timestamp_range", ""),
                applicable_scene=item.get("applicable_scene", ""),
            ))

        # 钩子模式
        hooks = []
        for item in data.get("hook_patterns", []):
            if not isinstance(item, dict):
                continue
            hooks.append(HookPattern(
                pattern=item.get("pattern", ""),
                opening_line=item.get("opening_line", ""),
                psychological_trigger=item.get("psychological_trigger", ""),
                retention_mechanism=item.get("retention_mechanism", ""),
                score_estimate=int(item.get("score_estimate", 0)),
            ))

        # 内容结构
        content_structure = None
        cs_data = data.get("content_structure")
        if isinstance(cs_data, dict):
            sections = []
            for sec in cs_data.get("sections", []):
                if isinstance(sec, dict):
                    sections.append(ContentSection(
                        name=sec.get("name", ""),
                        duration_ratio=float(sec.get("duration_ratio", 0)),
                        purpose=sec.get("purpose", ""),
                        technique=sec.get("technique", ""),
                    ))
            content_structure = ContentStructure(
                overall_structure=cs_data.get("overall_structure", ""),
                sections=sections,
                rhythm_pattern=cs_data.get("rhythm_pattern", ""),
            )

        # 情绪设计
        emotional_design = data.get("emotional_design", {})
        if not isinstance(emotional_design, dict):
            emotional_design = {}

        # 收藏触发点
        moments = []
        for item in data.get("collectible_moments", []):
            if not isinstance(item, dict):
                continue
            moments.append(CollectibleMoment(
                moment=item.get("moment", ""),
                reason=item.get("reason", ""),
                timestamp_range=item.get("timestamp_range", ""),
            ))

        # 可复用公式
        formulas = [str(f) for f in data.get("reusable_formulas", []) if f]

        # 传播力信号（8 维框架）
        virality_signals = []
        for item in data.get("virality_signals", []):
            if not isinstance(item, dict):
                continue
            virality_signals.append(ViralitySignal(
                dimension=item.get("dimension", ""),
                matched_text=item.get("matched_text", ""),
                score=int(item.get("score", 0)),
                reason=item.get("reason", ""),
            ))

        return DistilledCase(
            interview_techniques=techniques,
            hook_patterns=hooks,
            virality_signals=virality_signals,
            content_structure=content_structure,
            emotional_design=emotional_design,
            collectible_moments=moments,
            reusable_formulas=formulas,
        )

    @staticmethod
    def _rule_based_fallback(video: VideoMeta, transcript: TranscriptResult) -> DistilledCase:
        """规则降级提取 — 当 LLM 不可用或输出无法解析时

        从文稿中用简单规则提取一些基本信息
        """
        text = transcript.full_text
        segments = transcript.segments

        # 提取前 3 句作为钩子候选
        hook_patterns = []
        if segments:
            opening = segments[0].text if segments else ""
            if opening:
                hook_patterns.append(HookPattern(
                    pattern="开场白",
                    opening_line=opening[:100],
                    psychological_trigger="未分析（规则降级）",
                    retention_mechanism="未分析（规则降级）",
                    score_estimate=0,
                ))

        # 提取包含问号的句子作为访谈技巧候选
        techniques = []
        question_pattern = re.compile(r"[^。！？]*[？?][^。！？]*")
        for match in question_pattern.finditer(text):
            quote = match.group().strip()
            if len(quote) > 10:
                techniques.append(InterviewTechnique(
                    technique="提问技巧",
                    description="通过提问引导受访者分享",
                    example_quote=quote[:200],
                    timestamp_range="",
                    applicable_scene="访谈类内容",
                ))
            if len(techniques) >= 3:
                break

        # 基本结构
        content_structure = ContentStructure(
            overall_structure="未分析（规则降级）",
            sections=[],
            rhythm_pattern="",
        )

        # 默认公式
        formulas = [
            "开场建立场景 → 提问引导 → 深入追问 → 总结金句",
            "用受访者原话作为标题或封面文案",
        ]

        logger.info("规则降级提取: %d techniques, %d hooks", len(techniques), len(hook_patterns))

        return DistilledCase(
            interview_techniques=techniques,
            hook_patterns=hook_patterns,
            content_structure=content_structure,
            emotional_design={},
            collectible_moments=[],
            reusable_formulas=formulas,
        )


# 内置 prompt 模板（当文件不存在时使用）
DEFAULT_PROMPT = """你是一位专业的短视频内容分析师。请分析以下访谈视频文稿，提取可复用的创作知识。

## 视频信息
标题: {title}
作者: {author}
时长: {duration}秒
平台: {platform}

## 视频文稿
{transcript}

## 请按以下 JSON 格式输出分析结果:
{{
  "interview_techniques": [
    {{"technique": "", "description": "", "example_quote": "", "timestamp_range": "", "applicable_scene": ""}}
  ],
  "hook_patterns": [
    {{"pattern": "", "opening_line": "", "psychological_trigger": "", "retention_mechanism": "", "score_estimate": 75}}
  ],
  "content_structure": {{
    "overall_structure": "", "sections": [], "rhythm_pattern": ""
  }},
  "emotional_design": {{"primary_emotion": "", "emotion_arc": "", "climax_point": ""}},
  "collectible_moments": [{{"moment": "", "reason": "", "timestamp_range": ""}}],
  "reusable_formulas": []
}}

只输出 JSON，不要输出其他内容。"""
