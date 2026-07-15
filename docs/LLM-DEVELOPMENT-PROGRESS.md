# 博闻 LLM 领域开发进度

本文持续记录 `docs/LLM-MULTIMODAL-ARCHITECTURE.md` 中 P0 到 P1 的实现进度、TDD 证据、Bug、技术欠缺和阶段复盘。

## 总体状态

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| P0-1 工作流版本迁移 | 已完成 | 新任务使用 v2 多模态状态流，旧快照按 v1 恢复 |
| P0-2 多模态证据领域模型 | 已完成 | 证据引用、时间范围、模态状态和覆盖率不变量已实现 |
| P0-3 自适应抽帧与时间切片 | 已完成 | 采样策略、证据构建、FFprobe 时长来源和主编排证据包已接入 |
| P0-4 多模态端口与 Fake Adapter | 已完成 | 分段视觉理解端口、fake adapter 和切片用例已实现 |
| P0-5 视频级推理端口 | 已完成 | ContentReasoningPort、fake reasoning adapter 和视频级理解模型已实现；真实微服务仍在 P1/P2 |
| P0-6 分段视觉理解与时序推理 | 已完成 | v2 编排已调用 slice understanding 与 temporal reasoning |
| P0-7 报告、降级与前端证据展示 | 已完成 | 报告投影、降级路径和前端模式/覆盖率/时间戳证据展示已完成 |
| P1 RAG、缓存、评测和成本控制 | 进行中 | 已完成模型信号驱动 RAG、KnowledgeRepositoryPort 与 ModelRunRepositoryPort；缓存、评测集、成本预算仍待推进 |

## 2026-07-10：关键节点 1 - 工作流 v2 迁移

### 完成内容

- `AnalysisJobStatus` 新增 `visually_understanding` 和 `reasoning`。
- `VideoAnalysisJobSnapshot` 新增可选 `workflowVersion`。
- 新建任务默认写入 `workflowVersion: 2`。
- 缺少 `workflowVersion` 的历史快照继续按照 v1 流程恢复。
- v1 和 v2 分别使用独立合法状态序列进行推进及历史校验。
- v2 主编排在抽帧后持久化 `visually_understanding`，在知识检索前持久化 `reasoning`。
- 进度投影按工作流版本使用不同百分比。
- 前端轮询客户端接受两个新增状态。
- 前端增加“正在理解视频画面”和“正在推理内容结构”状态文案。

### TDD 证据

红灯：

- 先新增聚合、进度、编排和客户端测试。
- 初次运行产生 14 个预期失败，覆盖缺失状态、错误进度、新任务无版本字段和编排未持久化新阶段。

绿灯：

```text
定向测试：5 个测试文件，54 项通过
全量测试：38 个测试文件，225 项通过
Next.js production build：通过
git diff --check：无代码格式错误，仅有现存 LF/CRLF 提示
```

### 发现并修复的 Bug

1. 新任务如果直接切换为 v2，但主编排仍从 `sampling_frames` 跳到 `retrieving_knowledge`，会触发非法状态迁移。
   - 修复：v2 编排显式推进 `visually_understanding` 和 `reasoning`。
2. 直接向旧状态数组插入新状态会导致历史任务无法恢复。
   - 修复：保留 v1/v2 两套状态流，缺少版本字段视为 v1。
3. 后端新增状态后，前端轮询客户端会把它们当成畸形响应。
   - 修复：同步更新客户端状态白名单和 UI 状态文案。
4. 单一进度表无法同时表达 v1 和 v2 阶段。
   - 修复：按 `workflowVersion` 选择进度映射。

### 当前不足

- `visually_understanding` 和 `reasoning` 当前只是真实可观察的任务阶段，内部仍调用现有规则理解，并未接入视觉大模型。
- v2 暂时没有阶段级断点恢复；失败后仍需要新任务重跑。
- 前端状态类型目前仍是 `string`，没有直接复用领域枚举。
- 进度百分比是产品映射值，不代表实际模型调用耗时。
- 领域模型文档中的主状态流尚未同步展示 v1/v2 双版本，后续节点需要更新。

## 2026-07-10：关键节点 2 - 多模态证据领域模型

### 完成内容

- 新增 `src/domain/multimodalIntelligence/VideoEvidence.ts`。
- 建立 `VideoEvidenceBundle`、`TimelineSlice`、`TranscriptEvidence`、`FrameEvidence`、`OcrEvidence`。
- 建立 `ReasoningClaim` 和 `ReasoningEvidenceRef`。
- 对文稿、画面、OCR 三种模态显式记录 `available/missing/failed` 和原因。
- 校验证据 ID 唯一性、时间范围、视频时长边界和跨对象引用。
- 覆盖率先合并重叠时间段，再计算覆盖时长及比例。
- `observation` 和 `inference` 必须有视频证据。
- `recommendation` 必须有视频证据或 RAG 知识引用。
- 返回对象复制数组和嵌套引用，避免调用方修改输入后绕过校验。

### TDD 证据

红灯：

- 先建立 `tests/VideoEvidence.test.ts`。
- 初次运行因领域模块不存在失败。

绿灯：

```text
领域测试：13 项通过
全量测试：39 个测试文件，238 项通过
Next.js production build：通过
git diff --check：无代码格式错误，仅有现存 LF/CRLF 提示
```

### 发现并修复的 Bug

1. 重叠时间切片如果直接累计，会让分析覆盖率超过真实覆盖范围。
   - 修复：覆盖区间排序并合并后再累计。
2. OCR 证据可能引用不存在的抽帧。
   - 修复：创建证据包时校验 `frameId`。
3. 模态被声明为缺失或失败时仍可能携带伪证据。
   - 修复：模态状态与证据数组必须保持一致。
4. 模型推理可能返回没有依据的观察和推断。
   - 修复：领域工厂拒绝无证据的 `observation/inference`。

### 当前不足

- 当前领域模型只定义证据元数据，不携带模型实际需要的图片内容或可访问 URI。
- `TimelineSlice` 尚未由现有媒体结果自动构建。
- 没有场景切换检测，切片策略仍未实现。
- 目前只校验证据引用存在，没有进一步校验引用证据是否真的落在声明时间段内。
- 领域错误信息使用英文，后续 API 层需要转换为用户可行动中文文案。

## 2026-07-10：关键节点 3 - 自适应采样策略与证据构建

### 完成内容

- 新增纯领域函数 `createAdaptiveSamplingPlan`。
- 前五秒与最后五秒按约 2 FPS 生成密集采样点。
- 中段按四秒间隔生成采样点。
- 场景边界前后生成补充采样点。
- 采样点去重、排序并执行 80 帧硬上限。
- 超过上限时优先保留开头、结尾和分布式场景变化点。
- 新增应用用例 `buildVideoEvidenceBundle`。
- 将 FunASR 秒级文稿片段转换为毫秒证据。
- 将抽帧转换为领域帧证据和独立 `ModelFrameAsset` 技术映射。
- 将 PaddleOCR 信号对齐到抽帧。
- 默认生成 20 秒时间切片并标记开头、中段和结尾。
- 领域证据包不包含本地文件路径。
- fallback 文稿的零长度片段扩展到视频分析范围。

### TDD 证据

红灯：

- 先新增采样策略和证据构建测试。
- 初次运行因两个模块均不存在而失败。

绿灯：

```text
节点测试：2 个测试文件，9 项通过
全量测试：41 个测试文件，247 项通过
Next.js production build：通过
git diff --check：无代码格式错误，仅有现存 LF/CRLF 提示
```

### 发现并修复的 Bug

1. 固定五秒抽帧会漏掉短视频前三秒和结尾悬念。
   - 修复：开头和结尾使用密集采样计划。
2. OCR 使用 `frameIndex`，领域证据使用 `frameId`，可能发生错配。
   - 修复：应用用例显式建立帧索引映射，未知帧直接拒绝。
3. fallback 文稿返回 `start=0/end=0`，无法形成合法证据区间。
   - 修复：将 fallback 零长度文稿扩展到完整分析范围。
4. 本地帧路径如果进入报告或领域 DTO，会泄露基础设施细节。
   - 修复：路径只保存在 `ModelFrameAsset` 技术映射中。

### 当前不足

- 当前 FFmpeg 适配器仍按固定间隔实际抽帧，尚未执行自适应采样计划。
- 尚未接入 FFprobe，真实视频时长还没有统一来源。
- 场景边界目前只能作为外部输入，尚无自动检测适配器。
- 时间切片固定 20 秒，尚未利用场景边界动态调整。
- 模型网关尚未消费 `frameAssets` 与 `VideoEvidenceBundle`。

## 当前 Bug

| ID | 严重度 | 状态 | 描述 |
| --- | --- | --- | --- |
| LLM-BUG-001 | P1 | 待处理 | 任务失败后不能从具体 v2 阶段断点恢复 |
| LLM-BUG-002 | P2 | 待处理 | 客户端任务状态使用宽泛 `string`，编译期无法发现状态遗漏 |
| LLM-BUG-003 | P2 | 待处理 | 开发环境持续显示 Vite CJS API 弃用提示 |
| LLM-BUG-004 | P1 | 待处理 | 推理引用的证据 ID 存在，但尚未校验对应时间点是否落在引用区间 |
| LLM-BUG-005 | P0 | 处理中 | 主编排没有可靠视频时长，证据包尚未接入真实分析任务 |

## 下一节点

增加 `MediaProbePort` 与 FFprobe 适配器，并把证据包接入 `runVideoAnalysisJob`：

- 优先使用 FFprobe 真实时长、分辨率和帧率。
- FFprobe 不可用时使用转写时长、片段尾部或最后抽帧进行可解释估算。
- 记录时长来源和探测失败日志。
- v2 任务返回标准化证据包，供下一节点模型端口使用。

## 2026-07-10：关键节点 4 - FFprobe 媒体探测与证据包接入主编排

### 完成内容

- 新增 `MediaProbePort`、`MediaProbeRequest`、`MediaProbeResult`，作为 application 层媒体元数据探测端口。
- 在 `FfmpegMediaProcessing` 中新增 `FfmpegMediaProbe`，调用 `ffprobe` 读取真实视频时长、分辨率和帧率。
- `NodeCommandRunner` 支持收集 `stdout`，供 FFprobe JSON 解析使用，同时保留 `stderr` 作为失败原因。
- `runVideoAnalysisJob` 在 `extracting_audio` 阶段先执行媒体探测。
- FFprobe 失败时写入 recoverable error：`SOURCE_MEDIA_PROBE_UNAVAILABLE`，stage 为 `extracting_audio`。
- `runVideoAnalysisJob` 已把转写、抽帧、OCR 和时长信息汇总为 `evidenceBundle`。
- 证据包时长来源优先级：FFprobe、转写 duration、转写片段最大 end、最后一帧时间戳 + 抽帧间隔、60 秒兜底。
- `app/api/upload-video/route.ts` 和 `app/api/video-analysis-jobs/route.ts` 已注入 `FfmpegMediaProbe`。
- `VideoEvidenceBundle` 不携带本地帧路径，路径只保留在 `frameAssets` 技术映射中。

### TDD 证据

红灯：

```text
npm test -- --run tests/FfmpegMediaProbe.test.ts tests/runVideoAnalysisJob.test.ts

失败 5 项：
- FfmpegMediaProbe is not a constructor
- result.evidenceBundle 为 undefined
```

绿灯：

```text
定向测试：2 个测试文件，13 项通过
全量测试：42 个测试文件，251 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug

1. `FfmpegMediaProbe` 未实现，导致基础设施契约测试无法实例化。
   - 修复：新增 FFprobe adapter，并解析 `format.duration`、视频流宽高与帧率。
2. 命令执行器只收集 `stderr`，无法消费 FFprobe 的 JSON `stdout`。
   - 修复：`CommandResult` 增加 `stdout`，`NodeCommandRunner` 同时收集标准输出与错误输出。
3. 主编排没有返回 `evidenceBundle`，后续大模型端口没有稳定输入。
   - 修复：在 OCR 之后构建 `BuildVideoEvidenceBundleResult` 并随任务结果返回。
4. FFprobe 不可用时如果直接中断，会破坏本地 MVP 降级链路。
   - 修复：探测失败只写 recoverable error，并用转写或抽帧信号估算时长。

### 当前不足

- `FfmpegFrameSampler` 仍按固定间隔实际抽帧，尚未执行 `AdaptiveSamplingPolicy` 生成的采样计划。
- 自动场景切换检测尚未实现，`scene_change` 采样原因目前只能由后续外部输入支持。
- `evidenceBundle` 当前只作为 `runVideoAnalysisJob` 返回结果，尚未持久化到 report 或单独 evidence store。
- 大模型端口还未消费 `evidenceBundle` 与 `frameAssets`，视觉理解仍然使用现有规则 fallback。
- 证据包时长来源尚未写入结构化 metadata，后续 ModelRun 或 report 需要展示该来源。
- `ReasoningClaim` 仍只校验证据 ID 存在，尚未校验引用时间段与证据时间点的严格包含关系。

### 下一节点

进入 `P0-4/P0-5`：定义 `MultimodalUnderstandingPort`，增加 fake adapter 与 slice-level understanding use case，让本地链路在没有真实云端模型的情况下也能跑通“证据包 -> 分段视觉理解 -> 时序推理”的 TDD 闭环。

## 2026-07-10：关键节点 5 - 多模态理解端口、Fake Adapter 与分段视觉理解用例

### 完成内容

- 新增领域模型 `MultimodalUnderstanding.ts`，定义 `SliceVisualObservation`、`ModelExecutionSummary`、`SubtitleLegibility`。
- 新增领域工厂 `createSliceVisualObservation`，对模型输出进行运行时校验。
- 新增 `MultimodalUnderstandingPort`，以 provider-neutral contract 表达分段视觉理解能力。
- 新增 `understandVideoSlices` 用例，逐个消费 `VideoEvidenceBundle.timelineSlices`。
- 用例会按切片过滤 `frameAssets`，模型端口能看到本地帧路径，但返回的领域 observation 不携带路径。
- 单个切片失败时返回 `partial`，保留成功切片 observation、失败原因和成功覆盖率。
- 所有切片失败时返回 `failed`，不伪造成完整视觉理解。
- 新增 `FakeMultimodalUnderstandingClient`，用于本地演示和 application TDD，不依赖真实云端模型。
- fake adapter 输出带证据引用的 observation claim，provider 标记为 `fake`。

### TDD 证据

红灯：

```text
npm test -- --run tests/understandVideoSlices.test.ts

失败原因：
- understandVideoSlices 用例不存在
- MultimodalUnderstandingPort 不存在
- FakeMultimodalUnderstandingClient 不存在
```

绿灯：

```text
定向测试：1 个测试文件，4 项通过
全量测试：43 个测试文件，255 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 大模型输出如果没有 evidenceRefs，可能把无来源观察写入后续评估。
   - 修复：`createSliceVisualObservation` 要求每个 slice observation 至少包含一个 claim，且 observation/inference claim 必须通过 `createReasoningClaim` 校验。
2. 模型 claim 引用的证据 ID 即使存在，也可能不落在声明的时间段内。
   - 修复：slice observation 校验会检查 frame/OCR 时间点、transcript overlap 与 claim evidence range 的关系。
3. 单个切片模型失败如果直接抛错，会破坏长视频的可降级分析。
   - 修复：`understandVideoSlices` 将单切片失败归档为 `SOURCE_MULTIMODAL_MODEL_UNAVAILABLE`，并继续处理其他切片。
4. 本地 fake adapter 如果把帧路径写入领域结果，后续报告可能泄露基础设施路径。
   - 修复：路径只作为端口输入进入 adapter，observation 输出不包含 path。

### 当前不足

- `understandVideoSlices` 还未接入 `runVideoAnalysisJob` 主编排，当前仍是独立用例。
- 目前只完成 Pass A：slice-level visual observation，尚未实现 Pass B：temporal reasoning / 跨片段叙事推理。
- fake adapter 只能根据 transcript/OCR/帧存在性生成确定性观察，不代表真实视觉理解质量。
- 尚未实现模型运行记录持久化 `ModelRunRepositoryPort`。
- 尚未实现 provider schema repair、超时重试、认证错误不重试、凭证脱敏等 adapter contract。
- `MultimodalUnderstanding` 的完整视频级结构尚未沉淀，当前先以切片观察作为下一步推理输入。

### 下一节点

进入 `P0-6`：新增 temporal reasoning 用例与 fake reasoning adapter，把多个 `SliceVisualObservation` 汇总为视频级 narrative / visualCraft / aiDrama signals，并准备接入 `runVideoAnalysisJob` 的 `reasoning` 阶段。

## 2026-07-10：关键节点 6 - 视频级时序推理端口与 Fake Reasoning Adapter

### 完成内容

- 扩展 `MultimodalUnderstanding.ts`，新增视频级 `MultimodalUnderstanding` 领域模型。
- 新增 `MultimodalNarrative`、`MultimodalVisualCraft`、`AiDramaUnderstanding`、`MultimodalEvidenceCoverage`。
- 新增领域工厂 `createMultimodalUnderstanding`，对 reasoning 输出执行运行时校验。
- 新增 `ContentReasoningPort`，将视频级时序推理与具体模型 provider 隔离。
- 新增 `reasonAboutVideo` 用例，将多个 `SliceVisualObservation` 汇总为视频级理解结果。
- 新增 `FakeContentReasoningClient`，本地可在无真实云模型时生成 narrative、visualCraft 和 AI 漫剧字段。
- 没有切片观察时，`reasonAboutVideo` 返回 `ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT`，不伪造推理结果。
- reasoning 输出无证据引用时，返回 `ANALYSIS_MULTIMODAL_OUTPUT_INVALID`。
- fake reasoning 会根据覆盖率设置 `execution.partial`，并对 AI 漫剧输出 conflict、reversals、cliffhanger、seriesPotential。

### TDD 证据

红灯：

```text
npm test -- --run tests/reasonAboutVideo.test.ts

失败原因：
- reasonAboutVideo 用例不存在
- ContentReasoningPort 不存在
- FakeContentReasoningClient 不存在
- MultimodalUnderstanding 视频级结构尚未定义
```

绿灯：

```text
定向测试：1 个测试文件，4 项通过
全量测试：44 个测试文件，259 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 视频级 reasoning 如果直接信任模型输出，可能生成没有证据支撑的 narrative hook 或 AI 漫剧判断。
   - 修复：`createMultimodalUnderstanding` 复用 `createReasoningClaim` 并校验证据时间范围。
2. 无切片观察时继续推理会产生空洞报告。
   - 修复：`reasonAboutVideo` 在调用端口前直接返回 `ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT`。
3. provider 失败如果直接抛出，会破坏后续 fallback 编排。
   - 修复：`reasonAboutVideo` 将异常与失败结果统一归档为 `SOURCE_VIDEO_REASONING_UNAVAILABLE`。
4. AI 漫剧字段如果散落在报告生成阶段，后续很难做 schema 校验。
   - 修复：先在 `AiDramaUnderstanding` 中固定 conflict、reversals、styleDrift、cliffhanger、seriesPotential。

### 当前不足

- `reasonAboutVideo` 仍是独立用例，尚未接入 `runVideoAnalysisJob` 的 `reasoning` 阶段。
- 当前 fake reasoning 只能基于已有切片 observation 生成确定性推理，不代表真实模型质量。
- 还没有 `ModelRunRepositoryPort` 记录 reasoning 的 prompt/schema/model/latency/retry。
- 还没有真实 provider adapter、schema repair、retry policy、成本预算与凭证脱敏测试。
- `MultimodalUnderstanding` 尚未进入 `VideoAnalysisReport`，前端仍看不到 analysisMode、coverage、timestamp evidence。
- P1 RAG 查询生成仍未接入 reasoning claims。

### 下一节点

进入 `P0-7`：把 `understandVideoSlices` 与 `reasonAboutVideo` 接入 `runVideoAnalysisJob` 的 v2 `visually_understanding` / `reasoning` 阶段，并将 `analysisMode`、coverage、timestamp evidence 安全地投影到报告或 API 结果中。

## 2026-07-10：关键节点 7 - 多模态理解接入主编排与报告投影

### 完成内容

- `runVideoAnalysisJob` 新增 `multimodalUnderstanding` 与 `contentReasoner` 两个依赖端口。
- v2 工作流在 `visually_understanding` 阶段调用 `understandVideoSlices`。
- v2 工作流在 `reasoning` 阶段调用 `reasonAboutVideo`。
- `RunVideoAnalysisJobResult` 新增：
  - `sliceUnderstanding`
  - `videoReasoning`
  - `multimodalUnderstanding`
- `/api/upload-video` 与 `/api/video-analysis-jobs` 已注入 `FakeMultimodalUnderstandingClient` 和 `FakeContentReasoningClient`，本地演示不依赖云端模型密钥。
- `VideoAnalysisReport` 新增：
  - `analysisMode`
  - `modelSummary`
- `VideoObservation` 扩展：
  - `claims`
  - `narrative`
  - `visualCraft`
- `analyzeUploadedVideo` 支持把 `MultimodalUnderstanding` 投影到最终报告。
- 成功推理时报告标记为 `analysisMode=multimodal`，并写入 provider、model、promptVersion、schemaVersion、coverageRatio、partial。
- 多模态失败时仍保留现有规则/文本报告链路，`analysisMode` 可降级为 `text_only` 或 `rules_fallback`。
- 上传 API 测试已更新：报告 understanding 不再要求等于旧 `videoObservation`，而是允许多模态增强字段存在。

### TDD 证据

红灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts

失败原因：
- result.sliceUnderstanding 为 undefined
- result.videoReasoning 为 undefined
- 主编排没有调用 slice understanding / temporal reasoning
- 报告没有 analysisMode / modelSummary / narrative / visualCraft
```

第二轮红灯：

```text
npm test

失败原因：
- uploadVideoRoute 旧契约要求 report.understanding 完全等于 videoObservation
- P0-7 后 report.understanding 已包含多模态 claims、narrative、visualCraft，因此需要更新 API 契约测试
```

绿灯：

```text
定向测试：tests/runVideoAnalysisJob.test.ts，11 项通过
全量测试：44 个测试文件，260 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. v2 状态已经有 `visually_understanding` 和 `reasoning`，但此前只是空阶段，没有真实调用多模态端口。
   - 修复：主编排在两个阶段分别调用 `understandVideoSlices` 与 `reasonAboutVideo`。
2. 上传 API 旧断言把 `report.understanding` 锁死为规则观察，阻碍多模态报告扩展。
   - 修复：更新测试为兼容性契约：旧 `videoObservation` 继续返回，报告 understanding 可包含多模态增强字段。
3. 多模态部分失败如果静默继续，会让用户误以为完整视觉理解成功。
   - 修复：`sliceUnderstanding` 非 completed 时写 recoverable error，包含 status 和 failures。
4. reasoning 失败如果直接抛出，会破坏 fallback 报告生成。
   - 修复：`reasonAboutVideo` 失败只写 recoverable error，最终报告降级到 `text_only` 或 `rules_fallback`。
5. 报告如果只写模型结论、不写覆盖率和模型版本，后续难以判断可信度。
   - 修复：新增 `modelSummary`，记录 provider/model/prompt/schema/coverage/partial。

### 当前不足

- 当前主编排使用 fake 多模态 adapter，不代表真实视觉模型效果。
- `analysisMode` 已进入报告，但前端还没有明确展示 modelSummary、coverageRatio 和 timestamp evidence。
- `VideoObservation.claims` 当前会包含较多 fake claim，后续需要按产品展示场景裁剪关键结论。
- `modelSummary.analyzedDurationMs` 当前使用已分析覆盖时长，不等于完整视频时长；后续应同时展示 analyzedDurationMs 与 totalDurationMs。
- 多模态运行记录尚未持久化到 `storage/model-runs/{jobId}`。
- RAG 检索仍然基于原始文本和规则分析，尚未使用 narrative claims 与 visual weaknesses 自动生成查询。
- `analysisMode` 在仓储校验层仍保持向后兼容，允许旧报告缺失该字段；后续迁移稳定后可以收紧新报告写入校验。

### 下一节点

进入 P0 收尾 / P1 起点：先把 `analysisMode`、coverage、timestamp evidence 投影到前端；随后进入 P1 RAG 查询生成，让 narrative claims、visualCraft weak points 和 AI 漫剧信号参与知识检索与建议生成。

## 2026-07-10：关键节点 8 - 前端大模型证据展示

### 完成内容

- `UploadPipelineSummary` / `VideoAnalysisFocus` 标题区新增大模型元信息展示。
- 前端现在会显示：
  - `Mode: Multimodal` / `Mode: Text Only` / `Mode: Rules Fallback`
  - `Coverage: xx%`
  - `Evidence: mm:ss-mm:ss`
  - partial reasoning 时显示 `Partial analysis`
- 时间戳证据来自 `report.understanding.claims[0].evidenceRefs[0]`，避免前端自行伪造证据。
- 覆盖率来自 `report.modelSummary.coverageRatio`，和后端模型运行摘要保持一致。

### TDD 证据

红灯：

```text
npm test -- --run tests/UploadPipelineSummary.test.tsx

失败原因：
- 找不到 Mode: Multimodal
- 后续断言 Coverage: 100% 和 Evidence: 00:00-00:03 也缺少对应 UI
```

绿灯：

```text
定向测试：tests/UploadPipelineSummary.test.tsx，1 项通过
全量测试：44 个测试文件，260 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 后端已经写入 `analysisMode` 和 `modelSummary`，但前端不展示，用户无法判断报告是否真的使用多模态理解。
   - 修复：在报告标题区展示模式、覆盖率和证据时间范围。
2. 只展示“分析完成 · 100%”会把任务进度误解成模型证据覆盖率。
   - 修复：任务进度保留在右侧，模型覆盖率独立展示为 `Coverage`。
3. 证据时间如果以毫秒裸值展示，不利于用户回看视频。
   - 修复：统一格式化为 `mm:ss-mm:ss`。

### 当前不足

- 前端目前只展示第一条 claim 的第一段证据，还不能按“文案 / 分镜 / 爆点”分别展示关键证据。
- 时间戳证据仍是静态文本，尚未支持点击后跳转到视频对应时间。
- `modelSummary.analyzedDurationMs` 还未和完整视频时长并列展示。
- partial 状态只显示英文 `Partial analysis`，后续需要统一为产品中文文案。
- 当前展示仍基于 fake 多模态 adapter，不代表真实视觉模型质量。

### 下一节点

进入 P1 RAG 查询生成：从 `narrative`、`visualCraft`、`aiDramaSignals` 和 evidence-backed claims 中生成检索词，让知识库召回结果由大模型理解结果驱动，而不是只依赖原始文稿和规则标签。

## 2026-07-10：关键节点 9 - P1 模型信号驱动 RAG 检索

### 完成内容

- `MvpInput` 新增可选 `modelSignals`，保持旧的 `retrieveKnowledge` / `retrieveKnowledgeEvidence` 调用兼容。
- `retrieveKnowledgeEvidence` 支持把模型信号作为独立检索依据：
  - 命中知识库 `appliesWhen` 时额外加权。
  - `matchReasons` 写入 `model-signal: ...`，让最终报告能解释知识召回来源。
- 本地知识库新增 AI 漫剧和视觉质量相关策略：
  - `ai-drama-reversal`
  - `subtitle-readability`
  - `visual-style-continuity`
- `analyzeUploadedVideo` 会从 `MultimodalUnderstanding` 提取 RAG 信号：
  - `contentType=ai_drama`
  - 分段 `aiDramaSignals`
  - narrative / visualCraft / aiDrama claims 中的身份反转、悬念、字幕可读性、风格漂移等关键词
- 最终 `report.knowledgeEvidence` 和 `knowledgeUsed` 已能被多模态结论增强，而不是只依赖原始标题、文稿和评论。

### TDD 证据

红灯：

```text
npm test -- --run tests/retrieveKnowledgeEvidence.test.ts tests/analyzeUploadedVideo.test.ts

失败 2 项：
- retrieveKnowledgeEvidence 无法通过 modelSignals 召回 ai-drama-reversal
- analyzeUploadedVideo 没有把 multimodalUnderstanding 生成的 identity reversal 信号送入 RAG
```

绿灯：

```text
定向测试：2 个测试文件，13 项通过
全量测试：44 个测试文件，262 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 多模态 reasoning 已识别出身份反转、结尾悬念、字幕可读性和风格漂移，但 RAG 仍只看原始文稿，会漏召回 AI 漫剧专项知识。
   - 修复：`analyzeUploadedVideo` 新增 `buildRagModelSignals`，把多模态结论转成检索信号。
2. 如果只是把模型结论拼进 `sampleText`，报告无法说明哪些知识来自模型观察。
   - 修复：`retrieveKnowledgeEvidence` 对模型信号单独写 `model-signal: ...` 匹配原因。
3. 知识库缺少 AI 漫剧反转、字幕可读性和 AI 画风连续性策略，模型信号即使出现也没有可召回知识。
   - 修复：补充三条本地策略，先用 keyword fallback 验证 P1 价值。

### 当前不足

- 目前仍是 keyword fallback 检索，不是向量检索；语义近似能力有限。
- `buildRagModelSignals` 只抽取少量 canonical signals，尚未覆盖完整脚本优秀度、分镜、审美体验维度。
- 模型信号没有携带 evidenceRef 到 RAG 结果，报告只能说明来自 `model-signal`，不能直接跳到对应视频时间。
- 知识库仍是静态 TypeScript 数组，缺少面向 AI 漫剧的系统化知识文档、版本号和来源。
- top 4 截断可能让多个模型信号竞争时丢掉弱但重要的审美/分镜知识，后续需要分桶召回或按维度配额。

### 下一节点

继续 P1：抽象 `KnowledgeRetrievalPort` / `retrieveEvaluationKnowledge` 用例，保留当前 keyword fallback，同时为后续向量库、知识版本、RAG 证据时间戳和召回缓存留出边界。

## 2026-07-11：关键节点 10 - P1 Knowledge Port 与 RAG 用例边界

### 完成内容

- 新增 `KnowledgeRepositoryPort`，application 层通过端口检索知识，不再直接依赖具体知识库实现。
- 新增 `retrieveEvaluationKnowledge` 用例：
  - 统一接收 `KnowledgeQuery`。
  - 返回 `RetrievedKnowledge[]`，保留分数和 `matchReasons`。
  - 对重复知识按 ID 去重，并保留最高分版本。
  - 支持 `limit` 限制。
  - repository 异常时返回显式 `failed` 结果，不阻断报告生成。
- 新增 `LocalKnowledgeRepository`，封装当前 keyword fallback 检索，作为后续向量库替换点。
- `analyzeUploadedVideo` 改为通过 `KnowledgeRepositoryPort` 获取 RAG 依据，并输出 `knowledgeRetrieval` 摘要。
- `VideoAnalysisReport` 新增可选 `knowledgeSummary`，保存知识检索状态、证据数量和失败原因。
- `runVideoAnalysisJob` 在 RAG 检索失败时追加 recoverable error：
  - code: `SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE`
  - stage: `retrieving_knowledge`
- `/api/analyze-uploaded-video`、`/api/upload-video`、`/api/video-analysis-jobs` 已在组合根注入 `LocalKnowledgeRepository`。

### TDD 证据

红灯：

```text
npm test -- --run tests/retrieveEvaluationKnowledge.test.ts tests/analyzeUploadedVideo.test.ts

失败原因：
- retrieveEvaluationKnowledge 用例不存在
- analyzeUploadedVideo 忽略注入的 KnowledgeRepositoryPort，仍使用静态 engine 检索
```

第二轮红灯：

```text
npm test -- --run tests/LocalKnowledgeRepository.test.ts tests/runVideoAnalysisJob.test.ts

失败原因：
- LocalKnowledgeRepository adapter 测试已通过
- runVideoAnalysisJob 没有记录知识仓储失败的 recoverable error
```

绿灯：

```text
定向测试：4 个测试文件，29 项通过
全量测试：46 个测试文件，270 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. `analyzeUploadedVideo` 直接使用静态 engine 检索，后续接向量库或缓存会污染 application 层。
   - 修复：抽出 `KnowledgeRepositoryPort`，并由 API / job 组合根注入本地 adapter。
2. RAG 检索失败时如果只返回空知识，用户和日志都无法区分“没有命中”和“仓储不可用”。
   - 修复：`retrieveEvaluationKnowledge` 返回 `failed` 状态；报告写入 `knowledgeSummary`；任务日志写入 recoverable error。
3. 多个检索源或 future hybrid retrieval 可能返回重复知识，导致报告依据重复。
   - 修复：用例层按知识 ID 去重，保留最高分版本。
4. Adapter 如果丢弃 `matchReasons`，最终报告会退化成不可解释 RAG。
   - 修复：`LocalKnowledgeRepository` 契约测试覆盖 keyword reason 与 model-signal reason。

### 当前不足

- `KnowledgeRepositoryPort` 仍是 keyword fallback adapter，没有真实向量检索、embedding 或 hybrid rerank。
- `knowledgeSummary` 当前是可选字段，历史报告兼容期尚未收紧仓储校验。
- `SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE` 已在运行日志使用，但错误码文档还需要同步到 `docs/ERROR-HANDLING.md`。
- RAG 结果仍没有携带时间戳 evidenceRef，不能从知识依据直接跳回视频证据。
- 缓存键、知识版本、召回成本预算和向量库评测集尚未实现。

### 下一节点

继续 P1：补齐知识检索错误码文档与 API 契约说明，然后推进 `ModelRunRepositoryPort` 或 RAG 缓存/知识版本化，优先解决“可追踪、可复现、可评测”的模型运行闭环。

## 2026-07-11：关键节点 11 - P1 ModelRunRepository 与模型运行观测

### 完成内容

- 同步文档欠账：
  - `docs/ERROR-HANDLING.md` 新增 `SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE` 降级规则和测试要求。
  - `docs/API-CONTRACT.md` 新增 `knowledgeRetrieval` / `knowledgeSummary` 契约说明。
- 新增 `ModelRunRepositoryPort` 与 `ModelRunRecord`：
  - `traceId`
  - `jobId`
  - `stage`
  - `sliceId`
  - provider / model
  - promptVersion / schemaVersion
  - inputHash
  - startedAt
  - latencyMs
  - retryCount
  - status
  - partial
- 新增 `LocalJsonModelRunRepository`，本地写入 `storage/model-runs/{jobId}/{runId}.json`。
- `runVideoAnalysisJob` 已在两个模型阶段持久化运行记录：
  - `visually_understanding`：按成功的 slice observation 保存。
  - `reasoning`：保存视频级 temporal reasoning。
- model-run 持久化失败时不阻断报告生成，写 recoverable error：
  - code: `SYSTEM_MODEL_RUN_PERSISTENCE_FAILED`
  - stage: 对应模型阶段

### TDD 证据

红灯：

```text
npm test -- --run tests/LocalJsonModelRunRepository.test.ts tests/runVideoAnalysisJob.test.ts

失败原因：
- LocalJsonModelRunRepository 模块不存在
- runVideoAnalysisJob 没有调用 modelRunRepository.save
- model run 保存失败没有写 SYSTEM_MODEL_RUN_PERSISTENCE_FAILED
```

绿灯：

```text
定向测试：2 个测试文件，17 项通过
全量测试：47 个测试文件，275 项通过
Next.js production build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 多模态 fake adapter 已返回 provider/model/prompt/schema/latency，但此前只进入报告摘要，没有可审计的独立运行记录。
   - 修复：新增 `ModelRunRecord` 并在主编排持久化。
2. 如果把原始视频或帧路径写进模型运行记录，后续会造成存储膨胀和路径泄漏。
   - 修复：只保存 `inputHash` 和运行元数据，不保存原始视频、帧路径或完整 prompt。
3. model-run 仓储失败如果抛出，会破坏已可用的分析报告。
   - 修复：`persistModelRunSafely` 捕获错误并写 `SYSTEM_MODEL_RUN_PERSISTENCE_FAILED`，主链路继续。
4. 本地仓储如果不校验 jobId/runId，可能出现路径穿越或无法读取的坏记录。
   - 修复：复用安全 jobId 校验，并增加 runId、stage、时间戳、latency、retry、status、partial 校验。

### 当前不足

- 当前只保存成功 slice 和成功 reasoning 的运行记录；失败模型调用尚未保存 provider-level 失败记录，只在 error log 中体现。
- `retryCount` 暂时固定为 0，真实 provider adapter 接入后需要从 retry policy 写入。
- `inputHash` 使用当前结构化摘要计算，尚未统一为跨 provider 的 canonical input schema hash。
- 没有查询 API 暴露 model runs，当前只能通过仓储或文件读取。
- 还没有成本字段的真实 token/media usage，`usage` 预留但未接入。
- model-run 文件当前按 `runId` 覆盖写入；同一任务重试相同 runId 时会覆盖旧记录，后续需要 attempt 序号。

### 下一节点

继续 P1：推进 prompt/rubric 版本管理和模型运行缓存键设计，让 `ModelRunRecord.inputHash + promptVersion + schemaVersion + model` 可以成为后续 slice 缓存、成本预算和评测回放的共同基础。

## 2026-07-11：关键节点 12 - P1 Rubric 版本、ModelRun CacheKey 与查询 API

### 完成内容

- 新增 `src/domain/evaluation/EvaluationRubric.ts`：
  - 评估版本：`bowen-content-evaluation-v1`
  - 校验摘要：`e72db704602f`
  - 固定维度：`scriptQuality`、`hookStrength`、`sceneDesign`、`aestheticExperience`、`emotionalRhythm`、`differentiation`、`viralPotential`、`aiDramaFit`
- `analyzeUploadedVideo` 新生成报告会在 `evaluation.rubric` 写入 rubric 版本摘要，方便后续评测回放和报告版本追踪。
- `ModelRunRecord` 新增 `cacheKey`，由 `inputHash + model + promptVersion + schemaVersion` 生成，作为后续 slice 缓存、成本预算和评测回放的基础键。
- `runVideoAnalysisJob` 的 model-run 创建逻辑改为只计算一次 `inputHash`，同时复用到 `inputHash` 字段和 `cacheKey` 生成。
- 新增 `listModelRunsForJob` 用例，按 `jobId` 查询模型运行记录，并输出审计摘要：
  - 总数、成功数、失败数、partial 数
  - `visually_understanding` / `reasoning` / `evaluation` 阶段分布
  - 已生成的 `cacheKeys`
- 新增 `GET /api/video-analysis-jobs/:jobId/model-runs`：
  - 成功返回 `modelRuns` 和 `summary`
  - 无记录返回空成功列表
  - 非法任务 ID 返回 `PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID`
  - 损坏记录或仓储异常返回 `SYSTEM_MODEL_RUN_QUERY_FAILED` 并写 `querying_model_runs` 错误日志
- 同步文档：
  - `docs/API-CONTRACT.md` 增加 model-run 查询接口契约。
  - `docs/ERROR-HANDLING.md` 增加 model-run 查询失败规则和测试要求。

### TDD 证据

Rubric/cacheKey 定向绿灯：

```text
npm test -- --run tests/EvaluationRubric.test.ts tests/analyzeUploadedVideo.test.ts tests/LocalJsonModelRunRepository.test.ts tests/runVideoAnalysisJob.test.ts

4 个测试文件，31 项通过
```

model-run 查询红灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/runVideoAnalysisJob.test.ts

失败原因：
- listModelRunsForJob 用例不存在
- /api/video-analysis-jobs/:jobId/model-runs route 不存在
- 已有 runVideoAnalysisJob 测试仍通过，说明红灯集中在新增查询能力
```

model-run 查询绿灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/runVideoAnalysisJob.test.ts

3 个测试文件，20 项通过
```

全量验证：

```text
npm test：50 个测试文件，283 项通过
npm run build：通过，Next route 清单包含 /api/video-analysis-jobs/[jobId]/model-runs
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. `createModelRunRecord` 同一份输入重复计算两次 hash，虽然结果一致，但后续缓存键演进时容易出现维护分叉。
   - 修复：先生成 `const inputHash`，再同时写入 `inputHash` 和 `cacheKey`。
2. rubric 维度此前只体现在评分字段里，报告无法说明自己遵循哪个评估版本，后续评测集和 Prompt 改版难以回放。
   - 修复：新增稳定 rubric summary，并写入 `report.evaluation.rubric`。
3. model-run 已落盘但没有查询入口，只能直接读本地文件，无法支撑前端诊断、评测回放或缓存命中分析。
   - 修复：新增应用用例和 HTTP 查询接口，保持 API route 只负责参数校验、用例调用和结构化响应。
4. model-run 查询如果遇到损坏记录，不能返回 `success:true`，否则会误导诊断工具。
   - 修复：route 捕获仓储异常，返回 `SYSTEM_MODEL_RUN_QUERY_FAILED`，并写入 `querying_model_runs` 日志。

### 当前不足

- `cacheKey` 已生成但尚未真正用于跳过重复 slice 分析，下一步需要增加缓存读取策略和命中日志。
- rubric checksum 目前是稳定常量，后续应由 rubric 定义内容自动计算，避免人工更新遗漏。
- model-run 查询接口目前不分页；大量 slice 或多次重试后需要增加分页、attempt 序号和时间范围过滤。
- model-run 仍只保存成功 slice 和成功 reasoning；provider-level 失败运行记录仍主要依赖 error log。
- `usage` 字段还没有真实 token、图片帧数和媒体秒数成本数据。
- 查询 API 只暴露后端接口，前端尚未显示模型运行诊断面板。

### 下一节点

继续 P1：围绕 `cacheKey` 增加可验证的 slice 级缓存策略，优先保证同一输入、同一模型、同一 prompt/schema 版本能复用结果，并在 model-run summary 中体现缓存命中与节省的模型调用。

## 2026-07-11：关键节点 13 - P1 Slice 级多模态理解缓存

### 完成内容

- 新增统一缓存键工具 `src/application/modelRunCacheKey.ts`：
  - `hashModelRunInput(input)`
  - `createModelRunCacheKey({ inputHash, model, promptVersion, schemaVersion })`
- `runVideoAnalysisJob` 与 slice 缓存共用同一套 cacheKey 生成规则，避免后续缓存键和 model-run 记录分叉。
- 新增 `SliceUnderstandingCachePort`：
  - `findByCacheKey(cacheKey)`
  - `save(record)`
  - 缓存记录只包含 `SliceVisualObservation`、`ModelExecutionSummary`、`inputHash`、`cacheKey`、`cachedAt`
- `MultimodalUnderstandingPort` 新增可选 `getSliceModelProfile()`，由 provider adapter 暴露缓存所需的模型、prompt 和 schema 版本。
- `understandVideoSlices` 新增缓存路径：
  - 有 cache 和 model profile 时先计算 slice 输入摘要与 cacheKey。
  - 命中缓存时复用 observation，并跳过 `understandSlice` 模型调用。
  - 未命中时调用模型，成功后写回缓存。
  - 返回 `cacheStats`：`hits`、`misses`、`writes`、`readFailures`、`writeFailures`。
- 新增 `LocalJsonSliceUnderstandingCache`，本地写入 `storage/slice-understanding-cache/{cacheKey}.json`。
- `/api/upload-video` 和 `/api/video-analysis-jobs` 组合根已注入本地 slice cache adapter。
- `docs/SEAMS-AND-PORTS.md` 增加 `SliceUnderstandingCachePort` 契约和安全约束。

### TDD 证据

红灯：

```text
npm test -- --run tests/understandVideoSlices.test.ts tests/LocalJsonSliceUnderstandingCache.test.ts

失败原因：
- LocalJsonSliceUnderstandingCache 模块不存在
- understandVideoSlices 尚未使用传入缓存，两个 slice 仍都会调用 multimodal port
```

绿灯：

```text
npm test -- --run tests/understandVideoSlices.test.ts tests/LocalJsonSliceUnderstandingCache.test.ts tests/runVideoAnalysisJob.test.ts tests/uploadVideoRoute.test.ts tests/createVideoAnalysisJobRoute.test.ts

5 个测试文件，30 项通过
```

全量验证：

```text
npm test：51 个测试文件，287 项通过
npm run build：通过
git diff --check：无 whitespace error，仅保留既有 LF/CRLF 提示
```

### 发现并修复的 Bug / 风险

1. 只有 `ModelRunRecord.cacheKey` 但没有缓存读取路径时，系统仍会重复调用 slice 视觉模型，无法验证缓存价值。
   - 修复：在 `understandVideoSlices` 里接入 `SliceUnderstandingCachePort`，命中后跳过 provider 调用。
2. 如果缓存记录绕过领域校验，坏的本地 JSON 会污染后续 reasoning 和报告。
   - 修复：缓存命中后仍调用 `createSliceVisualObservation` 重新校验 evidence refs 和 slice 时间范围。
3. 缓存如果保存 frame path 或原始 prompt，会带来路径泄漏、存储膨胀和提示词泄漏风险。
   - 修复：缓存输入只使用结构化 evidence 摘要；缓存记录只保存 normalized observation 与 execution metadata。
4. 缓存键生成规则如果散落在不同用例中，后续 prompt/schema 版本升级会出现难以复现的命中差异。
   - 修复：抽出 `modelRunCacheKey` 工具，model-run 记录和 slice cache 共用。

### 当前不足

- 缓存 read/write 失败当前只进入 `cacheStats`，还没有写入结构化错误日志或 model-run summary。
- 缓存目录没有按 job/video 分层；大量缓存文件后需要索引、清理策略和 TTL。
- `getSliceModelProfile()` 当前适合单一 fake adapter，真实 provider 如果按 slice 动态路由，需要把 profile 决策提升为显式 model policy。
- cacheKey 输入当前使用 `videoId` 而非真实视频内容 hash；同一内容以不同 assetId 上传时还不能跨资产复用。
- 缓存命中还没有进入前端诊断面板，也没有在 `GET /model-runs` summary 中体现节省调用。
- 缓存命中复用的是原始 execution metadata，尚未单独标记 `cacheHit` 或复用时间。

### 下一节点

继续 P1：把缓存命中信息纳入模型运行观测，至少让查询 API 或报告诊断能看到缓存命中、跳过调用数量和潜在节省成本。

## 2026-07-11：关键节点 14 - P1 缓存命中进入模型运行观测

### 完成内容

- `ModelRunRecord` 新增可选 `cache` 元数据：
  - `status`: `hit` / `miss` / `read_failed` / `write_failed`
  - `savedModelCall`: 是否因为缓存命中跳过一次模型调用
  - `cachedAt`: 命中的缓存写入时间
- `understandVideoSlices` 新增 `cacheOutcomes`：
  - 每个缓存参与的 slice 都会输出 `sliceId`、`inputHash`、`cacheKey`、`status`、`savedModelCall`。
  - 命中缓存时保留 `cachedAt`。
  - 缓存 miss、read failure、write failure 都有显式 outcome。
- `runVideoAnalysisJob` 将 slice 级 `cacheOutcomes` 写入对应的 `ModelRunRecord.cache`。
- `runVideoAnalysisJob` 的 slice model-run 现在优先使用真实 slice cache 的 `inputHash/cacheKey`，避免 model-run key 与实际缓存 key 分叉。
- `listModelRunsForJob` 的 summary 新增缓存审计：
  - `hits`
  - `misses`
  - `readFailures`
  - `writeFailures`
  - `savedModelCalls`
  - `estimatedSkippedModelCalls`
- `GET /api/video-analysis-jobs/:jobId/model-runs` 现在能直接展示缓存命中与节省调用数量。
- `LocalJsonModelRunRepository` 增加 `cache` 元数据运行时校验，损坏记录仍会被查询接口转成结构化 500。
- `docs/API-CONTRACT.md` 已同步 `summary.cache` 契约。

### TDD 证据

红灯：

```text
npm test -- --run tests/understandVideoSlices.test.ts tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/runVideoAnalysisJob.test.ts tests/LocalJsonModelRunRepository.test.ts

失败原因：
- understandVideoSlices 尚未返回 cacheOutcomes
- listModelRunsForJob summary 尚未聚合 cache 信息
- /model-runs route 响应中没有 summary.cache
- runVideoAnalysisJob 持久化的 slice model-run 没有 cache hit 标记
```

绿灯：

```text
定向测试：5 个测试文件，29 项通过
```

全量验证：

```text
npm test：51 个测试文件，288 项通过
npm run build：通过
```

### 发现并修复的 Bug / 风险

1. slice cache 的 `cacheKey` 与 `runVideoAnalysisJob` 持久化 model-run 时重新计算的 `cacheKey` 不是同一份输入摘要，后续会让“缓存命中”和“模型运行记录”无法对账。
   - 修复：`understandVideoSlices` 输出 `inputHash/cacheKey`，`runVideoAnalysisJob` 按 outcome 覆盖 model-run 的 `inputHash/cacheKey`。
2. 缓存命中虽然能跳过模型调用，但查询 API 看不出哪些运行来自缓存，也无法统计节省的调用数。
   - 修复：`ModelRunRecord.cache` + `summary.cache` 贯通到 `/api/video-analysis-jobs/:jobId/model-runs`。
3. 缓存命中复用的是持久化 observation，如果不进入 model-run 审计，后续评测回放无法区分“真实调用输出”和“复用历史输出”。
   - 修复：命中记录写 `cache.status=hit` 和 `savedModelCall=true`。
4. `npm run build` 暴露出 `import type { type ModelRunCacheStatus }` 语法错误，Vitest 转译未提前阻断。
   - 修复：改成统一 `import type { ModelRunCacheStatus }`，并重新通过生产构建。

### 当前不足

- `estimatedSkippedModelCalls` 目前只是跳过调用次数，还没有乘以真实 token、图片帧数或媒体秒数成本。
- 缓存 read/write failure 进入了 model-run summary，但还没有写入 `ErrorLogPort` 的结构化日志。
- 缓存命中还没有进入前端诊断面板，当前只能通过 `/model-runs` API 查看。
- `cache.status=miss` 表示模型调用后缓存写入成功；如果后续需要更细的成本分析，可能要拆成 `miss_written` 与 `miss_uncached`。
- 命中缓存的 execution latency 当前复用原始缓存记录中的模型 latency，尚未单独记录本次缓存读取耗时。
- cache key 仍使用 `videoId` 参与输入摘要，同内容跨资产复用仍未实现。

### 下一节点

继续 P1：补齐缓存失败的结构化错误日志，或向前推进真实成本预算字段，让 model-run 观测从“跳过调用数”升级为“可估算 token/media 成本”。

## 2026-07-11：关键节点 15 - P1 Slice Cache 失败结构化日志

### 完成内容

- `runVideoAnalysisJob` 新增 slice cache 诊断日志：
  - `SYSTEM_SLICE_UNDERSTANDING_CACHE_READ_FAILED`
  - `SYSTEM_SLICE_UNDERSTANDING_CACHE_WRITE_FAILED`
- 缓存读写失败不阻断主链路：
  - 读失败后继续调用多模态模型。
  - 写失败后继续完成分析报告和 model-run 持久化。
- 错误日志 detail 包含：
  - `readFailures` 或 `writeFailures`
  - 完整 `cacheStats`
  - `affectedSlices`
- `ModelRunRecord.cache` 增加可选 `readFailed` / `writeFailed` 标记，解决同一 slice 同时发生 read failure 和 write failure 时单个 `status` 表达不完整的问题。
- `listModelRunsForJob` 的 `summary.cache.readFailures/writeFailures` 现在会读取 `readFailed/writeFailed` 标记，不只依赖最终 `status`。
- `LocalJsonModelRunRepository` 增加 `cache.readFailed` 与 `cache.writeFailed` 的运行时校验。
- `docs/ERROR-HANDLING.md` 已补充 slice cache 读写失败的错误处理规则与测试要求。

### TDD 证据

红灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts

失败原因：
- 缓存 read/write failure 只进入 cacheStats，没有写入 ErrorLogPort
- 错误日志中缺少 SYSTEM_SLICE_UNDERSTANDING_CACHE_READ_FAILED
- 错误日志中缺少 SYSTEM_SLICE_UNDERSTANDING_CACHE_WRITE_FAILED
```

绿灯：

```text
定向测试：3 个测试文件，21 项通过
```

全量验证：

```text
npm test：51 个测试文件，289 项通过
npm run build：通过
```

### 发现并修复的 Bug / 风险

1. 缓存读写失败此前只在 `cacheStats` 内部可见，如果用户只看报告或错误日志，会以为缓存正常工作。
   - 修复：按 read/write 两类分别写 recoverable error。
2. 同一 slice 可能先读缓存失败，随后模型调用成功但写缓存也失败；单个 `cache.status` 无法同时表达两个事实。
   - 修复：增加 `readFailed` 和 `writeFailed` 布尔标记，summary 按标记统计。
3. 缓存失败如果抛出到主链路，会破坏可用的模型分析结果。
   - 修复：`understandVideoSlices` 继续吞掉缓存异常并转成 outcome/stat；`runVideoAnalysisJob` 只写可恢复日志。

### 当前不足

- 日志目前记录失败次数和 affected slices，但没有保留每次 cache adapter 的原始错误 message；后续可让 `understandVideoSlices` 输出 sanitized error reasons。
- `SYSTEM_SLICE_UNDERSTANDING_CACHE_*_FAILED` 尚未进入 API 契约，仅进入错误处理规范和运行日志。
- cache failure 尚未在前端展示；当前需要通过 `storage/logs/errors.jsonl` 或后续日志查询能力查看。
- 读写失败没有区分临时 IO 错误、数据损坏、权限问题或磁盘空间不足。
- 仍未接入真实成本预算，缓存失败对成本的影响只能通过 skipped call 数间接估计。

### 下一节点

继续 P1：推进 model-run usage/cost budget 字段，或补充缓存失败的 sanitized reason，让日志从“计数可见”升级为“原因可定位”。

## 2026-07-11：关键节点 16 - P1 Model Run Usage 估算观测

### 完成内容

- `ModelExecutionSummary` 新增可选 `usage` 字段，用于记录模型运行的 token 与媒体用量估算。
- `runVideoAnalysisJob` 在持久化 `ModelRunRecord` 时同步写入 `execution.usage`，让 slice 理解和视频级推理都能进入审计链路。
- `FakeMultimodalUnderstandingClient` 现在按 slice 帧数生成估算用量：
  - `inputTokens`
  - `outputTokens`
  - `imageCount`
  - `frameCount`
- `FakeContentReasoningClient` 现在为视频级推理生成估算 `inputTokens` 与 `outputTokens`。
- `LocalJsonModelRunRepository` 增加 `usage` 运行时校验，拒绝负数、非整数或非对象格式的损坏记录。
- `listModelRunsForJob` 的 summary 新增 `usage` 聚合：
  - `inputTokens`
  - `outputTokens`
  - `imageCount`
  - `frameCount`
  - `runsWithUsage`
  - `runsMissingUsage`
- `GET /api/video-analysis-jobs/:jobId/model-runs` 已返回 `summary.usage`，用于后续成本预算、缓存节省和 provider 账单对账。
- `docs/API-CONTRACT.md` 已同步 `summary.usage` 契约和非负整数约束。

### TDD 证据

红灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/runVideoAnalysisJob.test.ts

预期失败点：
- listModelRunsForJob summary 尚未聚合 usage
- /model-runs route 响应中没有 summary.usage
- runVideoAnalysisJob 持久化的 slice/reasoning model-run 尚未带 usage
```

绿灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/runVideoAnalysisJob.test.ts tests/LocalJsonModelRunRepository.test.ts

4 个测试文件通过，25 项通过
```

全量验证：

```text
npm test：51 个测试文件，289 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. 此前 model-run 只能看到调用次数和缓存命中，无法估算一次分析用了多少 token、图片帧或视觉输入。
   - 修复：在 execution summary、model-run 记录和查询 summary 三层贯通 usage。
2. 缓存命中能统计 skipped call，但不能估算真实节省的 token/media 成本。
   - 修复：先把 usage 数据面补齐，为后续按 cache hit 推导 saved usage 打基础。
3. 本地 model-run JSON 如果写入负数或小数 usage，查询 API 可能输出不可信成本数据。
   - 修复：`LocalJsonModelRunRepository` 对 usage 字段做非负整数运行时校验。
4. 部分历史或异常 model-run 可能没有 usage，如果直接按 0 处理，会掩盖成本审计缺口。
   - 修复：summary 增加 `runsMissingUsage`，显式暴露不可审计记录数量。

### 当前不足

- 当前 usage 仍是 fake provider 的启发式估算，不是 OpenAI、Claude、Qwen-VL 等真实 provider 返回的账单用量。
- 还没有 `costAmount`、`currency`、`unitPriceVersion` 或预算上限字段，无法直接做金额级成本控制。
- 缓存命中尚未计算 `savedInputTokens`、`savedOutputTokens`、`savedImageCount` 或 `savedFrameCount`。
- `summary.usage` 还没有按 stage、model、provider 细分；排查“哪个模型最贵”仍需要读取逐条 model-run。
- 前端尚未展示 model-run usage；当前只能通过 `/api/video-analysis-jobs/:jobId/model-runs` 查看。
- 真实 provider usage 接入后，需要补充 provider 响应 schema 校验，避免把缺失账单误报为 0。

### 下一节点

继续 P1：跑完全量验证后，推进真实视觉大模型 provider 适配的端口契约，优先把 provider usage、成本预算和缓存节省用量纳入同一套 model-run 观测模型。

## 2026-07-11：关键节点 17 - P1 Model Policy 与 Provider 能力选择

### 完成内容

- 新增 `selectMultimodalModelProvider` 纯 application 策略模块，后续真实视觉模型 adapter 可以按能力和策略路由。
- 新增 `ModelPolicy`：
  - `mode`: `quality` / `balanced` / `local`
  - `allowCloudUpload`
  - `maxFrames`
  - `maxVideoSeconds`
  - `timeoutMs`
  - `maxRetries`
  - `costBudget`
- 新增 `ModelProviderProfile`，以 provider-neutral 方式描述候选能力：
  - 路由类型：`cloud_direct_video` / `cloud_frame_text` / `local_vision_language`
  - 是否需要云上传
  - 可处理帧数和视频秒数上限
  - 质量评分和估算成本
- 策略选择支持：
  - `balanced` 优先选择 frame-plus-text provider，复用当前抽帧证据链并控制输入规模。
  - `local` 在禁止云上传时只选择本地视觉语言模型。
  - `quality` 在满足预算和权限时按质量优先。
  - 预算过滤先于质量排序。
  - 没有可用 provider 时返回逐候选拒绝原因，方便后续写入日志或前端诊断。
- `docs/SEAMS-AND-PORTS.md` 已同步 `ModelPolicy` 与 `ModelProviderProfile` 边界约束。

### TDD 证据

红灯：

```text
npm test -- --run tests/selectMultimodalModelProvider.test.ts

失败原因：
- Failed to load url ../src/application/useCases/selectMultimodalModelProvider
- 策略模块尚未创建，测试文件无法导入目标用例
```

绿灯：

```text
npm test -- --run tests/selectMultimodalModelProvider.test.ts

1 个测试文件通过，4 项通过
```

全量验证：

```text
npm test：52 个测试文件，293 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. 后续如果直接在编排层按 provider 名称分支，会让 OpenAI、Qwen-VL、本地 VLM 等 adapter 与业务策略耦合。
   - 修复：先沉淀 provider-neutral profile，只按能力、预算和上传权限选择。
2. `balanced` 模式如果简单选择最高质量 provider，可能过早走 direct-video 路径，破坏当前可解释抽帧证据链和成本控制。
   - 修复：`balanced` 明确优先 `cloud_frame_text`。
3. 用户或部署环境禁止云上传时，策略层必须在调用 provider 前拦截。
   - 修复：`allowCloudUpload=false` 会拒绝所有 `requiresCloudUpload=true` 的候选。
4. 成本预算如果只作为展示字段，不参与选择，会在真实 provider 接入后出现不可控花费。
   - 修复：`costBudget` 参与候选过滤，且先于质量排序。

### 当前不足

- 策略模块还没有接入 `runVideoAnalysisJob`，当前主链路仍直接注入一个 `MultimodalUnderstandingPort`。
- `estimatedCost` 仍是 profile 估算值，没有和真实 token、图片帧、视频秒数单价对账。
- 没有 provider registry 或配置文件，候选 profile 还需要由后续 infrastructure 层提供。
- 没有把 selection result 持久化到 `ModelRunRecord`；目前 model-run 只能看到最终 provider/model，看不到为什么选择它。
- 失败原因尚未进入 `ErrorLogPort` 或 API 契约。
- `timeoutMs` 和 `maxRetries` 已进入 policy 类型，但还没有被真实 adapter 的 retry/timeout 机制消费。

### 下一节点

继续 P1：把 provider registry 和 selection result 接入运行编排或 model-run 观测；优先让真实 provider adapter 能从同一套 `ModelPolicy` 获取路由、输入上限、预算和重试策略。

## 2026-07-11：关键节点 18 - P1 Provider Selection 进入 Model Run 观测

### 完成内容

- 新增共享策略类型文件 `src/application/modelProviderPolicy.ts`，让 port、use case 和 model-run 元数据复用同一套 `ModelPolicy` / `ModelProviderProfile` 类型。
- `MultimodalUnderstandingPort` 新增可选 `getModelProviderProfile()`，由 adapter 暴露 provider-neutral 能力画像。
- `FakeMultimodalUnderstandingClient` 暴露 `fake_frame_text` provider profile：
  - route: `cloud_frame_text`
  - `requiresCloudUpload=false`
  - `maxFrames=80`
  - `maxVideoSeconds=120`
  - `estimatedCost=0`
- `runVideoAnalysisJob` 在视觉理解阶段开始前使用 `selectMultimodalModelProvider` 计算 slice provider selection。
- `ModelRunRecord` 新增可选 `selection`：
  - `policyMode`
  - `providerProfileId`
  - `route`
  - `effectiveFrameCount`
  - `effectiveVideoSeconds`
  - `estimatedCost`
  - `costBudget`
  - `allowCloudUpload`
  - `reason`
- slice model-run 现在会持久化 selection metadata；缓存命中的 slice model-run 也会保留当次 selection 上下文。
- `LocalJsonModelRunRepository` 增加 selection 运行时校验，拒绝非法 policy mode、route、负数输入规模、非法预算和空 reason。
- `docs/API-CONTRACT.md` 与 `docs/SEAMS-AND-PORTS.md` 已同步 selection 契约。

### TDD 证据

红灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts tests/LocalJsonModelRunRepository.test.ts

失败原因：
- slice model-run 缺少 selection 字段
- 缓存命中的 slice model-run 缺少 providerProfileId
- LocalJsonModelRunRepository 没有拒绝 effectiveFrameCount=-1 的坏 selection
```

绿灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts tests/LocalJsonModelRunRepository.test.ts tests/selectMultimodalModelProvider.test.ts

3 个测试文件通过，23 项通过
```

全量验证：

```text
npm test：52 个测试文件，293 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. model-run 只能看到最终 provider/model，看不到为什么选择该能力，后续评测回放无法区分“预算选择”“本地策略选择”或“质量优先选择”。
   - 修复：将 selection metadata 写入 slice model-run。
2. 缓存命中的 slice 没有真实 provider 调用，如果不写 selection，会丢失当次策略上下文。
   - 修复：缓存命中 model-run 同样写入 selection。
3. provider profile 如果只存在于 adapter 内部，后续真实 provider 接入容易重新硬编码供应商分支。
   - 修复：在 `MultimodalUnderstandingPort` 上暴露 provider-neutral profile。
4. 本地 JSON model-run 如果允许非法 selection，会让查询 API 输出错误的策略和预算诊断。
   - 修复：仓储增加 selection runtime validation。

### 当前不足

- selection 当前只接入 slice 视觉理解阶段；video reasoning 阶段还没有独立 provider profile 和 selection metadata。
- selection 不会阻断当前 injected adapter；如果策略返回 unavailable，目前只是省略 selection，尚未写 `ErrorLogPort` 或切换 fallback adapter。
- `effectiveFrameCount` 和 `effectiveVideoSeconds` 已进入观测，但还没有反向驱动抽帧/切片上限；当前默认策略上限覆盖本地 MVP 输入。
- provider registry 仍未实现；候选列表目前来自单个 injected adapter。
- `estimatedCost` 仍是 profile 估算值，没有和 `summary.usage` 或真实账单单价计算出的金额对账。
- 前端和 `/model-runs` summary 尚未聚合 selection 分布，当前只能在单条 model-run 中查看。

### 下一节点

继续 P1：补 provider registry 与 unavailable selection 的可恢复日志，或为 video reasoning 阶段增加同样的 provider profile/selection 观测，逐步把真实 provider 路由纳入完整审计链路。

## 2026-07-11：关键节点 19 - P1 Reasoning Provider Selection 观测

### 完成内容

- `ContentReasoningPort` 新增可选 `getModelProviderProfile()`，与 slice 视觉理解阶段使用同一套 provider-neutral profile。
- `FakeContentReasoningClient` 暴露 `fake_temporal_reasoning` provider profile：
  - route: `cloud_frame_text`
  - `requiresCloudUpload=false`
  - `maxFrames=80`
  - `maxVideoSeconds=120`
  - `estimatedCost=0`
- `runVideoAnalysisJob` 在 `reasoning` 阶段执行前计算 reasoning provider selection。
- `run_reasoning_video` model-run 现在会持久化 selection metadata：
  - `policyMode=balanced`
  - `providerProfileId=fake_temporal_reasoning`
  - `route=cloud_frame_text`
  - `effectiveFrameCount`
  - `effectiveVideoSeconds`
  - `estimatedCost`
  - `allowCloudUpload`
  - `reason`
- `docs/API-CONTRACT.md` 和 `docs/SEAMS-AND-PORTS.md` 已同步：`visually_understanding` 与 `reasoning` 阶段都应尽量写入 selection。

### TDD 证据

红灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts

失败原因：
- run_reasoning_video 的 selection 为 undefined
- reasoning model-run 只能看到 provider/model/prompt/schema，看不到 policyMode、providerProfileId 和 route
```

绿灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts tests/selectMultimodalModelProvider.test.ts tests/LocalJsonModelRunRepository.test.ts

3 个测试文件通过，23 项通过
```

全量验证：

```text
npm test：52 个测试文件，293 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. 视觉理解阶段有 selection，但 reasoning 阶段没有，导致一次完整多模态分析的两类模型运行无法用同一套策略审计。
   - 修复：`ContentReasoningPort` 暴露 provider profile，reasoning model-run 写 selection。
2. 如果 reasoning 未来切换到更贵或更强的模型，旧观测只能看到最终 model name，不能解释是否因为质量模式、预算或本地策略导致。
   - 修复：reasoning selection 写入 `policyMode`、`estimatedCost`、`allowCloudUpload` 和选择原因。
3. 文档此前只明确了 slice model-run 的 selection，不够覆盖 `/v1/reason/video` 这类模型能力。
   - 修复：API 和 Port 契约都补充 reasoning 阶段 selection 规则。

### 当前不足

- reasoning selection 仍来自单个 injected `ContentReasoningPort`，没有 provider registry 或多候选路由。
- selection unavailable 时仍不会写结构化错误日志，也不会阻断当前 fake adapter。
- `route=cloud_frame_text` 目前复用多模态输入路线表达“基于帧和文本证据的推理”，后续如拆分纯文本 temporal reasoner，可能需要扩展 route 枚举。
- `effectiveFrameCount` / `effectiveVideoSeconds` 仍只进入观测，没有反向驱动 prompt 截断、slice 汇总压缩或成本控制。
- reasoning 的真实 provider usage、retryCount、timeout 和 schema repair 仍未接入。
- `/model-runs` summary 还没有按 selection/providerProfileId 聚合分布。

### 下一节点

继续 P1：补 provider registry 与 selection unavailable 的结构化日志，或让 `summary` 聚合 selection/provider 分布，帮助前端和调试接口快速看出模型能力选择与成本走向。

## 2026-07-11：关键节点 20 - P1 Model Run Selection Summary

### 完成内容

- `listModelRunsForJob` 的 summary 新增 `selection` 聚合：
  - `runsWithSelection`
  - `runsMissingSelection`
  - `estimatedCost`
  - `policyModes`
  - `routes`
  - `providerProfiles`
  - `cloudUploadRequired`
  - `cloudUploadAllowed`
- `GET /api/video-analysis-jobs/:jobId/model-runs` 现在无需遍历逐条 model-run，也能快速看出：
  - 本次任务走了哪些 policy mode。
  - 使用了哪些 provider profile。
  - 视觉理解和 reasoning 是否都写入 selection。
  - 是否存在 selection 缺失的旧记录或 adapter 缺口。
  - 估算成本的 provider-profile 汇总。
- `ModelRunSelectionMetadata` 新增可选 `requiresCloudUpload`，新运行由 provider profile 写入，旧记录缺失时按 false 聚合。
- `LocalJsonModelRunRepository` 增加 `selection.requiresCloudUpload` 运行时校验。
- `docs/API-CONTRACT.md` 与 `docs/SEAMS-AND-PORTS.md` 已同步 `summary.selection` 契约。

### TDD 证据

红灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts

失败原因：
- listModelRunsForJob summary 没有 selection 聚合
- /model-runs API 响应缺少 summary.selection
- 空 model-run 列表缺少 selection 的零值 summary
```

绿灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/LocalJsonModelRunRepository.test.ts tests/runVideoAnalysisJob.test.ts

4 个测试文件通过，25 项通过
```

全量验证：

```text
npm test：52 个测试文件，293 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. selection 已经进入逐条 model-run，但调试接口无法快速回答“这次任务到底用了哪些模型策略”。
   - 修复：新增 `summary.selection` 聚合 policy mode、route 和 provider profile。
2. provider 是否真的需要云上传不能从 `route=cloud_frame_text` 推断，fake frame-text adapter 也是本地演示能力。
   - 修复：新增可选 `requiresCloudUpload` 字段，summary 按字段事实统计，旧记录缺失时按 false 处理。
3. 空任务或旧任务没有 model-run 时，如果不返回 selection 零值 summary，前端/调试工具需要写额外兼容分支。
   - 修复：空列表返回 `runsWithSelection=0`、`runsMissingSelection=0`、`estimatedCost=0` 等稳定零值。
4. selection 缺失如果不计数，真实 adapter 没暴露 profile 时会静默丢失审计上下文。
   - 修复：新增 `runsMissingSelection`。

### 当前不足

- `summary.selection.estimatedCost` 仍是 provider profile 的估算成本，不是结合 usage 和单价版本的真实金额。
- `providerProfiles` 是动态对象，后续如果前端展示，需要排序、中文名和 tooltip。
- `summary.selection` 还没有按 stage 拆分；目前无法一眼区分 slice 阶段和 reasoning 阶段各自的 provider 分布。
- `requiresCloudUpload` 对旧记录按 false 处理，可能低估历史云上传需求。
- selection unavailable 仍未写入 `ErrorLogPort`；当前只能通过 `runsMissingSelection` 发现缺口。
- provider registry 和多候选路由仍未实现。

### 下一节点

继续 P1：补 selection unavailable 的结构化日志，或把 `summary.selection` 按 stage 细分，让调试接口能直接分辨视觉理解和 reasoning 两类模型的策略分布。

## 2026-07-11：关键节点 21 - P1 Model Run Selection Stage Summary

### 完成内容

- `listModelRunsForJob` 的 `summary.selection` 新增 `byStage`：
  - `visually_understanding`
  - `reasoning`
  - `evaluation`
- 每个阶段都返回与全局 selection 相同的审计字段：
  - `runsWithSelection`
  - `runsMissingSelection`
  - `estimatedCost`
  - `policyModes`
  - `routes`
  - `providerProfiles`
  - `cloudUploadRequired`
  - `cloudUploadAllowed`
- 空阶段稳定返回零值 summary，避免前端或调试工具为缺失阶段写额外兼容分支。
- `docs/API-CONTRACT.md` 与 `docs/SEAMS-AND-PORTS.md` 已同步 `summary.selection.byStage` 契约。

### TDD 证据

红灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts

失败原因：
- listModelRunsForJob summary.selection 缺少 byStage
- /model-runs API 响应无法区分 visually_understanding、reasoning、evaluation 三个阶段的 selection 分布
- 空 model-run 列表缺少 byStage 的稳定零值 summary
```

绿灯：

```text
npm test -- --run tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts tests/LocalJsonModelRunRepository.test.ts tests/runVideoAnalysisJob.test.ts

4 个测试文件通过，25 项通过
```

全量验证：

```text
npm test：52 个测试文件，293 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. 全局 `summary.selection` 会掩盖 selection 覆盖来自 slice 视觉理解还是 video reasoning。
   - 修复：新增 `summary.selection.byStage`，按模型运行阶段独立聚合。
2. 没有 evaluation model-run 时，如果省略该阶段，调试工具无法区分“无记录”和“接口缺字段”。
   - 修复：所有合法 `ModelRunStage` 都返回零值 summary。
3. 旧记录或 adapter 未暴露 selection 时，只看全局缺失数仍难定位是哪一类模型阶段缺失。
   - 修复：阶段级 `runsMissingSelection` 独立计数。

### 当前不足

- selection unavailable 仍未写入 `ErrorLogPort`；当前只能通过 `runsMissingSelection` 发现缺口。
- provider registry 和多候选路由仍未实现。
- `estimatedCost` 仍是 provider profile 估算值，不是真实账单金额。
- `summary.selection.byStage` 尚未在前端展示。
- `summary.usage` 仍未按 stage 细分；成本排查还不能直接看到各阶段 token/media 用量。

### 下一节点

继续 P1：补 selection unavailable 的结构化日志，或把 usage/cache/cost 进一步按 stage 聚合，让调试接口能同时回答“用了哪个模型策略”和“哪一阶段消耗最多”。

## 2026-07-11：关键节点 22 - P1 Provider Selection Unavailable 结构化日志

### 完成内容

- `runVideoAnalysisJob` 在 slice 视觉理解和 video reasoning 两个阶段新增 provider selection 诊断。
- 当 adapter 没有暴露 `getModelProviderProfile()` 时，任务继续执行当前 adapter，但写入：
  - `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE`
  - stage: `visually_understanding` 或 `reasoning`
  - detail.reason: `provider_profile_unavailable`
- 当 `ModelPolicy` 拒绝当前 provider profile 时，任务继续执行当前 adapter，但写入：
  - `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE`
  - detail.reason: `No multimodal provider satisfies the current model policy.`
  - detail.rejectedCandidates
- 日志 detail 同步记录 `policy` 与 `requestedInput`，用于复盘是预算、上传权限、本地模式还是输入规模导致 selection 缺失。
- `ModelRunRecord.selection` 仍然只在真实选中 provider profile 时写入；日志只补审计缺口，不伪造选择结果。
- `docs/API-CONTRACT.md`、`docs/SEAMS-AND-PORTS.md` 与 `docs/ERROR-HANDLING.md` 已同步该错误码与降级规则。

### TDD 证据

红灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts

失败原因：
- adapter 未暴露 provider profile 时没有写入 SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE
- provider profile 被 ModelPolicy 拒绝时没有写入 rejectedCandidates
- model-run selection 缺失只能通过后置 summary 发现，执行期没有结构化错误日志
```

绿灯：

```text
npm test -- --run tests/runVideoAnalysisJob.test.ts tests/listModelRunsForJob.test.ts tests/videoAnalysisModelRunsRoute.test.ts

3 个测试文件通过，23 项通过
```

全量验证：

```text
npm test：52 个测试文件，294 项通过
npm run build：通过
git diff --check：无 whitespace error，仅既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. `selection === undefined` 同时表达“adapter 没有 profile”和“策略拒绝候选”，执行期不可定位。
   - 修复：selection 函数返回 `selection` 或 `diagnostic`，日志 detail 明确原因。
2. 真实 provider 接入后，如果云上传权限或预算策略拒绝 provider，旧实现会继续生成报告但没有错误日志。
   - 修复：策略拒绝时写 `rejectedCandidates`，保留被拒绝 provider id 与原因。
3. 为了补齐审计而伪造 selection 会污染 model-run 数据。
   - 修复：只记录 recoverable error，model-run 仍保持 selection 缺失，交给 summary 统计。

### 当前不足

- provider registry 和多候选路由仍未实现；当前仍是单 injected adapter/profile。
- selection unavailable 日志尚未在前端或日志查询 API 展示。
- `summary.usage` 仍未按 stage 细分，成本排查还不能直接看到各阶段 token/media 用量。
- `estimatedCost` 仍是 provider profile 估算值，不是真实账单金额。
- `timeoutMs`、`maxRetries` 已进入 policy，但真实 adapter retry/timeout 尚未接入。

### 下一节点

继续 P1：实现 provider registry / 多候选路由，或把 `summary.usage`、cache saved usage 和成本估算按 stage 聚合，补齐“策略选择”和“资源消耗”的同一套审计视图。

## 2026-07-11：关键节点 23 - OpenAI-compatible 抽帧大模型与 Creator Insights

### 完成内容

- 新增 OpenAI-compatible 多模态 adapter：
  - `OpenAiCompatibleMultimodalUnderstandingClient`：实现 `MultimodalUnderstandingPort`，把抽帧图片 base64、时间戳、文稿片段和 OCR 文本发送给视觉模型，输出 `SliceVisualObservation`。
  - `OpenAiCompatibleContentReasoningClient`：实现 `ContentReasoningPort`，基于 slice 观察、文稿和覆盖率输出 `MultimodalUnderstanding`。
- 新增环境变量开关：
  - `BOWEN_VLM_PROVIDER=openai_compatible`
  - `BOWEN_VLM_BASE_URL`
  - `BOWEN_VLM_API_KEY`
  - `BOWEN_VLM_MODEL`
- `app/api/upload-video/route.ts` 与 `app/api/video-analysis-jobs/route.ts` 已按环境变量装配真实 adapter；未配置时继续使用 fake adapter，保证本地演示可跑。
- adapter 固定暴露 provider profile：`openai_compatible_frame_text` / `cloud_frame_text` / `requiresCloudUpload=true`，model-run selection 可审计。
- `runVideoAnalysisJob` 在调用模型前会派生受 `ModelPolicy.maxFrames` 与 `ModelPolicy.maxVideoSeconds` 限制的模型证据包，默认最多 80 帧、120 秒；原始视频不会上传。
- 报告新增 `creatorInsights`，前端稳定消费三栏：
  - `视频文稿理解`
  - `视频画面/分镜理解`
  - `爆点拆解与改造建议`
- 前端顶部展示 provider/model、覆盖率、partial 状态；fake 或 fallback 时明确提示不是“真实视觉大模型分析”。

### TDD 证据

红灯覆盖：

```text
tests/OpenAiCompatibleMultimodalClients.test.ts
tests/runVideoAnalysisJob.test.ts
tests/UploadPipelineSummary.test.tsx
```

绿灯验证：

```text
npm test -- --run tests/OpenAiCompatibleMultimodalClients.test.ts tests/runVideoAnalysisJob.test.ts tests/UploadPipelineSummary.test.tsx

3 个测试文件通过，22 项通过
```

全量验证：

```text
npm test
53 个测试文件通过，299 项通过

npm run build
通过

git diff --check
无 whitespace error，仅有既有 LF/CRLF warning
```

### 发现并修复的 Bug / 风险

1. `creatorInsights` 引用了 `suggestions`、`hitPatterns`、`missingPatterns` 和 `generatedOutline`，但这些变量没有在 `buildVideoAnalysisReport` 内生成。
   - 修复：在报告构建函数内部统一生成这些派生字段，并复用到 `evaluation` 与 `creatorInsights`。
2. 派生字段曾被误放到外层 `analyzeUploadedVideo` 函数，那里没有 `isAiDrama`、`hasSubtitleEvidence` 等上下文。
   - 修复：删除外层误放逻辑，避免运行期 `ReferenceError`。
3. 真实 VLM adapter 已实现但 API composition root 仍固定 fake adapter。
   - 修复：两个视频分析入口都接入 `createOpenAiCompatibleMultimodalClients()`，无 key 时保持 fake fallback。
4. `ModelPolicy.maxFrames/maxVideoSeconds` 曾只进入 selection metadata，没有真正限制模型输入。
   - 修复：新增模型证据包裁剪，视觉理解和整片 reasoning 都只接收策略窗口内的帧、文稿和 OCR。

### 当前不足

- adapter 现在执行 JSON repair retry，但还没有显式接入 `ModelPolicy.timeoutMs/maxRetries` 的超时控制。
- provider registry 和多候选路由仍未实现；当前还是按环境变量选择单一真实 adapter。
- `creatorInsights.timestampEvidence` 依赖已有 claim evidence refs，模型没有返回高质量 claim 时会降级为较粗粒度证据。
- 真实 provider 的 cost 仍只通过 usage/token 字段和 profile 估算记录，尚未结合厂商单价版本计算真实账单。

### 下一节点

继续 P1：补 adapter timeout/policy 控制、真实 provider smoke test 文档，以及把 `creatorInsights` 的时间戳证据在前端做更清晰的片段展示。
