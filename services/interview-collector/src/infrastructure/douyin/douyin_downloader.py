"""抖音音频下载器 — 使用 f2 CLI 下载视频并提取音频"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger("interview-collector.douyin")


class DouyinDownloader:
    """抖音视频/音频下载器

    使用 f2 CLI 下载抖音视频原声
    需要: pip install f2 + DOUYIN_COOKIE 环境变量
    """

    def __init__(self, output_dir: Path | None = None):
        self._output_dir = output_dir or Path("/tmp/interview-collector/douyin")
        self._cookie = os.getenv("DOUYIN_COOKIE", "")

    def download_audio(self, video_url: str, video_id: str) -> Path | None:
        """下载抖音视频音频

        f2 dy -M one -u "URL" -k "cookie" -m true
        -m true 自动提取视频原声

        Returns:
            WAV 文件路径，失败返回 None
        """
        if not self._cookie:
            logger.warning("未设置 DOUYIN_COOKIE，无法下载抖音视频")
            return None

        self._output_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            "f2", "dy",
            "-M", "one",
            "-u", video_url,
            "-k", self._cookie,
            "-m", "true",
            "-p", str(self._output_dir),
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=120,
                check=False
            )

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")[:500]
                logger.error("f2 下载失败: %s", stderr)
                return None

        except FileNotFoundError:
            logger.error("f2 未安装，请运行: pip install f2")
            return None
        except subprocess.TimeoutExpired:
            logger.error("f2 下载超时: %s", video_url)
            return None

        # 查找下载的音频文件
        audio_files = list(self._output_dir.glob(f"*{video_id}*.*"))
        if not audio_files:
            # 查找最新文件
            all_files = sorted(
                self._output_dir.iterdir(),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            audio_files = [f for f in all_files if f.suffix in (".mp3", ".m4a", ".wav", ".aac")]

        if not audio_files:
            logger.error("f2 下载后未找到音频文件: %s", video_id)
            return None

        raw_path = audio_files[0]
        wav_path = self._output_dir / f"{video_id}.wav"

        # 如果已经是 wav 直接返回
        if raw_path.suffix == ".wav":
            return raw_path

        # FFmpeg 转 WAV
        from ..transcribe.bilibili_audio_downloader import BilibiliAudioDownloader
        if BilibiliAudioDownloader._convert_to_wav(raw_path, wav_path):
            raw_path.unlink(missing_ok=True)
            return wav_path

        logger.error("FFmpeg 转换失败: %s", video_id)
        return None
