"""音频转写编排器 — 下载音频 → FunASR → Whisper 三级降级"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

import httpx

from ...domain.types import VideoMeta, TranscriptResult, TranscriptSegment
from ...ports.transcriber import TranscriptExtractorPort
from .bilibili_audio_downloader import BilibiliAudioDownloader
from .whisper_fallback import WhisperTranscriber

logger = logging.getLogger("interview-collector.transcribe")


class AudioTranscriber(TranscriptExtractorPort):
    """音频转写编排器

    降级链:
    1. 下载音频（B站用 DASH 流，抖音用 f2）
    2. FunASR 转写（POST /transcribe-file）
    3. FunASR 不可用 → Whisper 本地转写
    4. Whisper 也失败 → 标题+简介 fallback
    """

    def __init__(
        self,
        funasr_url: str | None = None,
        bilibili_downloader: BilibiliAudioDownloader | None = None,
        whisper: WhisperTranscriber | None = None,
        audio_dir: Path | None = None,
    ):
        self._funasr_url = funasr_url or os.getenv("FUNASR_SERVICE_URL", "http://localhost:8765")
        self._bilibili_downloader = bilibili_downloader or BilibiliAudioDownloader()
        self._whisper = whisper or WhisperTranscriber()
        self._audio_dir = audio_dir or Path(tempfile.gettempdir()) / "interview-collector"

    def extract(self, video: VideoMeta) -> TranscriptResult | None:
        """提取视频文稿（音频转写路径）

        Returns:
            TranscriptResult，所有方式失败返回 None
        """
        # Step 1: 下载音频
        audio_path = self._download_audio(video)
        if not audio_path:
            logger.error("音频下载失败: %s", video.id)
            return self._fallback_transcript(video)

        try:
            # Step 2: 尝试 FunASR
            result = self._transcribe_with_funasr(audio_path)
            if result:
                return result

            # Step 3: FunASR 失败 → Whisper
            logger.info("FunASR 不可用，降级到 Whisper: %s", video.id)
            result = self._whisper.transcribe(audio_path)
            if result:
                return result

            # Step 4: 全部失败 → fallback
            logger.warning("所有转写方式失败，使用 fallback: %s", video.id)
            return self._whisper.transcribe_fallback(video.title, video.description)

        finally:
            # 清理临时音频
            if audio_path and audio_path.exists():
                try:
                    audio_path.unlink()
                except Exception:
                    pass

    def _download_audio(self, video: VideoMeta) -> Path | None:
        """根据平台选择下载器"""
        if video.platform == "bilibili":
            return self._bilibili_downloader.download_audio(video.id, self._audio_dir)
        elif video.platform == "douyin":
            return self._download_douyin_audio(video)
        else:
            logger.error("不支持的平台: %s", video.platform)
            return None

    def _download_douyin_audio(self, video: VideoMeta) -> Path | None:
        """下载抖音视频音频（通过 f2 CLI）"""
        import subprocess

        cookie = os.getenv("DOUYIN_COOKIE", "")
        if not cookie:
            logger.warning("未设置 DOUYIN_COOKIE，无法下载抖音视频")
            return None

        self._audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = self._audio_dir / f"{video.id}"

        cmd = [
            "f2", "dy", "-M", "one",
            "-u", video.url,
            "-k", cookie,
            "-m", "true",
            "-p", str(self._audio_dir),
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=120, check=False)
            if result.returncode != 0:
                logger.error("f2 下载失败: %s", result.stderr.decode("utf-8", errors="replace")[:500])
                return None
        except FileNotFoundError:
            logger.error("f2 未安装，请运行: pip install f2")
            return None
        except subprocess.TimeoutExpired:
            logger.error("f2 下载超时: %s", video.id)
            return None

        # f2 输出文件名不确定，查找目录中的音频文件
        audio_files = list(self._audio_dir.glob(f"*{video.id}*.*"))
        if not audio_files:
            # 尝试查找最新的音频文件
            audio_files = sorted(
                self._audio_dir.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True
            )

        if not audio_files:
            logger.error("f2 下载后未找到音频文件: %s", video.id)
            return None

        raw_path = audio_files[0]
        wav_path = self._audio_dir / f"{video.id}.wav"

        # 如果已经是 wav 直接返回
        if raw_path.suffix == ".wav":
            return raw_path

        # 转换为 wav
        from .bilibili_audio_downloader import BilibiliAudioDownloader
        if BilibiliAudioDownloader._convert_to_wav(None, raw_path, wav_path):
            raw_path.unlink(missing_ok=True)
            return wav_path

        return None

    def _transcribe_with_funasr(self, audio_path: Path) -> TranscriptResult | None:
        """调用 FunASR /transcribe-file 端点"""
        try:
            with httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                resp = client.post(
                    f"{self._funasr_url}/transcribe-file",
                    json={"audioPath": str(audio_path)},
                )
                if resp.status_code != 200:
                    logger.warning("FunASR 返回 %s: %s", resp.status_code, resp.text[:200])
                    return None

                data = resp.json()
                segments = [
                    TranscriptSegment(
                        start=seg.get("start", 0),
                        end=seg.get("end", 0),
                        text=seg.get("text", "")
                    )
                    for seg in data.get("segments", [])
                    if seg.get("text")
                ]

                full_text = data.get("fullText", "")
                if not full_text and segments:
                    full_text = " ".join(s.text for s in segments)

                if not full_text:
                    return None

                return TranscriptResult(
                    source=data.get("source", "funasr"),
                    full_text=full_text,
                    segments=segments,
                    language="zh",
                    duration=data.get("duration", 0.0),
                )

        except httpx.ConnectError:
            logger.warning("FunASR 服务不可用: %s", self._funasr_url)
            return None
        except Exception as e:
            logger.error("FunASR 调用异常: %s", e)
            return None

    def _fallback_transcript(self, video: VideoMeta) -> TranscriptResult:
        """生成 fallback 文稿（标题+简介）"""
        return self._whisper.transcribe_fallback(video.title, video.description)

    def close(self):
        self._bilibili_downloader.close()
