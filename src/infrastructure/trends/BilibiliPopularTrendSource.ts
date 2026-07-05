import type { TrendSourcePort } from "../../application/ports/TrendSourcePort";
import { categoryKeywords } from "../../domain/categories";
import type { Category, Platform, VideoTrend } from "../../domain/types";

interface BilibiliPopularItem {
  aid: number;
  bvid: string;
  title: string;
  desc?: string;
  tname?: string;
  pubdate: number;
  owner?: {
    name?: string;
  };
  stat?: {
    view?: number;
    like?: number;
    favorite?: number;
    reply?: number;
  };
}

interface BilibiliPopularResponse {
  code: number;
  data?: {
    list?: BilibiliPopularItem[];
  };
}

export class BilibiliPopularTrendSource implements TrendSourcePort {
  async fetchCandidates(category: Category, platform: Platform): Promise<VideoTrend[]> {
    if (platform !== "bilibili") {
      throw new Error(`Bilibili source does not support ${platform}`);
    }

    const response = await fetch("https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1", {
      headers: {
        "User-Agent": "Mozilla/5.0 BowenLocalMVP/0.1",
        Referer: "https://www.bilibili.com/"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Bilibili responded ${response.status}`);
    }

    const payload = (await response.json()) as BilibiliPopularResponse;
    if (payload.code !== 0) {
      throw new Error(`Bilibili responded code ${payload.code}`);
    }

    const liveVideos = (payload.data?.list ?? []).map(mapBilibiliItem);
    const categoryVideos = liveVideos.filter((video) => matchesCategory(video, category));

    return categoryVideos.length > 0 ? categoryVideos : liveVideos;
  }
}

function mapBilibiliItem(item: BilibiliPopularItem): VideoTrend {
  return {
    id: item.bvid || String(item.aid),
    platform: "bilibili",
    title: item.title,
    author: item.owner?.name ?? "未知UP主",
    url: `https://www.bilibili.com/video/${item.bvid}`,
    description: `${item.tname ?? ""} ${item.desc ?? ""}`.trim(),
    publishedAt: new Date(item.pubdate * 1000).toISOString(),
    viewCount: item.stat?.view ?? 0,
    likeCount: item.stat?.like ?? 0,
    favoriteCount: item.stat?.favorite ?? 0,
    commentCount: item.stat?.reply ?? 0,
    growthScore: 0,
    growthReason: ""
  };
}

function matchesCategory(video: VideoTrend, category: Category): boolean {
  const text = `${video.title} ${video.description}`;
  return categoryKeywords[category].some((keyword) => text.includes(keyword));
}
