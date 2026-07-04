import { NextResponse } from "next/server";
import { fallbackVideos } from "../../../src/domain/fallbackVideos";
import type { TrendFetchResult, VideoTrend } from "../../../src/domain/types";
import { rankHotVideos } from "../../../src/engine/rankHotVideos";

interface BilibiliPopularItem {
  aid: number;
  bvid: string;
  title: string;
  desc?: string;
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

export async function GET() {
  const updatedAt = new Date().toISOString();

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
    const videos = rankHotVideos(list.map(mapBilibiliItem));

    if (payload.code !== 0 || videos.length === 0) {
      throw new Error("Bilibili returned no recent videos");
    }

    return NextResponse.json({
      source: "live",
      updatedAt,
      videos
    } satisfies TrendFetchResult);
  } catch {
    return NextResponse.json({
      source: "fallback",
      updatedAt,
      videos: rankHotVideos(fallbackVideos)
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
    description: item.desc ?? "",
    publishedAt: new Date(item.pubdate * 1000).toISOString(),
    viewCount: item.stat?.view ?? 0,
    likeCount: item.stat?.like ?? 0,
    favoriteCount: item.stat?.favorite ?? 0,
    commentCount: item.stat?.reply ?? 0,
    growthScore: 0,
    growthReason: ""
  };
}
