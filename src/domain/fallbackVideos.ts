import { categoryKeywords } from "./categories";
import type { Category, Platform, VideoTrend } from "./types";

export function getFallbackVideos(category: Category, platform: Platform = "bilibili"): VideoTrend[] {
  const now = Date.now();
  const platformLabel = getPlatformLabel(platform);
  const keywords = categoryKeywords[category] ?? [String(category)];

  const fastVideos = Array.from({ length: 10 }, (_, index) => {
    const keyword = keywords[index % keywords.length];
    return createVideo({
      category,
      platform,
      title: `${platformLabel}${String(category)}快增长范例：${keyword}的新角度为什么突然被转发`,
      index,
      ageHours: 6 + index * 2,
      viewCount: 280000 - index * 12000,
      fast: true,
      now
    });
  });

  const baselineVideos = keywords.map((keyword, index) =>
    createVideo({
      category,
      platform,
      title: `${platformLabel}${String(category)}普通增长样本：${keyword}常规讲法`,
      index: index + 20,
      ageHours: 72 + index * 4,
      viewCount: 48000 + index * 5000,
      fast: false,
      now
    })
  );

  return [...fastVideos, ...baselineVideos];
}

function createVideo({
  category,
  platform,
  title,
  index,
  ageHours,
  viewCount,
  fast,
  now
}: {
  category: Category;
  platform: Platform;
  title: string;
  index: number;
  ageHours: number;
  viewCount: number;
  fast: boolean;
  now: number;
}): VideoTrend {
  const platformLabel = getPlatformLabel(platform);

  return {
    id: `${platform}-${String(category)}-${index}`,
    platform,
    title,
    author: fast ? `${platformLabel}快增长样本` : `${platformLabel}基准样本`,
    url: getPlatformUrl(platform, title),
    description: `${platformLabel} ${String(category)} 样本：${title}`,
    publishedAt: new Date(now - ageHours * 60 * 60 * 1000).toISOString(),
    viewCount,
    likeCount: Math.round(viewCount * (fast ? 0.08 : 0.025)),
    favoriteCount: Math.round(viewCount * (fast ? 0.045 : 0.012)),
    commentCount: Math.round(viewCount * (fast ? 0.014 : 0.004)),
    growthScore: 0,
    growthReason: ""
  };
}

function getPlatformLabel(platform: Platform): string {
  return {
    bilibili: "B站",
    douyin: "抖音",
    weibo: "微博"
  }[platform];
}

function getPlatformUrl(platform: Platform, title: string): string {
  if (platform === "douyin") {
    return `https://www.douyin.com/search/${encodeURIComponent(title)}`;
  }

  if (platform === "weibo") {
    return `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`;
  }

  return "https://www.bilibili.com";
}
