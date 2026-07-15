# 博闻 DDD 领域模型

## 1. 领域目标

博闻的核心不是单纯抓取视频榜单，而是帮助内容创作者从“已有视频或快速增长范例”中提炼可执行的创作方案。

当前 MVP 的主领域目标：

```text
用户上传视频
  -> 系统理解内容
  -> 评估生成质量
  -> 检索爆款知识
  -> 输出爆点建议和可复刻脚本大纲
```

因此领域模型要围绕“视频资产、分析任务、转写识别、知识检索、内容评估、策略生成”组织。

## 2. 限界上下文

当前系统划分为 6 个主要限界上下文。

```text
Upload / Asset
Analysis Job
Transcription
Video Understanding
Knowledge / RAG
Content Evaluation
```

原有的 Hot Trend Discovery 仍然保留，但在新 MVP 中作为辅助能力，不再是唯一主线。

## 3. Upload / Asset：视频资产管理

职责：管理用户上传的视频文件，以及从视频派生出来的音频、抽帧和报告文件。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `VideoAsset` | 实体 | 用户上传的视频资产 |
| `AudioAsset` | 实体 | 从视频中提取出来的音频资产 |
| `FrameAsset` | 实体 | 从视频中抽取的画面帧 |
| `UploadedFile` | 值对象 | 原始上传文件信息 |
| `MediaFormat` | 值对象 | 文件格式、MIME、大小等信息 |

核心规则：

- 只接受支持的视频格式。
- 文件大小不能超过系统限制。
- 每个上传视频必须生成唯一资产 ID。
- 资产上传和分析任务创建是两个独立用例；同一资产可以显式发起新的分析任务。
- 本地存储使用 sidecar 元数据保留用户原始文件名，存储路径规范化不改变领域展示信息。
- 视频、音频、抽帧和报告必须能追溯到同一个分析任务。
- 存储位置属于基础设施细节，不进入领域对象。

建议目录：

```text
src/domain/assets
src/application/useCases/uploadVideoAsset.ts
src/application/ports/VideoStoragePort.ts
src/infrastructure/storage/LocalVideoStorage.ts
```

## 4. Analysis Job：分析任务编排

职责：管理视频从上传到报告完成的生命周期。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `VideoAnalysisJob` | 聚合根 | 一次完整的视频分析任务 |
| `AnalysisJobStatus` | 值对象/枚举 | 任务状态 |
| `AnalysisStep` | 值对象 | 当前执行阶段 |
| `AnalysisFailure` | 值对象 | 失败阶段、失败原因、可恢复建议 |

状态流转：

```text
uploaded
  -> extracting_audio
  -> transcribing
  -> sampling_frames
  -> retrieving_knowledge
  -> evaluating
  -> completed
```

失败状态：

```text
failed
```

核心规则：

- 任务状态只能按合法顺序推进。
- 任务从持久化快照恢复时必须校验完整历史：从 `uploaded` 开始、按合法顺序推进、所有时间戳必须是有效 ISO 字符串且历史时间不能倒退，`createdAt` 等于首个历史时间、`updatedAt` 等于最新历史时间、当前状态等于最新历史状态，`failed` 必须包含失败详情且失败阶段/时间与历史一致。
- 任务失败必须记录失败阶段和原因。
- 已完成任务不能重复执行，除非用户主动重新分析。
- `runVideoAnalysisJob` 收到 `completed` 或 `failed` 初始任务时必须早期拒绝，不得再次触发视频存储、转写、抽帧或报告生成副作用。
- 任务编排属于应用层，用例负责调用各个端口。
- 查询接口使用应用层进度投影提供 `progressPercent`、`currentStage` 和 `isTerminal`，不污染聚合快照。
- `VideoAnalysisJob` 是 P0 最重要的聚合根。

建议目录：

```text
src/domain/jobs
src/application/useCases/createVideoAnalysisJob.ts
src/application/useCases/runVideoAnalysisJob.ts
src/application/useCases/projectVideoAnalysisJobProgress.ts
src/application/ports/JobRepositoryPort.ts
```

## 5. Transcription：中文视频转写

职责：把视频音频转换成可分析的中文文稿。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Transcript` | 实体/值对象 | 完整文稿结果 |
| `TranscriptSegment` | 值对象 | 带时间戳的文稿片段 |
| `TranscriptionResult` | DTO | 转写服务返回结果 |
| `TranscriptionConfidence` | 值对象/枚举 | `high`、`medium`、`low` |

核心规则：

- 转写结果必须关联视频资产或分析任务。
- 文稿可以没有精确时间戳，但必须有完整文本。
- 低置信度转写要在最终报告中提示。
- FunASR 失败时允许人工文稿降级。
- 音频提取、模型调用属于基础设施能力，通过端口接入。

建议目录：

```text
src/domain/transcription
src/application/useCases/transcribeUploadedVideo.ts
src/application/ports/AudioExtractorPort.ts
src/application/ports/TranscriptionPort.ts
src/infrastructure/media/FfmpegAudioExtractor.ts
src/infrastructure/transcription/FunAsrTranscriptionClient.ts
```

## 6. Video Understanding：视频识别与结构化

职责：识别视频画面、字幕、场景、节奏和 AI 漫剧特征。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `VideoObservation` | 实体/值对象 | 对视频内容的结构化观察 |
| `FrameSample` | 值对象 | 单帧画面及其时间点 |
| `SceneSegment` | 值对象 | 场景片段 |
| `VisualStyle` | 值对象 | 画面风格标签 |
| `SubtitleSignal` | 值对象 | 字幕、屏幕大字、标题信号 |
| `AiDramaSignal` | 值对象 | AI 漫剧相关信号 |

核心规则：

- 抽帧结果必须能追溯到视频时间点。
- 场景分析可以低精度，但必须结构化。
- AI 漫剧识别不能只依赖标题，要结合画面、文稿、人物关系和剧情结构。
- P0 先实现抽帧和规则判断，OCR/视觉模型作为 P1 增强。

建议目录：

```text
src/domain/videoUnderstanding
src/application/useCases/understandVideo.ts
src/application/ports/FrameSamplerPort.ts
src/application/ports/OcrPort.ts
src/application/ports/VisualAnalysisPort.ts
src/infrastructure/media/FfmpegFrameSampler.ts
```

## 7. Knowledge / RAG：知识库与检索

职责：管理爆款策略、AI 漫剧套路、分镜经验和平台传播经验，并为内容评估提供依据。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `KnowledgeItem` | 实体 | 一条可检索的知识 |
| `KnowledgeQuery` | 值对象 | 检索条件 |
| `RetrievedKnowledge` | 值对象 | 检索结果及匹配原因 |
| `ContentPattern` | 值对象 | 爆款结构、脚本结构、传播模式 |
| `AiDramaTemplate` | 值对象 | AI 漫剧套路模板 |

知识类型：

```text
hook_strategy
script_structure
scene_design
ai_drama_pattern
aesthetic_rule
platform_growth_rule
```

核心规则：

- 每条知识必须有适用场景。
- 检索结果必须说明匹配原因。
- MVP 阶段可以使用关键词检索，后续替换为向量检索。
- RAG 输出必须进入最终报告的依据字段。
- 知识库可以先使用本地 JSON/Markdown，不强制依赖外部数据库。

建议目录：

```text
src/domain/knowledge
src/application/useCases/retrieveEvaluationKnowledge.ts
src/application/ports/KnowledgeRepositoryPort.ts
src/application/ports/EmbeddingPort.ts
src/infrastructure/knowledge/LocalKnowledgeRepository.ts
```

## 8. Content Evaluation：内容质量评估与建议生成

职责：综合文稿、视频识别结果和 RAG 知识，生成诊断报告与爆点改造方案。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `ContentEvaluation` | 实体/值对象 | 内容质量评估结果 |
| `EvaluationDimension` | 值对象 | 单项评分维度 |
| `AiDramaEvaluation` | 值对象 | AI 漫剧专项评估 |
| `ExplosionSuggestion` | 值对象 | 爆点改造建议 |
| `GeneratedViralOutline` | 值对象 | 相似爆款脚本大纲 |
| `VideoAnalysisReport` | DTO | 面向前端展示的完整报告 |

评分维度：

```text
scriptQuality        脚本优秀度
hookStrength         前三秒钩子
sceneDesign          分镜表现
aestheticExperience  审美体验
emotionalRhythm      情绪节奏
differentiation      差异化
viralPotential       传播潜力
aiDramaFit           AI 漫剧适配度
```

核心规则：

- 每个评分必须有理由。
- 核心评分维度必须输出可复用关键词，至少覆盖脚本优秀度、前三秒钩子、分镜表现、审美体验和差异化。
- 每个问题必须给出对应修改建议。
- 建议必须具体到脚本、分镜、字幕、开头、结尾中的至少一种。
- AI 漫剧视频必须额外输出剧情钩子、爽点、反转和续集悬念分析。
- 一键生成的相似爆款大纲必须保留结构优势，但主题和表达要差异化。

建议目录：

```text
src/domain/evaluation
src/application/useCases/evaluateUploadedVideo.ts
src/application/useCases/generateViralOutline.ts
src/application/ports/LlmEvaluationPort.ts
src/infrastructure/llm/OpenAiCompatibleEvaluationClient.ts
```

## 9. Hot Trend Discovery：热点发现

职责：按品类和平台发现近五日快速增长的视频范例，为用户提供外部参考。

该领域是原有 MVP 主线，在新路线中保留为辅助能力。

核心对象：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Category` | 值对象/枚举 | 用户选择的内容赛道 |
| `Platform` | 值对象/枚举 | `bilibili`、`douyin`、`weibo` 等平台 |
| `VideoTrend` | 实体 | 趋势视频及增长指标 |
| `GrowthBenchmark` | 值对象 | 同品类平均增长速度、阈值、样本数量 |
| `TrendFetchResult` | DTO | 数据来源、更新时间和视频列表 |

核心规则：

- 只看近五日数据。
- 10 万播放是 MVP 入榜硬阈值。
- 增长速度要显著高于同品类基准，默认至少 1.5 倍。
- Top10 结果必须稳定排序。
- live 抓取失败时可以 fallback，但必须标记真实来源。
- 每个趋势视频必须包含可点击的视频链接。

建议目录：

```text
src/domain/trends
src/application/useCases/getHotVideos.ts
src/application/ports/TrendSourcePort.ts
src/infrastructure/trends
```

## 10. 主聚合关系

P0 主聚合是 `VideoAnalysisJob`。

```text
VideoAnalysisJob
  - VideoAsset
  - AudioAsset
  - Transcript
  - VideoObservation
  - RetrievedKnowledge[]
  - ContentEvaluation
  - GeneratedViralOutline
```

用户最终看到的是一个分析任务生成的一份报告，而不是零散的上传、转写、识别和评估结果。

## 11. 应用层用例

P0 优先新增或改造这些 use cases：

```text
uploadVideoAsset
createVideoAnalysisJob
runVideoAnalysisJob
extractAudioFromVideo
transcribeUploadedVideo
sampleVideoFrames
understandUploadedVideo
retrieveEvaluationKnowledge
evaluateUploadedVideo
generateViralOutline
```

主编排流程：

```text
runVideoAnalysisJob(jobId)
  -> load video asset
  -> extract audio
  -> transcribe audio
  -> sample frames
  -> understand video
  -> retrieve RAG knowledge
  -> evaluate content
  -> generate viral outline
  -> save report
```

## 12. 端口清单

P0 建议补齐这些端口：

```text
VideoStoragePort
JobRepositoryPort
AudioExtractorPort
FrameSamplerPort
TranscriptionPort
KnowledgeRepositoryPort
KnowledgeRetrievalPort
LlmEvaluationPort
ReportRepositoryPort
```

端口规则：

- 应用层依赖端口，不依赖具体 SDK。
- 基础设施实现端口。
- API route 只做协议解析、用例调用和响应封装。
- domain 不访问文件、网络、数据库或环境变量。

## 13. 主报告 DTO

```ts
type VideoAnalysisReport = {
  jobId: string;
  status: "completed" | "failed";
  video: {
    id: string;
    filename: string;
    durationSeconds?: number;
  };
  transcript: {
    text: string;
    confidence: "high" | "medium" | "low";
    segments?: TranscriptSegment[];
  };
  understanding: {
    contentType: "ai_drama" | "talking_head" | "mixed" | "unknown";
    scenes: SceneSegment[];
    visualTags: string[];
    aiDramaSignals?: AiDramaSignal[];
  };
  evaluation: {
    summary: string;
    scores: {
      scriptQuality: number;
      hookStrength: number;
      sceneDesign: number;
      aestheticExperience: number;
      emotionalRhythm: number;
      differentiation: number;
      viralPotential: number;
      aiDramaFit?: number;
    };
    scoreReasons: Record<string, string>;
    keywordRecommendations: {
      dimension: string;
      label: string;
      keywords: string[];
      reason: string;
    }[];
    hitPatterns: string[];
    missingPatterns: string[];
    suggestions: ExplosionSuggestion[];
  };
  generatedOutline: {
    titleOptions: string[];
    hook: string;
    scriptOutline: string[];
    sceneOutline: string[];
    endingHook: string;
    aiDramaOutline?: {
      relationship: string;
      conflict: string;
      reversal: string;
      cliffhanger: string;
    };
  };
};
```

## 14. 统一领域语言

| 中文 | 代码建议 | 含义 |
| --- | --- | --- |
| 视频资产 | `VideoAsset` | 用户上传的视频文件 |
| 分析任务 | `VideoAnalysisJob` | 一次完整的视频分析流程 |
| 文稿 | `Transcript` | 从视频语音转写出的文本 |
| 抽帧 | `FrameSample` | 从视频中提取的画面帧 |
| 视频观察 | `VideoObservation` | 对视频画面、场景、字幕、节奏的结构化理解 |
| 知识条目 | `KnowledgeItem` | 可复用的爆款策略或创作经验 |
| 检索知识 | `RetrievedKnowledge` | RAG 召回结果及匹配原因 |
| 内容评估 | `ContentEvaluation` | 对内容生成质量的判断 |
| 爆点建议 | `ExplosionSuggestion` | 可执行的内容改造建议 |
| 相似爆款大纲 | `GeneratedViralOutline` | 复刻结构但差异化表达的新脚本方案 |
| 趋势视频 | `VideoTrend` | 近五日快速增长的视频范例 |

一句话：博闻的领域模型围绕“用户视频 -> 可解释分析 -> RAG 依据 -> 可执行爆点方案”组织，热点发现作为辅助输入继续保留。
