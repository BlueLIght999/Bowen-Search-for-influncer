import type { TrendSourcePort } from "../../application/ports/TrendSourcePort";
import type { Category, Platform, VideoTrend } from "../../domain/types";

export class DouyinFastGrowthTrendSource implements TrendSourcePort {
  async fetchCandidates(_category: Category, platform: Platform): Promise<VideoTrend[]> {
    if (platform !== "douyin") {
      throw new Error(`Douyin source does not support ${platform}`);
    }

    throw new Error("Douyin public fast-growth source is not configured");
  }
}
