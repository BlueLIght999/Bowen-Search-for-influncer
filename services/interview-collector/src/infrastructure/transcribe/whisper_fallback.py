"""Whisper 兜底转写 — 使用 faster-whisper 本地转写"""

from __future__ import annotations

import logging
from pathlib import Path

from ...domain.types import TranscriptResult, TranscriptSegment

logger = logging.getLogger("interview-collector.transcribe")


class WhisperTranscriber:
    """Whisper 本地转写器

    使用 faster-whisper 包，模型 small（中文优化）
    首次运行自动下载模型到 ~/.cache/whisper/
    """

    def __init__(self, model_size: str = "small", device: str = "cpu"):
        self._model_size = model_size
        self._device = device
        self._model = None

    def _get_model(self):
        """懒加载 Whisper 模型"""
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
                logger.info("加载 Whisper 模型: %s (device=%s)", self._model_size, self._device)
                self._model = WhisperModel(
                    self._model_size,
                    device=self._device,
                    compute_type="int8" if self._device == "cpu" else "float16"
                )
            except ImportError:
                logger.error("faster-whisper 未安装，请运行: pip install faster-whisper")
                raise
            except Exception as e:
                logger.error("Whisper 模型加载失败: %s", e)
                raise
        return self._model

    def transcribe(self, audio_path: Path) -> TranscriptResult | None:
        """转写音频文件

        Args:
            audio_path: WAV 音频文件路径

        Returns:
            TranscriptResult，失败返回 None
        """
        if not audio_path.exists():
            logger.error("音频文件不存在: %s", audio_path)
            return None

        try:
            model = self._get_model()
            logger.info("开始 Whisper 转写: %s", audio_path.name)

            segments_iter, info = model.transcribe(
                str(audio_path),
                language="zh",
                beam_size=5,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500}
            )

            segments: list[TranscriptSegment] = []
            for seg in segments_iter:
                text = seg.text.strip()
                if text:
                    segments.append(TranscriptSegment(
                        start=round(seg.start, 3),
                        end=round(seg.end, 3),
                        text=text
                    ))

            if not segments:
                logger.warning("Whisper 转写结果为空: %s", audio_path.name)
                return None

            full_text = " ".join(s.text for s in segments).strip()
            duration = info.duration if hasattr(info, "duration") else 0.0

            logger.info("Whisper 转写完成: %d segments, %d chars",
                        len(segments), len(full_text))

            return TranscriptResult(
                source="whisper",
                full_text=full_text,
                segments=segments,
                language="zh",
                duration=duration,
            )

        except Exception as e:
            logger.error("Whisper 转写异常: %s", e)
            return None

    def transcribe_fallback(self, title: str, description: str) -> TranscriptResult:
        """最终兜底：用标题+简介生成 fallback 文稿

        当所有转写方式都失败时使用
        """
        parts = [p for p in [title, description] if p and p.strip()]
        full_text = "\n".join(parts).strip() or "（无文稿内容）"

        logger.warning("使用 fallback 文稿: %d chars", len(full_text))

        return TranscriptResult(
            source="fallback",
            full_text=full_text,
            segments=[TranscriptSegment(start=0, end=0, text=full_text)],
            language="zh",
            duration=0.0,
        )
