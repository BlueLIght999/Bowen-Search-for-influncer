import type { VideoTrend } from "../domain/types";

const FIVE_DAYS_IN_MS = 5 * 24 * 60 * 60 * 1000;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const MINIMUM_FAST_VIEW_COUNT = 100000;
const SIGNIFICANT_GROWTH_MULTIPLIER = 1.5;

export function rankHotVideos(videos: VideoTrend[], now = new Date()): VideoTrend[] {
  const nowMs = now.getTime();

  const recentVideos = videos
    .filter((video) => {
      const publishedMs = new Date(video.publishedAt).getTime();
      return Number.isFinite(publishedMs) && nowMs - publishedMs <= FIVE_DAYS_IN_MS && nowMs >= publishedMs;
    });

  const averageViewVelocity = getAverageViewVelocity(recentVideos, nowMs);

  return recentVideos
    .map((video) => {
      const ageHours = Math.max(1, (nowMs - new Date(video.publishedAt).getTime()) / ONE_HOUR_IN_MS);
      const viewVelocity = video.viewCount / ageHours;
      const interactionVelocity = (video.likeCount * 2 + video.favoriteCount * 3 + video.commentCount * 2) / ageHours;
      const lift = averageViewVelocity > 0 ? viewVelocity / averageViewVelocity : 1;
      const growthScore = Math.round(lift * 100 + interactionVelocity / 100);

      return {
        ...video,
        growthScore,
        growthReason: `5天内破10万：${Math.round(ageHours)}小时内获得${formatCount(video.viewCount)}播放，播放速度约为同品类均值${lift.toFixed(1)}倍`
      };
    })
    .filter((video) => {
      const publishedMs = new Date(video.publishedAt).getTime();
      const ageHours = Math.max(1, (nowMs - publishedMs) / ONE_HOUR_IN_MS);
      const viewVelocity = video.viewCount / ageHours;
      return video.viewCount >= MINIMUM_FAST_VIEW_COUNT && viewVelocity >= averageViewVelocity * SIGNIFICANT_GROWTH_MULTIPLIER;
    })
    .sort((a, b) => b.growthScore - a.growthScore)
    .slice(0, 10);
}

function getAverageViewVelocity(videos: VideoTrend[], nowMs: number): number {
  const baselineVideos = videos.filter((video) => video.viewCount < MINIMUM_FAST_VIEW_COUNT);
  const sourceVideos = baselineVideos.length > 0 ? baselineVideos : videos;

  if (sourceVideos.length === 0) {
    return 0;
  }

  const totalVelocity = sourceVideos.reduce((sum, video) => {
    const publishedMs = new Date(video.publishedAt).getTime();
    const ageHours = Math.max(1, (nowMs - publishedMs) / ONE_HOUR_IN_MS);
    return sum + video.viewCount / ageHours;
  }, 0);

  return totalVelocity / sourceVideos.length;
}

function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  return `${value}`;
}
