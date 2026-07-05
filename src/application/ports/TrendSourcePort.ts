import type { Category, Platform, VideoTrend } from "../../domain/types";

export interface TrendSourcePort {
  fetchCandidates(category: Category, platform: Platform): Promise<VideoTrend[]>;
}
