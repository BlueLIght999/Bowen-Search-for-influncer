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
  fallbackReason?: string;
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
- 当 `source=fallback` 时必须返回 `fallbackReason`，说明是实时榜单不可用还是实时结果不足
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

## 6. POST /api/analyze-uploaded-video

用途：兼容上传视频分析入口，基于标题/文稿和可选参照文本生成结构化内容评估。

响应主体为 `UploadedVideoAnalysis`，核心新增字段：

```ts
type UploadedVideoAnalysis = {
  summary: string;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  knowledgeRetrieval: {
    status: "completed" | "failed";
    evidenceCount: number;
    reason?: string;
  };
  directions: DifferentiatedDirection[];
  report: VideoAnalysisReport;
};
```

约束：

- `knowledgeRetrieval.status=failed` 时，`knowledgeUsed` 必须为空数组，`reason` 必须保留仓储失败原因。
- 远程差异化服务失败时可以回退本地评分，但 RAG 检索失败不能静默伪装成正常零命中。

## 7. VideoAnalysisReport RAG 字段

`VideoAnalysisReport` 必须保留原有展示字段，并新增可选知识检索摘要：

```ts
type VideoAnalysisReport = {
  knowledgeEvidence: RetrievedKnowledge[];
  knowledgeSummary?: {
    status: "completed" | "failed";
    evidenceCount: number;
    reason?: string;
  };
};
```

兼容规则：

- `knowledgeSummary` 当前为可选字段，用于兼容历史持久化报告。
- 新生成报告必须写入 `knowledgeSummary`。
- `knowledgeEvidence[].matchReasons` 必须保留 `keyword: ...` 或 `model-signal: ...` 等可读原因。

## 8. GET /api/video-analysis-jobs/:jobId/model-runs

用途：查询一次视频分析任务产生的模型运行记录，用于调试、评测回放、缓存命中分析和成本观测。

请求：

```text
GET /api/video-analysis-jobs/job_123/model-runs
```

响应：

```ts
type ModelRunsResponse = {
  jobId: string;
  modelRuns: ModelRunRecord[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    partial: number;
    stages: {
      visually_understanding: number;
      reasoning: number;
      evaluation: number;
    };
    cacheKeys: string[];
    cache: {
      hits: number;
      misses: number;
      readFailures: number;
      writeFailures: number;
      savedModelCalls: number;
      estimatedSkippedModelCalls: number;
    };
    usage: {
      inputTokens: number;
      outputTokens: number;
      imageCount: number;
      frameCount: number;
      runsWithUsage: number;
      runsMissingUsage: number;
    };
    selection: {
      runsWithSelection: number;
      runsMissingSelection: number;
      estimatedCost: number;
      policyModes: Record<"quality" | "balanced" | "local", number>;
      routes: Record<
        "cloud_direct_video" | "cloud_frame_text" | "local_vision_language",
        number
      >;
      providerProfiles: Record<string, number>;
      cloudUploadRequired: number;
      cloudUploadAllowed: number;
      byStage: Record<
        "visually_understanding" | "reasoning" | "evaluation",
        {
          runsWithSelection: number;
          runsMissingSelection: number;
          estimatedCost: number;
          policyModes: Record<"quality" | "balanced" | "local", number>;
          routes: Record<
            "cloud_direct_video" | "cloud_frame_text" | "local_vision_language",
            number
          >;
          providerProfiles: Record<string, number>;
          cloudUploadRequired: number;
          cloudUploadAllowed: number;
        }
      >;
    };
  };
};
```

`ModelRunRecord.selection` 可选字段：

```ts
type ModelRunSelection = {
  policyMode: "quality" | "balanced" | "local";
  providerProfileId: string;
  route: "cloud_direct_video" | "cloud_frame_text" | "local_vision_language";
  effectiveFrameCount: number;
  effectiveVideoSeconds: number;
  estimatedCost: number;
  costBudget?: number;
  allowCloudUpload: boolean;
  requiresCloudUpload?: boolean;
  reason: string;
};
```

约束：

- `jobId` 必须先通过安全字符校验；非法时返回 `PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID` 和 400。
- 没有持久化 model-run 时返回 `success:true` 和空数组，不能伪造成查询失败。
- 持久化记录损坏或读取失败时返回 `SYSTEM_MODEL_RUN_QUERY_FAILED` 和 500，并写入错误日志。
- `modelRuns` 只暴露运行元数据、`inputHash` 和 `cacheKey`，不得返回原始视频、帧路径、完整 prompt 或密钥。
- `modelRuns[].selection` 只暴露 provider profile 选择结果和策略原因，不得暴露 SDK client、API key、完整 prompt 或 provider 原始响应。
- `visually_understanding` 与 `reasoning` 阶段在 adapter 暴露 provider profile 时都应写入 `selection`；旧记录或未提供 profile 的 adapter 可以缺失该字段。
- adapter 未暴露 provider profile、或当前策略拒绝全部候选时，任务仍可继续，但必须写入 `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE` recoverable error；日志 detail 包含 `policy`、`requestedInput`、`reason`，策略拒绝时还应包含 `rejectedCandidates`。
- `summary.cache.savedModelCalls` 表示缓存命中跳过的 slice 模型调用数，当前 `estimatedSkippedModelCalls` 与其保持一致，后续接真实成本后再换算 token/media 预算。
- `summary.usage` 聚合已持久化 model-run 的估算用量，缺失 usage 的记录必须进入 `runsMissingUsage`，不能静默按完整成本记录处理。
- `inputTokens`、`outputTokens`、`imageCount`、`frameCount` 必须是非负整数；当前 fake provider 只返回估算值，不代表真实账单。
- 真实 provider 接入后，应优先使用 provider 返回的 token/media usage；如果 provider 不返回，必须保留 `runsMissingUsage` 作为成本不可完全审计的信号。
- `summary.selection` 聚合 policy mode、route 和 provider profile 分布，用于快速诊断本次任务是否走了预期模型策略。
- `summary.selection.byStage` 必须固定返回 `visually_understanding`、`reasoning` 和 `evaluation` 三个阶段；没有记录的阶段返回零值 summary，不能省略。
- `summary.selection.estimatedCost` 当前只汇总 provider profile 的估算成本，不代表真实账单；真实金额仍需后续结合 usage 和单价版本计算。
- `summary.selection.cloudUploadRequired` 基于 `modelRuns[].selection.requiresCloudUpload` 统计；旧记录缺失该字段时按 false 处理。

## 9. OpenAI-compatible 视频理解报告字段

当配置 `BOWEN_VLM_PROVIDER=openai_compatible` 且存在 `BOWEN_VLM_API_KEY` 时，上传视频分析会走 `cloud_frame_text` 路径：系统只发送抽帧图片 base64、时间戳、文稿片段和 OCR 文本，不发送原始视频文件。

环境变量：

```text
BOWEN_VLM_PROVIDER=openai_compatible
BOWEN_VLM_BASE_URL=https://api.openai.com/v1
BOWEN_VLM_API_KEY=...
BOWEN_VLM_MODEL=gpt-4o-mini
```

`VideoAnalysisReport` 新增前端稳定消费字段：

```ts
type CreatorInsights = {
  script: {
    mainContent: string;
    logicBeats: string[];
    hookHits: string[];
    rewriteDirections: string[];
    timestampEvidence: TimestampEvidence[];
  };
  visual: {
    sceneUnderstanding: string[];
    shotRhythm: string[];
    aestheticIssues: string[];
    continuityIssues: string[];
    timestampEvidence: TimestampEvidence[];
  };
  viral: {
    hitReasons: string[];
    trendProbability: "high" | "medium" | "low";
    weakPoints: string[];
    remakeSuggestions: string[];
    timestampEvidence: TimestampEvidence[];
  };
};
```

约束：

- `creatorInsights` 可以由真实多模态模型、文稿分析或规则 fallback 生成，但前端必须通过 `analysisMode` 与 `modelSummary.provider/model/partial/coverageRatio` 看出当前是否为真实大模型分析。
- 真实 provider 输出 JSON 解析失败时允许修复重试一次；仍失败时回退到 text/rules 报告，不能让前端空白。
- `timestampEvidence` 必须来自模型 claim 的 evidence refs 或可审计的本地证据，不得编造不存在的时间戳。
- 模型调用输入必须受 `ModelPolicy.maxFrames/maxVideoSeconds` 约束；默认最多 80 帧、120 秒，且只发送抽帧、文稿、OCR 和时间戳。
- `modelRuns[].selection.providerProfileId=openai_compatible_frame_text` 且 `requiresCloudUpload=true` 时，表示本次模型阶段使用了云端抽帧文本路线。

一句话：接口要保护 UI 不被平台字段和临时实现绑死。
