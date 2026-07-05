import type { TrendSourcePort } from "../../application/ports/TrendSourcePort";
import type { Category, Platform, VideoTrend } from "../../domain/types";
import { getFallbackVideos } from "../../domain/fallbackVideos";

export class FallbackTrendSource implements TrendSourcePort {
  async fetchCandidates(category: Category, platform: Platform): Promise<VideoTrend[]> {
    return getFallbackVideos(category, platform);
  }
}
