import type { VideoTrend } from "../domain/types";

const FIVE_DAYS_IN_MS = 5 * 24 * 60 * 60 * 1000;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

export function rankHotVideos(videos: VideoTrend[], now = new Date()): VideoTrend[] {
  const nowMs = now.getTime();

  return videos
    .filter((video) => {
      const publishedMs = new Date(video.publishedAt).getTime();
      return Number.isFinite(publishedMs) && nowMs - publishedMs <= FIVE_DAYS_IN_MS && nowMs >= publishedMs;
    })
    .map((video) => {
      const ageHours = Math.max(1, (nowMs - new Date(video.publishedAt).getTime()) / ONE_HOUR_IN_MS);
      const viewVelocity = video.viewCount / ageHours;
      const interactionVelocity = (video.likeCount * 2 + video.favoriteCount * 3 + video.commentCount * 2) / ageHours;
      const growthScore = Math.round(viewVelocity + interactionVelocity);

      return {
        ...video,
        growthScore,
        growthReason: `${Math.round(ageHours)}小时内获得${formatCount(video.viewCount)}播放，互动/收藏密度高`
      };
    })
    .sort((a, b) => b.growthScore - a.growthScore)
    .slice(0, 12);
}

function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  return `${value}`;
}
