import type { TrendSourcePort } from "../../application/ports/TrendSourcePort";
import type { Category, Platform, VideoTrend } from "../../domain/types";

interface WeiboHotSearchItem {
  note?: string;
  word?: string;
  word_scheme?: string;
  raw_hot?: number;
  num?: number;
  category?: string;
}

interface WeiboHotSearchResponse {
  data?: {
    realtime?: WeiboHotSearchItem[];
  };
}

export class WeiboHotSearchTrendSource implements TrendSourcePort {
  async fetchCandidates(_category: Category, platform: Platform): Promise<VideoTrend[]> {
    if (platform !== "weibo") {
      throw new Error(`Weibo source does not support ${platform}`);
    }

    const response = await fetch("https://weibo.com/ajax/side/hotSearch", {
      headers: {
        "User-Agent": "Mozilla/5.0 BowenLocalMVP/0.1",
        Referer: "https://weibo.com/"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Weibo responded ${response.status}`);
    }

    const payload = (await response.json()) as WeiboHotSearchResponse;
    const list = payload.data?.realtime ?? [];
    const now = Date.now();

    return list.slice(0, 30).map((item, index) => {
      const title = item.note ?? item.word ?? `微博热搜 ${index + 1}`;
      const hotValue = item.raw_hot ?? item.num ?? 100000 + index * 10000;

      return {
        id: `weibo-${index}-${title}`,
        platform: "weibo",
        title,
        author: "微博热搜榜",
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
        description: item.category ? `微博热搜分类：${item.category}` : "微博实时热搜榜条目",
        publishedAt: new Date(now - Math.max(1, index + 1) * 60 * 60 * 1000).toISOString(),
        viewCount: Math.max(100000, hotValue),
        likeCount: Math.round(hotValue * 0.03),
        favoriteCount: Math.round(hotValue * 0.012),
        commentCount: Math.round(hotValue * 0.008),
        growthScore: 0,
        growthReason: ""
      };
    });
  }
}
