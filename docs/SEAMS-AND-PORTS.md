# 博闻 — Port 接口契约

本文列出后续最重要的接口边界。签名用 TypeScript 表达契约，具体文件可随重构逐步创建。

## 1. TrendSourcePort

用于获取某品类的候选视频。

```ts
export interface TrendSourcePort {
  fetchCandidates(category: Category): Promise<VideoTrend[]>;
}
```

约束：

- 返回统一 `VideoTrend`，不得暴露平台原始结构。
- 不负责 Top10 排序，只负责候选获取和字段映射。
- 失败时抛出可识别错误，由 use case 选择 fallback。

## 2. HotVideoRanker

当前已由 `rankHotVideos` 承担。

```ts
export interface HotVideoRanker {
  rank(videos: VideoTrend[], now?: Date, options?: RankOptions): VideoTrend[];
}
```

约束：

- 纯函数。
- 默认近五日、10 万播放、1.5 倍增长阈值。
- 输出最多 10 条。

## 3. TrendSnapshotRepository

用于真实增长率计算。

```ts
export interface TrendSnapshotRepository {
  saveSnapshot(snapshot: TrendSnapshot): Promise<void>;
  listRecentSnapshots(category: Category, days: number): Promise<TrendSnapshot[]>;
}
```

约束：

- MVP 可用 JSON 文件实现。
- 后续可替换 SQLite。
- application 不知道具体存储介质。

## 4. VideoDetailCrawlerPort

用于抓取视频详情页。

```ts
export interface VideoDetailCrawlerPort {
  fetchDetail(url: string): Promise<VideoDetail>;
}
```

`VideoDetail` 至少包含：

- title
- description
- author
- publishedAt
- visibleText
- tags
- commentSignals
- confidence

约束：

- Playwright、cookie、代理、UA 都属于 infrastructure。
- 抓取失败要返回错误类型，不吞掉原因。
- 不下载视频文件，除非后续明确加入多模态能力。

## 5. CopyAnalysisPort

用于把文本和信号解析为文案结构。

```ts
export interface CopyAnalysisPort {
  analyze(input: {
    category: Category;
    title: string;
    description: string;
    visibleText?: string;
    commentSignals?: string;
  }): Promise<SampleAnalysis>;
}
```

约束：

- 规则版和 LLM 版输出同一 `SampleAnalysis`。
- LLM JSON 必须 schema 校验。
- 输出必须包含 hook、copyLogic、sceneStyle、shotRhythm。

## 6. KnowledgeRepositoryPort

用于策略召回。

```ts
export interface KnowledgeRepositoryPort {
  retrieve(input: {
    category: Category;
    analysis: SampleAnalysis;
    limit: number;
  }): Promise<KnowledgeItem[]>;
}
```

## 7. PlanGenerator

用于生成最终建议。

```ts
export interface PlanGenerator {
  generate(input: {
    category: Category;
    hotspot: string;
    creatorPositioning: string;
    video: VideoTrend;
    analysis: SampleAnalysis;
    knowledge: KnowledgeItem[];
  }): Promise<GeneratedPlan>;
}
```

## 8. VideoStoragePort

用于保存和恢复上传的视频资产。

```ts
export interface VideoStoragePort {
  saveVideo(request: SaveVideoRequest): Promise<StoredVideoAsset>;
  findVideoById(videoId: string): Promise<StoredVideoAsset | null>;
}
```

约束：

- 每次上传由接口层生成唯一 `assetId`。
- 存储适配器负责文件名安全规范化，并保留用户原始文件名元数据。
- application 只依赖 `StoredVideoAsset`，不扫描文件系统。

## 9. JobRepositoryPort

用于保存和查询完整任务快照。

```ts
export interface JobRepositoryPort {
  save(job: VideoAnalysisJobSnapshot): Promise<void>;
  findById(jobId: string): Promise<VideoAnalysisJobSnapshot | null>;
}
```

任务进度是应用层读模型，不写回聚合快照。
本地 JSON 仓储不得对 `jobId` 做有损清洗；只允许字母、数字、下划线和短横线，其他值必须抛错，由 API 层提前转成参数错误。
本地 JSON 仓储在保存和读取时都必须复用领域层快照校验；未知 `status`、`history.status`、非法 `failure.stage`、跳阶段历史、非法时间戳、历史时间倒退或当前状态与历史尾部不一致都视为持久化数据损坏，不能返回给应用层继续编排。

## 10. ReportRepositoryPort 与 ErrorLogPort

- `ReportRepositoryPort` 按 `jobId` 保存和读取结构化分析报告。
- 本地 `ReportRepositoryPort` 与任务仓储使用同一套安全 `jobId` 文件名规则，避免报告路径与任务路径出现隐性碰撞。
- 本地 `ReportRepositoryPort` 保存和读取报告时必须校验文件内容 `jobId` 与请求 `jobId` 一致，并拒绝非法报告状态，不能把错配报告返回给 API 查询层。
- 本地 `ReportRepositoryPort` 必须把主报告 DTO 当成持久化边界：`video`、`transcript`、`understanding`、`knowledgeEvidence`、`evaluation` 和 `generatedOutline` 都需要运行时校验。
- `evaluation.scores` 必须覆盖脚本优秀度、前三秒钩子、分镜、审美体验、情绪节奏、差异化和爆点潜力，且每个核心评分必须有 `scoreReasons`；`keywordRecommendations` 的每个元素必须能被前端安全渲染，包含合法维度、label、keywords 和 reason。旧格式或损坏报告必须转入结构化查询失败。
- `ErrorLogPort` 追加包含 `traceId`、`jobId`、`code`、`stage`、原始 message 和技术 detail 的日志。
- `ErrorLogPort` 写入前必须校验非空 `traceId`、`code`、`stage`、`message` 和有效时间戳；`detail` 需要安全序列化，避免 `Error`、循环引用或 `bigint` 破坏 JSONL。
- 本地适配器分别写入 `storage/reports` 和 `storage/logs/errors.jsonl`。

## 11. BackgroundTaskSchedulerPort

用于把任务创建响应和耗时分析执行解耦。

```ts
export interface BackgroundTaskSchedulerPort {
  schedule(task: {
    id: string;
    execute(): Promise<void>;
  }): void;
}
```

约束：

- `schedule()` 必须立即登记 pending 任务，避免 `waitForIdle()` 竞态。
- 后台任务异常必须被捕获并报告，不能产生未处理 Promise。
- 本地 MVP 使用进程内调度器，后续可替换为队列。

## 12. SliceUnderstandingCachePort

用于缓存分段视觉理解结果，避免同一视频证据、同一模型、同一 prompt/schema 版本重复调用多模态模型。

```ts
export interface SliceUnderstandingCachePort {
  findByCacheKey(cacheKey: string): Promise<CachedSliceUnderstanding | null>;
  save(record: CachedSliceUnderstanding): Promise<void>;
}
```

约束：

- cache key 由结构化 slice 输入摘要、模型名、prompt 版本和 schema 版本生成。
- 缓存记录只能保存 `SliceVisualObservation`、`ModelExecutionSummary`、`inputHash`、`cacheKey` 和 `cachedAt`。
- 缓存记录不得保存原始视频、帧文件路径、完整 prompt、API key 或 provider 原始响应。
- 命中缓存后仍必须重新经过领域校验，不能信任本地持久化文件。
- 缓存读取或写入失败不能阻断可用的模型分析；后续需要接入可观测日志和缓存命中率统计。

## 13. ModelPolicy 与 Provider Profile

用于按业务策略选择多模态模型能力，不让 application 代码按具体供应商名称写死路由。

```ts
export interface ModelPolicy {
  mode: "quality" | "balanced" | "local";
  allowCloudUpload: boolean;
  maxFrames: number;
  maxVideoSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  costBudget?: number;
}

export interface ModelProviderProfile {
  id: string;
  provider: string;
  model: string;
  route: "cloud_direct_video" | "cloud_frame_text" | "local_vision_language";
  requiresCloudUpload: boolean;
  maxFrames: number;
  maxVideoSeconds: number;
  qualityScore: number;
  estimatedCost: number;
}
```

约束：

- provider 选择只能依据能力、输入上限、云上传权限、质量评分和预算，不得依据供应商品牌硬编码分支。
- `balanced` 默认优先 frame-plus-text 路径，控制输入规模并复用现有抽帧证据链。
- `quality` 在预算和权限允许时优先高质量 provider。
- `local` 必须只选择本地视觉语言模型能力，禁止把帧、音频或原视频发往云端。
- `costBudget` 当前是 provider profile 的同单位估算值，不等于真实账单；真实 provider 接入后必须和 model-run usage/cost 字段对齐。
- 策略选择层不得保存 SDK client、API key、原始 provider response 或完整 prompt。
- 已选中的 provider profile、策略模式、有效输入规模、预算和选择原因必须进入 `ModelRunRecord.selection`，方便后续评测回放与成本诊断。
- slice 视觉理解和 video reasoning 两个模型阶段都必须尽量保留 selection metadata；adapter 暂不提供 profile 时允许缺失，但不能伪造选择结果。
- adapter 未暴露 provider profile、或当前 `ModelPolicy` 拒绝全部候选时，application 必须写入 `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE` recoverable error；不得静默只留下缺失的 `ModelRunRecord.selection`。
- 缓存命中的 slice model-run 也必须保留 selection metadata，避免“复用历史输出”时丢失当次策略上下文。
- `GET /model-runs` 的 `summary.selection` 必须聚合 policy mode、route、provider profile、selection 缺失数和估算成本，让调试接口无需遍历每条记录就能看到模型策略走向。
- `GET /model-runs` 的 `summary.selection.byStage` 必须按 `visually_understanding`、`reasoning`、`evaluation` 分开聚合 selection；全局汇总不能替代阶段级审计，空阶段也要返回零值。
- `requiresCloudUpload` 属于 provider profile 事实；旧 model-run 缺失该字段时只能按 false 聚合，不能从 route 名称推断。

## 14. OpenAI-compatible 多模态适配器

`OpenAiCompatibleMultimodalUnderstandingClient` 实现 `MultimodalUnderstandingPort`，负责每个 timeline slice 的抽帧画面理解；`OpenAiCompatibleContentReasoningClient` 实现 `ContentReasoningPort`，负责整片叙事、分镜和爆点推理。

装配规则：

- API composition root 只能通过 `createOpenAiCompatibleMultimodalClients()` 按环境变量启用真实 adapter。
- 未配置 `BOWEN_VLM_PROVIDER=openai_compatible` 或缺少 `BOWEN_VLM_API_KEY` 时，继续注入 fake adapter，保证本地演示和测试不依赖网络。
- provider profile 固定为 `id=openai_compatible_frame_text`、`route=cloud_frame_text`、`requiresCloudUpload=true`，方便策略选择、model-run 审计和前端提示保持一致。
- adapter 只接收 `VideoEvidenceBundle`、frame asset 读取能力、transcript/OCR/timestamp 等证据；不得接收或上传原始视频文件。
- application 在调用 adapter 前必须派生受 `ModelPolicy.maxFrames` 和 `ModelPolicy.maxVideoSeconds` 限制的模型证据包；选择元数据不能替代真实输入裁剪。
- provider 原始响应必须先被规范化为 `SliceVisualObservation` 或 `MultimodalUnderstanding`，不得穿透到 application、domain 或 UI。
- JSON schema/字段非法时由 adapter 内部执行一次 repair retry；失败结果必须可识别，并由 application 进入 text/rules fallback。

一句话：Port 的目标是让真实抓取、历史数据、LLM 和知识库都能替换，而 UI 和排序规则不跟着震荡。
