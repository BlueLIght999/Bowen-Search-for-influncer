import { NextResponse } from "next/server";
import { categoryKeywords, isCategory } from "../../../src/domain/categories";
import { getFallbackVideos } from "../../../src/domain/fallbackVideos";
import type { Category, TrendFetchResult, VideoTrend } from "../../../src/domain/types";
import { rankHotVideos } from "../../../src/engine/rankHotVideos";

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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const updatedAt = new Date().toISOString();
  const url = new URL(request.url);
  const requestedCategory = url.searchParams.get("category");
  const category: Category = isCategory(requestedCategory) ? requestedCategory : "AI科技";

  try {
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
    const list = payload.data?.list ?? [];
    const liveVideos = list.map(mapBilibiliItem);
    const categoryVideos = liveVideos.filter((video) => matchesCategory(video, category));
    const videos = rankHotVideos(categoryVideos.length > 0 ? categoryVideos : liveVideos);

    if (payload.code !== 0 || videos.length < 10) {
      throw new Error("Bilibili returned too few category-qualified videos");
    }

    return NextResponse.json({
      source: "live",
      updatedAt,
      videos: videos.slice(0, 10)
    } satisfies TrendFetchResult);
  } catch {
    return NextResponse.json({
      source: "fallback",
      updatedAt,
      videos: rankHotVideos(getFallbackVideos(category)).slice(0, 10)
    } satisfies TrendFetchResult);
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
