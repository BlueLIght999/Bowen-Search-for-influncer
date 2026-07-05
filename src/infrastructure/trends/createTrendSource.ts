import type { Platform } from "../../domain/types";
import type { TrendSourcePort } from "../../application/ports/TrendSourcePort";
import { BilibiliPopularTrendSource } from "./BilibiliPopularTrendSource";
import { DouyinFastGrowthTrendSource } from "./DouyinFastGrowthTrendSource";
import { WeiboHotSearchTrendSource } from "./WeiboHotSearchTrendSource";

export function createLiveTrendSource(platform: Platform): TrendSourcePort {
  if (platform === "douyin") {
    return new DouyinFastGrowthTrendSource();
  }

  if (platform === "weibo") {
    return new WeiboHotSearchTrendSource();
  }

  return new BilibiliPopularTrendSource();
}
