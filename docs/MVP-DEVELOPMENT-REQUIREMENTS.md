# 博闻 MVP 开发需求

## 1. MVP 目标

当前阶段的 MVP 目标是跑通一条本地可演示的内容分析闭环：

```text
用户上传视频
  -> 系统提取音频
  -> 中文视频转写
  -> 视频抽帧与基础识别
  -> RAG 检索爆款策略与 AI 漫剧知识
  -> 大模型评估内容质量
  -> 输出爆点建议、分镜建议、脚本优化建议
  -> 一键生成相似爆款大纲
```

一句话目标：用户上传一个 AI 漫剧或短视频后，系统在 3-5 分钟内生成一份“内容诊断报告 + 爆点改造建议 + 可复刻脚本大纲”。

## 2. 本阶段优先验证的问题

本阶段不追求完整平台化，优先验证以下问题：

- 用户能否自主上传一个中文视频。
- 系统能否转写出基本可读的中文文稿。
- 系统能否识别视频的大致内容结构和画面节奏。
- 系统能否判断内容为什么可能火，或者为什么不够火。
- 系统能否给出具体、可执行的爆点建议。
- 对 AI 漫剧，系统能否识别钩子、爽点、反转、分镜和续集悬念。
- 用户能否一键生成一个相同爆款结构的新脚本大纲。

## 3. P0 功能范围

### 3.1 视频上传

用户故事：作为内容创作者，我希望上传自己的视频，让系统自动分析这个视频的内容质量和爆点潜力。

功能要求：

- 支持 `mp4`、`mov`、`webm`、`mkv`、`avi`、`m4v` 等主流视频格式。
- MVP 阶段文件大小上限建议为 500MB。
- 上传后生成一个分析任务 ID。
- 前端展示任务状态和处理进度。
- 文件格式不支持、文件过大、上传失败时返回明确错误。

任务状态：

```text
uploaded
extracting_audio
transcribing
sampling_frames
retrieving_knowledge
evaluating
completed
failed
```

### 3.2 中文视频转写

用户故事：作为内容创作者，我希望系统自动识别视频里的中文语音，生成后续分析所需的文稿。

功能要求：

- 使用 `ffmpeg` 从视频中提取音频。
- 调用 FunASR 独立微服务完成中文转写。
- 返回完整文稿。
- 尽量返回分段时间戳；如果 P0 无法稳定生成，可以先只返回全文。
- 标记转写置信度：`high`、`medium`、`low`。
- FunASR 不可用时，允许用户手动粘贴文稿作为降级方案。

输出示例：

```ts
type Transcript = {
  text: string;
  confidence: "high" | "medium" | "low";
  segments?: TranscriptSegment[];
};
```

### 3.3 视频基础识别

用户故事：作为内容创作者，我希望系统不仅分析文稿，也能理解视频画面和节奏。

功能要求：

- 按固定间隔抽帧，例如每 3-5 秒一帧。
- 记录每张抽帧对应的视频时间点。
- 生成基础结构化结果：
  - 视频时长。
  - 抽帧数量。
  - 场景片段。
  - 画面风格标签。
  - 字幕或屏幕大字信号。
  - 是否疑似 AI 漫剧。
- P0 可以先实现抽帧与规则判断，OCR 和视觉模型作为 P1 增强。

### 3.4 RAG 知识检索

用户故事：作为内容创作者，我希望系统的建议不是泛泛而谈，而是参考爆款方法论和 AI 漫剧经验。

功能要求：

- 建立本地知识库，P0 可使用 Markdown 或 JSON 文件。
- 支持按内容类型、品类、关键词、AI 漫剧信号检索知识。
- 检索结果必须说明匹配原因。
- RAG 结果必须进入最终报告，作为评估依据。

知识库最小分类：

- 爆款短视频结构。
- AI 漫剧套路。
- 分镜节奏建议。
- 审美体验标准。
- 平台传播策略。

### 3.5 内容质量评估

用户故事：作为内容创作者，我希望看到一个结构化诊断报告，知道这个视频哪里好、哪里弱、怎么改。

报告必须包含：

- 内容概述。
- 视频文稿解析。
- 爆点命中分析。
- 脚本优秀度。
- 分镜表现。
- 审美体验描述。
- 传播潜力预测。
- AI 漫剧专项建议。
- 具体修改建议。
- 一键生成相似爆款大纲。

评分维度建议：

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

### 3.6 一键生成相似爆款

用户故事：作为内容创作者，我希望基于当前视频的有效结构，快速生成一个新的爆款脚本方向。

功能要求：

- 根据原视频结构生成不同主题的新脚本大纲。
- 输出标题备选、前三秒钩子、剧情推进、分镜大纲、结尾悬念。
- 对 AI 漫剧要输出人物关系、冲突、反转和续集钩子。
- 生成结果必须与原视频有差异化，不允许简单复述或照搬。

## 4. AI 漫剧专项适配

AI 漫剧需要独立于普通短视频做专项判断。

必须识别和评估：

- 前三秒是否有强钩子。
- 人物关系是否快速建立。
- 冲突是否明确。
- 爽点密度是否足够。
- 反转是否有效。
- 台词是否推动剧情。
- 分镜是否单调。
- 字幕是否适合无声观看。
- 结尾是否有续集钩子。
- 是否适合系列化生产。

AI 漫剧报告示例：

```text
脚本优秀度：78
分镜表现：64
审美体验：72
爽点密度：81
传播潜力：中高
最大问题：开头冲突出现太晚，前 5 秒没有明确利益点。
优先改法：把第 18 秒的身份反转提前到第 3 秒。
```

## 5. P0 技术路线

本地 MVP 推荐路线：

```text
Next.js 前端
  -> POST /api/video-assets 上传视频
  -> 本地存储视频文件
  -> POST /api/video-analysis-jobs 创建任务
  -> ffmpeg 提取音频
  -> FunASR 微服务转写
  -> ffmpeg 抽帧
  -> 本地知识库检索
  -> LLM 生成评估报告
  -> 前端展示报告
```

P0 可以先使用本地文件存储：

```text
storage/uploads   上传视频
storage/audio     提取音频
storage/frames    视频抽帧
storage/jobs      分析任务快照 JSON
storage/reports   分析报告 JSON
storage/logs      结构化运行错误 JSONL
```

上传视频旁保存 `.metadata.json` sidecar，用于恢复原始文件名等资产元数据。

P0 可以先使用本地 JSON/Markdown 知识库，不强制引入完整向量数据库。后续确认效果后，再替换为向量检索。

## 6. API 需求

推荐接口：

```text
POST /api/video-assets
POST /api/video-analysis-jobs
GET  /api/video-analysis-jobs/:jobId
GET  /api/video-analysis-jobs/:jobId/report
```

当前接口职责：

- `POST /api/video-assets`：验证并保存视频，只创建资产。
- `POST /api/video-analysis-jobs`：接收已有 `assetId`，持久化 `uploaded` 任务后返回 `202 Accepted`，后台执行 MVP 链路。
- `GET /api/video-analysis-jobs/:jobId`：返回任务快照和 `progressPercent`、`currentStage`、`isTerminal`。
- `GET /api/video-analysis-jobs/:jobId/report`：读取已持久化报告。

为了最快演示，继续保留兼容单接口：

```text
POST /api/upload-video
```

该接口用于一次请求完成上传和分析，内部仍调用 `runVideoAnalysisJob`，不在 route 内复制业务逻辑。
前端上传体验应优先走推荐四步链路：上传资产、创建任务、轮询任务状态、读取报告；兼容接口仅用于快速本地 smoke。

## 7. 主报告 DTO

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
    scoreReasons: {
      scriptQuality: string;
      hookStrength: string;
      sceneDesign: string;
      aestheticExperience: string;
      emotionalRhythm: string;
      differentiation: string;
      viralPotential: string;
      aiDramaFit?: string;
    };
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

## 8. 非 P0 范围

以下能力暂不进入 P0：

- 完整用户系统。
- 云端对象存储。
- 多租户权限。
- 大规模爬虫。
- 真实向量数据库平台。
- 自动发布内容。
- 抖音、微博、小红书真实账号授权。
- 商业化支付系统。

## 9. 验收标准

P0 完成时必须满足：

- 用户可以上传一个中文视频。
- 系统可以生成对应的分析任务。
- 系统可以按任务 ID 查询状态、进度和终态。
- 系统可以从视频中提取音频。
- 系统可以调用 FunASR 生成中文文稿，或在失败时进入手动文稿降级。
- 系统可以完成最小抽帧。
- 系统可以检索本地知识库。
- 系统可以生成结构化内容分析报告。
- AI 漫剧视频可以输出专项诊断。
- 前端可以展示报告，并提供“一键生成相似爆款”入口。

## 10. 开发优先级

1. 补齐 `VideoAnalysisJob` 和任务状态模型。
2. 接通上传视频到本地存储。
3. 接通 `ffmpeg` 音频提取。
4. 接通 FunASR 中文转写。
5. 做最小版抽帧。
6. 建立本地 RAG 知识库。
7. 生成结构化内容评估报告。
8. 前端展示报告和“一键生成相似爆款”按钮。
9. 增强 AI 漫剧专项维度。
