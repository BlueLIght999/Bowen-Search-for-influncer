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

    throw new Error("Live source returned too few ranked videos");
  } catch {
    const fallbackCandidates = await fallbackSource.fetchCandidates(category, platform);

    return {
      source: "fallback",
      platform,
      updatedAt,
      videos: rankHotVideos(fallbackCandidates, now).slice(0, 10)
    };
  }
}
