"""抖音视频发现器 — 通过 f2 CLI 获取创作者视频列表"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import datetime

from ...domain.types import VideoMeta, CreatorConfig
from ...domain.filters import apply_filters
from ...ports.discoverer import VideoDiscovererPort

logger = logging.getLogger("interview-collector.douyin")


class DouyinDiscoverer(VideoDiscovererPort):
    """抖音视频发现器

    使用 f2 CLI 获取创作者视频列表
    需要: pip install f2 + DOUYIN_COOKIE 环境变量
    """

    def __init__(self, output_dir: str = "/tmp/interview-collector/douyin"):
        self._output_dir = output_dir
        self._cookie = os.getenv("DOUYIN_COOKIE", "")

    def discover(self, config: CreatorConfig) -> list[VideoMeta]:
        """发现创作者的抖音视频"""
        if not self._cookie:
            logger.warning("未设置 DOUYIN_COOKIE，抖音发现器不可用")
            return []

        if not config.douyin_sec_uid:
            logger.info("创作者 %s 无抖音 sec_uid", config.name)
            return []

        # f2 -M post 获取创作者主页视频
        user_url = f"https://www.douyin.com/user/{config.douyin_sec_uid}"
        raw_videos = self._fetch_via_f2(user_url, mode="post")

        if not raw_videos:
            logger.warning("f2 未返回视频数据: %s", config.name)
            return []

        videos = [self._map_video(v, config.name) for v in raw_videos]
        filtered = apply_filters(videos, config, set())
        logger.info("抖音发现 %d 视频，过滤后 %d", len(videos), len(filtered))
        return filtered

    def search_general(self, keywords: list[str], min_metric: int = 0) -> list[VideoMeta]:
        """泛搜索模式 — 抖音不支持直接搜索，返回空"""
        logger.warning("抖音泛搜索尚未实现（f2 不直接支持关键词搜索）")
        return []

    def _fetch_via_f2(self, url: str, mode: str = "post") -> list[dict]:
        """通过 f2 CLI 获取视频列表

        f2 dy -M post -u "URL" -k "cookie" -o JSON
        """
        import tempfile

        work_dir = tempfile.mkdtemp(prefix="f2-douyin-")

        cmd = [
            "f2", "dy",
            "-M", mode,
            "-u", url,
            "-k", self._cookie,
            "-p", work_dir,
            "-o", "json",
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60,
                check=False
            )

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")[:500]
                logger.error("f2 执行失败: %s", stderr)
                return []

            # f2 可能输出 JSON 到 stdout 或写入文件
            stdout = result.stdout.decode("utf-8", errors="replace").strip()
            if stdout:
                try:
                    data = json.loads(stdout)
                    if isinstance(data, list):
                        return data
                    if isinstance(data, dict) and "data" in data:
                        return data["data"]
                except json.JSONDecodeError:
                    pass

            # 尝试从输出目录读取 JSON 文件
            import glob
            json_files = glob.glob(f"{work_dir}/*.json")
            for jf in json_files:
                try:
                    with open(jf, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            return data
                        if isinstance(data, dict) and "data" in data:
                            return data["data"]
                except (json.JSONDecodeError, IOError):
                    continue

            return []

        except FileNotFoundError:
            logger.error("f2 未安装，请运行: pip install f2")
            return []
        except subprocess.TimeoutExpired:
            logger.error("f2 执行超时")
            return []

    @staticmethod
    def _map_video(raw: dict, author: str = "") -> VideoMeta:
        """映射 f2 视频数据为 VideoMeta"""
        video_id = str(raw.get("aweme_id", raw.get("id", "")))
        desc = raw.get("desc", "")
        create_time = raw.get("create_time", 0)

        published_at = ""
        if create_time:
            try:
                published_at = datetime.fromtimestamp(int(create_time)).isoformat()
            except (ValueError, TypeError):
                pass

        stats = raw.get("statistics", raw.get("stats", {}))

        return VideoMeta(
            id=video_id,
            platform="douyin",
            title=desc[:100] if desc else f"抖音视频{video_id}",
            author=raw.get("nickname", author),
            url=f"https://www.douyin.com/video/{video_id}",
            duration=raw.get("duration", 0) // 1000 if raw.get("duration") else 0,
            view_count=stats.get("play_count", stats.get("digg_count", 0)),
            like_count=stats.get("digg_count", 0),
            favorite_count=stats.get("collect_count", 0),
            comment_count=stats.get("comment_count", 0),
            published_at=published_at,
            cover_url=raw.get("cover", raw.get("origin_cover", "")),
            description=desc,
        )
