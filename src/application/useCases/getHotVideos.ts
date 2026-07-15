import type { TrendSourcePort } from "../ports/TrendSourcePort";
import type { Category, Platform, TrendFetchResult } from "../../domain/types";
import { rankHotVideos } from "../../engine/rankHotVideos";

interface GetHotVideosOptions {
  category: Category;
  platform?: Platform;
  liveSource: TrendSourcePort;
  fallbackSource: TrendSourcePort;
  now?: Date;
}

export async function getHotVideos({
  category,
  platform = "bilibili",
  liveSource,
  fallbackSource,
  now = new Date()
}: GetHotVideosOptions): Promise<TrendFetchResult> {
  const updatedAt = now.toISOString();

  try {
    const liveCandidates = await liveSource.fetchCandidates(category, platform);
    const liveVideos = rankHotVideos(liveCandidates, now);

    if (liveVideos.length >= 10) {
      return {
        source: "live",
        platform,
        updatedAt,
        videos: liveVideos.slice(0, 10)
      };
    }

    throw new Error("LIVE_RANKED_VIDEOS_TOO_FEW");
  } catch (error) {
    const fallbackCandidates = await fallbackSource.fetchCandidates(category, platform);

    return {
      source: "fallback",
      platform,
      updatedAt,
      fallbackReason: toFallbackReason(error),
      videos: rankHotVideos(fallbackCandidates, now).slice(0, 10)
    };
  }
}

function toFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "live source unavailable";
  if (message === "LIVE_RANKED_VIDEOS_TOO_FEW") {
    return "实时榜单不足 10 条，已切换到本地演示样本。";
  }

  return `实时榜单暂时不可用，已切换到本地演示样本：${message}`;
}
