# 博闻 — API 契约规范

当前 MVP 只有一个主要 API：`GET /api/hot-videos`。后续新增接口必须先写清输入、输出、错误和降级行为。

## 1. 通用响应约定

推荐响应结构：

```ts
type ApiSuccess<T> = {
  success: true;
  data: T;
  traceId: string;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
  traceId: string;
};
```

当前 `/api/hot-videos` 仍返回 MVP 简化结构，重构时逐步迁移到统一 envelope。

## 2. GET /api/hot-videos

用途：按品类返回快速增长视频 Top10。

请求：

```text
GET /api/hot-videos?category=AI科技&platform=douyin
```

参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `category` | 否 | 必须是已支持品类；非法时默认 `AI科技` |
| `platform` | 否 | `bilibili`、`douyin`、`weibo`；非法时默认 `bilibili` |

响应：

```ts
type HotVideosResponse = {
  source: "live" | "fallback";
  platform: "bilibili" | "douyin" | "weibo";
  updatedAt: string;
  videos: VideoTrend[];
};
```

`VideoTrend`：

```ts
type VideoTrend = {
  id: string;
  platform: "bilibili" | "douyin" | "weibo";
  title: string;
  author: string;
  url: string;
  description: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  growthScore: number;
  growthReason: string;
};
```

业务约束：

- `videos.length <= 10`
- 默认只返回近五日、10 万播放以上、显著高于同品类基准的视频
- live 不足或失败时返回 fallback
- `source` 必须真实表达数据来源
- B站尝试公开视频热榜；抖音当前使用快增长样本边界和 fallback；微博尝试热搜排行榜，失败则 fallback

## 3. POST /api/generate-plan

用途：前端提交当前品类、热点、创作者定位和范例文案，后端返回完整创作建议。

请求：

```ts
type GeneratePlanRequest = MvpInput;
```

响应：`GeneratedPlan`。

当前实现：已由 `app/api/generate-plan/route.ts` 调用 `generateCreatorPlan`。

## 4. Future: POST /api/analyze-reference

用途：输入视频链接或趋势视频，返回文案和拍摄解析。

请求：

```ts
type AnalyzeReferenceRequest = {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  videoUrl: string;
};
```

响应：

```ts
type AnalyzeReferenceResponse = {
  video: VideoDetail;
  analysis: SampleAnalysis;
  confidence: "high" | "medium" | "low";
};
```

## 5. 兼容规则

- 已给 UI 使用的字段不得无提示删除。
- 新字段可以增加，旧字段废弃要先标记 deprecated。
- 数字字段必须是 number，不用字符串表达播放量。
- 时间统一 ISO string。
- URL 必须是可打开链接。

一句话：接口要保护 UI 不被平台字段和临时实现绑死。
