import type { Platform } from "./types";

export const platforms: Array<{ id: Platform; label: string; description: string }> = [
  { id: "bilibili", label: "B站", description: "公开视频热榜" },
  { id: "douyin", label: "抖音", description: "快增长短视频" },
  { id: "weibo", label: "微博", description: "热搜排行榜" }
];

export function isPlatform(value: string | null): value is Platform {
  return value === "bilibili" || value === "douyin" || value === "weibo";
}
