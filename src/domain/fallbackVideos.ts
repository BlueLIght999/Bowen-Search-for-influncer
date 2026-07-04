import type { VideoTrend } from "./types";

export const fallbackVideos: VideoTrend[] = [
  {
    id: "fallback-ai-search",
    platform: "bilibili",
    title: "AI搜索正在替代传统搜索？普通人真正该学的是判断答案",
    author: "博闻样本库",
    url: "https://www.bilibili.com",
    description: "用AI搜索和传统搜索的差异切入，解释普通人如何判断答案可靠性。",
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    viewCount: 88000,
    likeCount: 6200,
    favoriteCount: 3100,
    commentCount: 980,
    growthScore: 0,
    growthReason: ""
  },
  {
    id: "fallback-workplace",
    platform: "bilibili",
    title: "为什么新人越努力越焦虑？问题可能不是能力",
    author: "博闻样本库",
    url: "https://www.bilibili.com",
    description: "从职场新人焦虑出发，把努力误区拆成目标、反馈和节奏三个层面。",
    publishedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    viewCount: 56000,
    likeCount: 3200,
    favoriteCount: 1900,
    commentCount: 640,
    growthScore: 0,
    growthReason: ""
  },
  {
    id: "fallback-education",
    platform: "bilibili",
    title: "家长都在聊AI教育，但孩子最缺的是提问能力",
    author: "博闻样本库",
    url: "https://www.bilibili.com",
    description: "把AI教育热点从工具购买转向提问能力和家庭学习场景。",
    publishedAt: new Date(Date.now() - 42 * 60 * 60 * 1000).toISOString(),
    viewCount: 43000,
    likeCount: 2800,
    favoriteCount: 1600,
    commentCount: 520,
    growthScore: 0,
    growthReason: ""
  }
];
