"""B站音频下载器 — DASH 音频流下载 + FFmpeg 转 WAV"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

from ..bilibili.bilibili_api import BilibiliAPI

logger = logging.getLogger("interview-collector.transcribe")


class BilibiliAudioDownloader:
    """B站音频下载器

    流程: bvid → get_video_info(aid+cid) → get_playurl(dash.audio[]) → 下载 → FFmpeg 转 WAV
    """

    def __init__(self, api: BilibiliAPI | None = None):
        self._api = api or BilibiliAPI()

    def download_audio(self, bvid: str, output_dir: Path) -> Path | None:
        """下载视频音频并转换为 16kHz 单声道 WAV

        Args:
            bvid: B站视频 BV号
            output_dir: 输出目录

        Returns:
            WAV 文件路径，失败返回 None
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: 获取 aid + cid
        video_info = self._api.get_video_info(bvid)
        if not video_info:
            logger.error("无法获取视频信息: %s", bvid)
            return None

        aid = video_info.get("aid")
        cid = video_info.get("cid")
        if not aid or not cid:
            logger.error("视频缺少 aid/cid: %s", bvid)
            return None

        # Step 2: 获取 DASH 播放地址
        playurl_data = self._api.get_playurl(bvid, cid)
        if not playurl_data:
            logger.error("无法获取播放地址: %s", bvid)
            return None

        dash = playurl_data.get("dash")
        if not dash:
            logger.error("响应中无 DASH 数据: %s", bvid)
            return None

        audio_streams = dash.get("audio", [])
        if not audio_streams:
            logger.error("无音频流: %s", bvid)
            return None

        # Step 3: 下载音频流（优先 baseUrl，失败用 backup_url）
        audio_url = audio_streams[0].get("baseUrl", "") or audio_streams[0].get("base_url", "")
        raw_path = output_dir / f"{bvid}.m4a"

        if not self._api.download_audio_stream(audio_url, raw_path):
            # 尝试 backup_url
            backup_urls = audio_streams[0].get("backup_url", []) or audio_streams[0].get("backupUrl", [])
            for backup in backup_urls:
                if self._api.download_audio_stream(backup, raw_path):
                    break
            else:
                logger.error("所有音频流 URL 下载失败: %s", bvid)
                return None

        # Step 4: FFmpeg 转 16kHz 单声道 WAV
        wav_path = output_dir / f"{bvid}.wav"
        if not self._convert_to_wav(raw_path, wav_path):
            logger.error("FFmpeg 转换失败: %s", bvid)
            raw_path.unlink(missing_ok=True)
            return None

        # 清理原始文件
        raw_path.unlink(missing_ok=True)

        logger.info("音频下载转换完成: %s → %s", bvid, wav_path.name)
        return wav_path

    @staticmethod
    def _convert_to_wav(input_path: Path, output_path: Path) -> bool:
        """用 FFmpeg 将音频转为 16kHz 单声道 WAV

        FunASR 要求: 16kHz, mono, PCM
        """
        ffmpeg_exe = BilibiliAudioDownloader._find_ffmpeg()
        if not ffmpeg_exe:
            logger.error("未找到 FFmpeg，无法转换音频")
            return False

        cmd = [
            ffmpeg_exe, "-y",
            "-i", str(input_path),
            "-ar", "16000",   # 16kHz
            "-ac", "1",       # 单声道
            "-f", "wav",
            str(output_path)
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60,
                check=False
            )
            if result.returncode != 0:
                logger.error("FFmpeg 错误: %s", result.stderr.decode("utf-8", errors="replace")[:500])
                return False
            return output_path.exists()
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg 转换超时")
            return False
        except Exception as e:
            logger.error("FFmpeg 执行异常: %s", e)
            return False

    @staticmethod
    def _find_ffmpeg() -> str | None:
        """查找 FFmpeg 可执行文件

        查找顺序:
        1. PATH 中的 ffmpeg
        2. winget 安装的 Gyan.FFmpeg
        """
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            return ffmpeg

        # Windows winget 安装路径
        local_appdata = os.getenv("LOCALAPPDATA")
        if local_appdata:
            packages = Path(local_appdata) / "Microsoft" / "WinGet" / "Packages"
            if packages.is_dir():
                for exe in packages.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"):
                    return str(exe)

        return None

    def close(self):
        self._api.close()
