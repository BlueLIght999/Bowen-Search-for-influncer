"""B站 API 封装 — WBI 签名、UP主视频列表、关键词搜索"""

from __future__ import annotations

import hashlib
import logging
import random
import time
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("interview-collector.bilibili")

BILI_API_BASE = "https://api.bilibili.com"
BILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BowenInterviewCollector/0.1",
    "Referer": "https://www.bilibili.com/",
}


def _filter_wbi_chars(value: str) -> str:
    """过滤 WBI 签名中的特殊字符"""
    return value.replace("!", "").replace("'", "").replace("(", "").replace(")", "")


class BilibiliAPI:
    """B站 API 客户端

    支持三种查询方式:
    1. UP主视频列表 (需要 WBI 签名)
    2. 关键词搜索
    3. 视频详情查询
    """

    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(
            headers=BILI_HEADERS,
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True
        )
        self._wbi_keys: tuple[str, str] | None = None

    # --- WBI 签名 ---

    @lru_cache(maxsize=1)
    def _get_wbi_keys(self) -> tuple[str, str]:
        """获取 WBI 签名所需的 img_key 和 sub_key"""
        try:
            resp = self._client.get(f"{BILI_API_BASE}/x/web-interface/nav")
            data = resp.json().get("data", {})
            img_url = data.get("wbi_img", {}).get("img_url", "")
            sub_url = data.get("wbi_img", {}).get("sub_url", "")
            img_key = img_url.rsplit("/", 1)[-1].split(".")[0] if img_url else ""
            sub_key = sub_url.rsplit("/", 1)[-1].split(".")[0] if sub_url else ""
            logger.info("WBI keys retrieved: img_key=%s...", img_key[:8] if img_key else "empty")
            return img_key, sub_key
        except Exception as e:
            logger.warning("Failed to get WBI keys: %s", e)
            return "", ""

    def _wbi_sign(self, params: dict[str, Any]) -> dict[str, Any]:
        """对请求参数进行 WBI 签名"""
        img_key, sub_key = self._get_wbi_keys()
        if not img_key or not sub_key:
            return params

        # WBI 混淆表
        mixin_key_enc_tab = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
            27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
            37, 36, 25, 4, 26, 16, 17, 22, 24, 20, 44, 0, 11, 40, 1, 52,
            30, 6, 55, 34, 48, 21, 51, 7, 54, 57, 56, 61, 60, 59, 63, 62
        ]

        # 生成 mixin_key
        raw_key = img_key + sub_key
        mixin_key = "".join(raw_key[i] for i in mixin_key_enc_tab[:32])

        # 计算签名
        params_with_ts = {**params, "wts": int(time.time())}
        # 按 key 排序
        sorted_params = sorted(params_with_ts.items())
        # 过滤特殊字符 (! ' ( ) )
        query = "&".join(
            f"{k}={_filter_wbi_chars(str(v))}"
            for k, v in sorted_params
        )
        w_rid = hashlib.md5((query + mixin_key).encode()).hexdigest()
        params_with_ts["w_rid"] = w_rid

        return params_with_ts

    # --- API 方法 ---

    def fetch_up_videos(self, uid: str, page: int = 1, page_size: int = 30) -> list[dict]:
        """获取 UP 主视频列表

        API: /x/space/wbi/arc/search (需要 WBI 签名)
        """
        params = {
            "mid": uid,
            "pn": page,
            "ps": page_size,
            "order": "pubdate",  # 按发布时间排序
        }
        signed_params = self._wbi_sign(params)

        try:
            self._rate_limit()
            resp = self._client.get(
                f"{BILI_API_BASE}/x/space/wbi/arc/search",
                params=signed_params
            )
            data = resp.json()

            if data.get("code") != 0:
                logger.warning("UP videos API error: code=%s msg=%s", data.get("code"), data.get("message"))
                return []

            vlist = data.get("data", {}).get("list", {}).get("vlist", [])
            return vlist if isinstance(vlist, list) else []

        except Exception as e:
            logger.error("Failed to fetch UP videos for uid=%s: %s", uid, e)
            return []

    def search_videos(self, keyword: str, page: int = 1, page_size: int = 20) -> list[dict]:
        """关键词搜索视频

        API: /x/web-interface/search/type
        """
        params = {
            "search_type": "video",
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "order": "pubdate",  # 按发布时间排序
        }

        try:
            self._rate_limit()
            resp = self._client.get(
                f"{BILI_API_BASE}/x/web-interface/search/type",
                params=params
            )
            data = resp.json()

            if data.get("code") != 0:
                logger.warning("Search API error: code=%s msg=%s", data.get("code"), data.get("message"))
                return []

            results = data.get("data", {}).get("result", [])
            return results if isinstance(results, list) else []

        except Exception as e:
            logger.error("Failed to search videos for keyword=%s: %s", keyword, e)
            return []

    def get_video_info(self, bvid: str) -> dict | None:
        """获取视频详情（含 aid, cid）

        API: /x/web-interface/view
        """
        try:
            self._rate_limit()
            resp = self._client.get(
                f"{BILI_API_BASE}/x/web-interface/view",
                params={"bvid": bvid}
            )
            data = resp.json()

            if data.get("code") != 0:
                logger.warning("Video info API error for %s: %s", bvid, data.get("message"))
                return None

            return data.get("data", {})

        except Exception as e:
            logger.error("Failed to get video info for %s: %s", bvid, e)
            return None

    def get_subtitle_info(self, aid: int, cid: int) -> list[dict]:
        """获取视频字幕列表

        API: /x/player/wbi/v2
        """
        params = {"aid": aid, "cid": cid}
        signed_params = self._wbi_sign(params)

        try:
            self._rate_limit()
            resp = self._client.get(
                f"{BILI_API_BASE}/x/player/wbi/v2",
                params=signed_params
            )
            data = resp.json()

            if data.get("code") != 0:
                logger.debug("Subtitle info API error for aid=%s cid=%s: %s", aid, cid, data.get("message"))
                return []

            subtitles = data.get("data", {}).get("subtitle", {}).get("subtitles", [])
            return subtitles if isinstance(subtitles, list) else []

        except Exception as e:
            logger.error("Failed to get subtitle info for aid=%s cid=%s: %s", aid, cid, e)
            return []

    def fetch_subtitle_json(self, subtitle_url: str) -> list[dict] | None:
        """下载字幕 JSON"""
        if not subtitle_url.startswith("http"):
            subtitle_url = "https:" + subtitle_url

        try:
            resp = self._client.get(subtitle_url)
            data = resp.json()
            return data.get("body", [])
        except Exception as e:
            logger.error("Failed to fetch subtitle JSON: %s", e)
            return None

    def get_playurl(self, bvid: str, cid: int) -> dict | None:
        """获取视频 DASH 流（含音频流URL）

        API: /x/player/wbi/playurl?bvid=xx&cid=xx&fnval=16
        返回 data.dash.audio[] 列表，每个含 baseUrl/backup_url
        """
        params = {
            "bvid": bvid,
            "cid": cid,
            "fnval": 16,  # DASH 格式
            "fnver": 0,
            "qn": 64,     # 720P 足够获取音频
        }
        signed_params = self._wbi_sign(params)

        try:
            self._rate_limit()
            resp = self._client.get(
                f"{BILI_API_BASE}/x/player/wbi/playurl",
                params=signed_params
            )
            data = resp.json()

            if data.get("code") != 0:
                logger.warning("Playurl API error for %s: %s", bvid, data.get("message"))
                return None

            return data.get("data", {})

        except Exception as e:
            logger.error("Failed to get playurl for %s: %s", bvid, e)
            return None

    def download_audio_stream(self, audio_url: str, output_path: Path) -> bool:
        """下载音频流到文件

        音频流 URL 必须带 Referer 头，否则 403
        """
        if not audio_url.startswith("http"):
            audio_url = "https:" + audio_url

        try:
            resp = self._client.get(
                audio_url,
                headers={**BILI_HEADERS, "Range": "bytes=0-"},
                timeout=httpx.Timeout(120.0, connect=30.0)
            )
            if resp.status_code not in (200, 206):
                logger.warning("Audio stream download failed: HTTP %s", resp.status_code)
                return False

            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(resp.content)

            logger.info("Audio downloaded: %s (%d bytes)", output_path.name, len(resp.content))
            return True

        except Exception as e:
            logger.error("Audio stream download error: %s", e)
            return False

    def close(self):
        self._client.close()

    def _rate_limit(self):
        """请求间隔 2-5 秒随机延迟"""
        delay = random.uniform(2.0, 5.0)
        time.sleep(delay)
