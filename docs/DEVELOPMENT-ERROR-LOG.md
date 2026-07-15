# 博闻开发错误日志

本文记录开发和验证过程中发现的可复现错误、根因、修复和验证证据。
运行时错误由应用追加到 `storage/logs/errors.jsonl`，本文只保留需要长期沉淀的开发问题。

## 2026-07-10 PaddleOCR Windows CPU 推理失败

- 阶段：P1 字幕 OCR
- 错误：`ConvertPirAttribute2RuntimeAttribute not support pir::ArrayAttribute<pir::DoubleAttribute>`
- 根因：PaddleOCR 3.7.0 在 Windows CPU 默认选择 MKL-DNN/oneDNN 推理路径，
  PaddlePaddle 3.3.1 无法转换 PP-OCRv6 模型中的对应 PIR 属性。
- 修复：OCR 服务默认使用 `engine=paddle_static` 和 `enable_mkldnn=false`。
- 回归：`services/paddleocr-service/test_app.py`
- 验证：真实图片成功识别文本，置信度 `0.9826`。

## 2026-07-10 错误日志测试路径与存储约定不一致

- 阶段：P2 任务持久化与错误日志
- 错误：测试读取 `<root>/errors.jsonl`，实现写入 `<root>/logs/errors.jsonl`。
- 根因：测试没有遵循统一存储根的子目录约定；任务、上传文件和运行日志应分别进入
  `jobs`、`uploads` 和 `logs`。
- 修复：测试改为读取 `<root>/logs/errors.jsonl`。
- 回归：`tests/LocalJsonlErrorLog.test.ts`
- 验证：结构化 JSONL 条目可独立解析并保留技术详情。

## 2026-07-10 上传阶段无法记录致命失败

- 阶段：P2 `VideoAnalysisJob` 聚合
- 错误：聚合最初禁止 `uploaded -> failed`，导致本地视频存储失败时无法记录任务失败。
- 根因：状态规则只考虑了音频、转写、抽帧等处理中失败，遗漏了上传资产持久化也可能失败。
- 修复：允许所有非终态进入 `failed`，失败对象记录当时的真实阶段。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：模拟只读磁盘时任务依次持久化为 `uploaded`、`failed`，并保留错误码和原始 message。

## 2026-07-10 重复上传覆盖已有资产和报告

- 阶段：P2 上传与任务持久化
- 错误：相同文件名、大小和格式会生成相同 `assetId`，相同标题和品类又会生成相同 `jobId`。
- 根因：把稳定哈希误用作实体身份，违反“每次上传生成唯一资产 ID”的领域规则。
- 风险：重复上传会覆盖视频文件、任务快照和分析报告。
- 修复：上传资产与任务改用 Node `randomUUID()`；稳定哈希只用于没有上传实体的文本分析兼容路径。
- 回归：`tests/uploadVideoRoute.test.ts`
- 验证：连续两次上传相同文件生成不同资产 ID 和任务 ID。

## 2026-07-10 重新加载资产时丢失原始文件名

- 阶段：P2 Upload / Asset 用例拆分
- 错误：`LocalVideoStorage` 为安全落盘会规范化文件名，但按资产 ID 重新加载时只能从存储路径反推文件名。
- 根因：视频文件旁没有持久化资产元数据，导致 `Demo Video.mp4` 被恢复为 `demo-video.mp4`。
- 风险：独立创建分析任务时，报告文件名、前端展示和审计信息与用户上传内容不一致。
- 修复：保存视频时同时写入 `.metadata.json` sidecar，记录原始文件名；旧资产缺少 sidecar 时继续回退到规范化文件名。
- 回归：`tests/LocalVideoStorage.test.ts`
- 验证：保存并按 ID 重新加载后仍返回原始文件名。

## 2026-07-10 错误日志不可写导致可降级链路失败

- 阶段：P2 运行时可观测性
- 错误：音频提取或 OCR 已有 fallback 时，`ErrorLogPort.append` 写入失败仍会抛出异常并把整个任务标记为失败。
- 根因：可观测性副作用与业务编排共用同一异常传播路径，日志设施意外成为主链路单点故障。
- 风险：磁盘日志目录短暂不可写时，本可完成的分析任务全部失败。
- 修复：可恢复错误日志使用 best-effort 写入；持久化失败时输出包含原始条目和日志异常的 `console.error`，主链路继续执行。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：模拟日志磁盘只读后，音频/OCR fallback 仍能完成任务并持久化报告。

## 2026-07-10 本地后台调度器空闲判断竞态

- 阶段：P2 异步任务创建
- 错误：任务通过 `setTimeout` 延迟登记，紧接着调用 `waitForIdle()` 时可能看到空集合并提前返回。
- 根因：pending 状态在延迟回调内部才创建，调度器在 `schedule()` 返回到任务真正开始之间存在不可观察窗口。
- 风险：测试清理临时目录或进程关闭时，后台任务仍可能继续写入，造成 `ENOTEMPTY`、文件缺失或任务泄漏。
- 修复：`schedule()` 调用期间立即创建并登记完成 Promise，延迟回调只负责执行任务。
- 回归：`tests/LocalBackgroundTaskScheduler.test.ts`、`tests/createVideoAnalysisJobRoute.test.ts`
- 验证：`waitForIdle()` 可以等待尚未开始和执行中的任务，失败任务也会被捕获并报告。

## 2026-07-10 前端报告映射误用未落地 DTO 字段

- 阶段：P2 前端轮询链路
- 错误：前端将报告映射为旧展示模型时读取 `report.evaluation.scores.differentiation`。
- 根因：需求文档建议了 `differentiation` 评分维度，但当前 `VideoAnalysisReport` 类型尚未落地该字段。
- 风险：生产构建 TypeScript 检查失败，阻断部署。
- 修复：界面映射改为使用已存在的 `viralPotential` 和 `scriptQuality` 计算独特性展示分。
- 回归：`npm run build`
- 验证：Next.js 生产构建通过。

## 2026-07-10 评估维度文档已定义但报告 DTO 未落地

- 阶段：P2 内容质量评估
- 错误：文档要求 `emotionalRhythm`、`differentiation` 和“每个评分必须有理由”，但 `VideoAnalysisReport.evaluation` 只返回部分分数且没有评分理由。
- 根因：P0 报告构建先满足了展示所需的最小字段，未回填领域文档中的完整评估维度。
- 风险：RAG 与 AI 评估缺少可解释证据，前端无法说明分数从何而来。
- 修复：扩展 `ContentEvaluation`，新增情绪节奏、差异化分数和 `scoreReasons`；上传链路摘要展示评分依据。
- 回归：`tests/videoAnalysisReport.test.ts`、`tests/UploadPipelineSummary.test.tsx`
- 验证：报告 JSON 和前端摘要均能展示新增维度及理由。

## 2026-07-10 API 系统错误被日志写入失败遮蔽

- 阶段：P2 统一错误日志与 API 查询链路
- 错误：`POST /api/video-assets` 和 `POST /api/video-analysis-jobs` 在业务失败后直接 `await errorLog.append`；如果日志目录也不可写，接口会抛出日志异常而不是返回原始结构化错误。
- 根因：API route 把错误日志持久化当成必须成功的响应前置步骤，违背“错误可定位但不能破坏演示”的规范。
- 风险：真实根因如视频保存失败、任务创建失败会被 `log directory is read-only` 遮蔽，前端拿不到稳定错误码。
- 修复：新增 `appendApiErrorLogSafely`，API 系统错误日志采用 best-effort 写入；失败时输出 `console.error` 技术告警并继续返回原始错误响应。
- 回归：`tests/apiErrorLoggingResilience.test.ts`
- 验证：业务失败和日志失败同时发生时，接口仍返回对应 `SYSTEM_*` JSON。

## 2026-07-10 任务致命失败被错误日志写入失败遮蔽

- 阶段：P2 `runVideoAnalysisJob` 致命错误处理
- 错误：视频保存失败等 fatal 分支会先持久化 failed 任务，再直接 `await ErrorLogPort.append`；当日志也不可写时，用例抛出的变成日志异常。
- 根因：fatal 日志与 recoverable 日志没有统一 best-effort 处理，导致观测性副作用覆盖业务主异常。
- 风险：调用方无法收到 `VideoAnalysisJobExecutionError`，也无法读取其中的 failed 任务快照。
- 修复：新增 fatal 日志 best-effort 写入，失败时输出 `Failed to persist fatal video analysis error.` 技术告警，并继续抛出原始 `VideoAnalysisJobExecutionError`。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：视频存储失败且日志写入失败时，任务快照仍持久化为 `failed`，调用方收到原始 `disk is read-only`。

## 2026-07-10 调度失败导致 uploaded 任务悬空

- 阶段：P2 异步任务创建
- 错误：`createVideoAnalysisJob` 在保存 `uploaded` 快照后直接调用后台调度器；如果 `scheduler.schedule()` 立即抛错，任务会留在 `uploaded`，但没有后台执行者继续推进。
- 根因：创建用例只覆盖了“任务执行中失败”的 fatal 分支，遗漏了“任务尚未进入后台队列”的同步调度失败。
- 风险：前端轮询会持续看到非终态任务，用户无法得知任务已经不可能继续运行；本地演示也会残留不可恢复的任务快照。
- 修复：调度失败时恢复初始聚合，使用 `SYSTEM_VIDEO_ANALYSIS_SCHEDULING_FAILED` 将任务持久化为 `failed`，`failure.stage` 保留 `uploaded`，再重新抛出原始调度异常。
- 回归：`tests/createVideoAnalysisJob.test.ts`
- 验证：模拟 `scheduler unavailable` 时，仓储先保存 `uploaded`，再保存 `failed`，且 `runJob` 不会被调用。

## 2026-07-10 查询接口 404 错误码分类不一致

- 阶段：P2 API 查询链路
- 错误：`GET /api/video-analysis-jobs/:jobId` 和 `GET /api/video-analysis-jobs/:jobId/report` 对不存在资源返回 404，但错误码使用 `PARAM_*`。
- 根因：早期 route 测试只验证了 HTTP 状态，没有按照错误处理规范校验资源类错误码前缀。
- 风险：前端和调用方无法用 `RESOURCE_*` 统一识别“资源不存在/尚未生成”，错误分析报表也会把查询缺失误归为参数错误。
- 修复：缺失任务改为 `RESOURCE_VIDEO_ANALYSIS_JOB_NOT_FOUND`，缺失报告改为 `RESOURCE_VIDEO_ANALYSIS_REPORT_NOT_FOUND`。
- 回归：`tests/videoAnalysisJobRoute.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：两个查询接口的 404 响应均返回 `RESOURCE_*` 错误码，并保留 `traceId`。

## 2026-07-10 AI 漫剧一键大纲缺少专项结构

- 阶段：P2 内容评估与相似爆款生成
- 错误：需求要求 AI 漫剧输出人物关系、冲突、反转和续集钩子，但 `generatedOutline` 只有通用标题、脚本、分镜和结尾钩子。
- 根因：P1 报告优先满足通用短视频展示，没有把 AI 漫剧专项字段沉淀到 DTO 和前端摘要。
- 风险：AI 漫剧创作者只能看到泛化大纲，无法直接复用到短剧生产所需的角色关系和剧情反转设计。
- 修复：`GeneratedViralOutline` 新增可选 `aiDramaOutline`，AI 漫剧报告生成四项专项大纲；上传摘要在字段存在时展示专项结构。
- 回归：`tests/videoAnalysisReport.test.ts`、`tests/UploadPipelineSummary.test.tsx`
- 验证：AI 漫剧报告包含 relationship、conflict、reversal、cliffhanger，前端摘要展示“AI 漫剧专项大纲”。

## 2026-07-10 GET 查询仓储异常绕过结构化 API 响应

- 阶段：P2 API 查询链路与统一错误日志
- 错误：`GET /api/video-analysis-jobs/:jobId` 和 `/report` 只处理 404；当本地 JSON 损坏、磁盘读取失败或仓储异常时，错误会直接抛给 Next.js。
- 根因：查询 route 早期只按 happy path 和 missing path 建模，没有复用 POST route 的 best-effort API 错误日志策略。
- 风险：前端拿不到稳定错误码和 `traceId`，运行错误也不会进入 `storage/logs/errors.jsonl`；如果日志目录也不可写，原始响应会被二次错误遮蔽。
- 修复：两个 GET route 捕获仓储异常，分别返回 `SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED` 和 `SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED`，并通过 `appendApiErrorLogSafely` 写入日志。
- 回归：`tests/apiErrorLoggingResilience.test.ts`、`tests/videoAnalysisJobRoute.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：模拟查询仓储与日志写入同时失败时，接口仍返回结构化 500，并输出 `Failed to persist API error log.` 技术告警。

## 2026-07-10 非法 jobId 查询被误归类为系统错误

- 阶段：P2 API 查询链路
- 错误：当 `jobId` 为 `!!!` 等完全不可用于本地文件名的值时，仓储清洗后抛出 `Job id must contain at least one safe character.`，route 返回系统查询失败 500。
- 根因：GET route 没有在协议层校验路径参数，把明显的请求参数错误交给了基础设施适配器处理。
- 风险：调用方会把用户输入错误误判为系统故障，运行日志也会掺入不必要的 `SYSTEM_*` 噪声。
- 修复：新增 `isSafeVideoAnalysisJobId`，任务与报告查询在访问仓储前校验 ID，只允许字母、数字、下划线和短横线。
- 回归：`tests/videoAnalysisJobRoute.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：非法 ID 查询返回 `PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID` 和 400，并保留 `traceId`。

## 2026-07-10 本地仓储有损清洗 jobId 可能导致文件碰撞

- 阶段：P2 任务与报告持久化
- 错误：`LocalJsonJobRepository` 和 `LocalJsonReportRepository` 会把 `job/123` 静默清洗成 `job123.json` 后继续写入。
- 根因：基础设施适配器复用了“尽量生成安全文件名”的思路，但任务 ID 是实体身份，不能被有损改写。
- 风险：不同非法 ID 可能落到同一个文件名，覆盖任务快照或报告；同时审计时无法从文件名反推出真实任务 ID。
- 修复：新增 `toSafeJobFileStem`，本地任务/报告仓储只接受字母、数字、下划线和短横线，unsafe ID 直接抛错；API 层负责在访问仓储前转成结构化 400。
- 回归：`tests/LocalJsonJobRepository.test.ts`、`tests/LocalJsonReportRepository.test.ts`
- 验证：保存或读取 `job/123` 会抛出稳定错误，不再静默写入 `job123.json`。

## 2026-07-10 completed 状态持久化失败遮蔽原始错误

- 阶段：P2 `runVideoAnalysisJob` 任务状态持久化
- 错误：`advanceAndSave()` 会先把内存聚合推进到 `completed`，再保存快照；如果保存 `completed` 失败，catch 中继续对该聚合调用 `fail()` 会触发 `completed -> failed` 非法转换。
- 根因：编排逻辑把“内存已推进”误当成“状态已成功持久化”，没有记录最后一次真正落库的任务快照。
- 风险：原始持久化错误被 `InvalidJobTransitionError` 遮蔽，任务无法落为 `failed`，查询链路会停留在上一阶段且缺少失败原因。
- 修复：`runVideoAnalysisJob` 维护 `lastPersistedJob`；fatal 失败时恢复最后成功落库的快照再进入 `failed`，并继续抛出 `VideoAnalysisJobExecutionError`。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：模拟保存 `completed` 失败时，任务从最后持久化的 `evaluating` 阶段进入 `failed`，错误日志保留原始 `job store unavailable on completed`。

## 2026-07-10 failed 快照持久化失败遮蔽原始 fatal 错误

- 阶段：P2 `runVideoAnalysisJob` fatal 错误处理
- 错误：业务已经发生 fatal 失败后，catch 会先保存 `failed` 快照；如果此时任务仓储也不可写，用例最终抛出仓储错误而不是原始业务错误。
- 根因：failed 快照持久化仍被当成必须成功的步骤，没有按错误处理规范做 best-effort 保护。
- 风险：例如视频保存失败会被 `job store is read-only` 遮蔽，调用方无法知道原始 `disk is read-only`，错误日志也缺少失败快照持久化失败的上下文。
- 修复：新增 failed 快照 best-effort 持久化；失败时输出 `Failed to persist failed video analysis job.` 技术告警，fatal 错误日志 detail 同时携带原始错误和 failed 快照持久化错误。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：模拟视频保存失败且 failed 快照保存失败时，用例仍抛出 `VideoAnalysisJobExecutionError: disk is read-only`，错误日志保留 `failedJobPersistenceError`。

## 2026-07-10 初始 uploaded 快照保存失败绕过统一 fatal 处理

- 阶段：P2 `runVideoAnalysisJob` 任务初始化
- 错误：兼容单接口路径中，`runVideoAnalysisJob` 在 `try` 外保存初始 `uploaded` 快照；如果该保存失败，会直接抛出裸仓储错误。
- 根因：初始快照保存被视为进入编排前的准备步骤，没有纳入统一任务 fatal 处理模型。
- 风险：`POST /api/upload-video` 无法收到 `VideoAnalysisJobExecutionError`，错误日志缺少 `traceId`、`jobId` 和失败阶段；调用方也无法读取 failed 快照。
- 修复：将初始 `uploaded` 保存纳入 `try/catch`；失败时基于 `uploaded` 快照构造 `failed`，尽力保存并写 fatal 错误日志。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：模拟首次保存 `uploaded` 失败时，用例抛出 `VideoAnalysisJobExecutionError`，失败阶段为 `uploaded`，并写入 `SYSTEM_VIDEO_ANALYSIS_FAILED` 日志。

## 2026-07-10 终态任务重复执行触发非法状态转换

- 阶段：P2 `VideoAnalysisJob` 生命周期规则
- 错误：`runVideoAnalysisJob` 收到 `completed` 或 `failed` 初始任务时仍继续进入执行链路，随后状态推进触发 `InvalidJobTransitionError`。
- 根因：领域文档定义“已完成任务不能重复执行”，但应用层编排没有在副作用前做终态守卫。
- 风险：重复执行请求可能触发视频存储、转写、抽帧等不应发生的副作用，并返回不可操作的内部状态转换错误。
- 修复：`runVideoAnalysisJob` 对终态 `initialJob` 早期拒绝，写入 `SYSTEM_VIDEO_ANALYSIS_TERMINAL_JOB_RERUN_REJECTED` fatal 日志，并抛出带原任务快照的 `VideoAnalysisJobExecutionError`。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：传入 `completed` 或 `failed` 初始任务时，不调用视频存储、工作区准备或任务保存，错误日志保留 `traceId` 和终态阶段。

## 2026-07-10 调度失败后的 failed 快照保存失败遮蔽原始调度错误

- 阶段：P2 异步任务创建
- 错误：`scheduler.schedule()` 抛出 `scheduler unavailable` 后，用例会把刚创建的 `uploaded` 任务标记为 `failed`；如果保存该 failed 快照也失败，最终抛出的会变成仓储错误。
- 根因：调度失败后的 failed 快照持久化仍被当成必须成功的步骤，没有按错误处理规范做 best-effort 保护。
- 风险：API 层无法拿到原始调度异常，前端和日志会误判为任务仓储故障；真实的“任务没有入队”原因被遮蔽。
- 修复：新增 `persistFailedSchedulingJobSafely`，failed 快照保存失败时输出 `Failed to persist failed video analysis scheduling job.` 技术告警，并继续向上抛出原始调度异常。
- 回归：`tests/createVideoAnalysisJob.test.ts`
- 验证：模拟调度失败且 failed 快照保存失败时，用例仍抛出原始 `scheduler unavailable`，并记录技术告警。

## 2026-07-10 兼容上传接口错误响应未结构化

- 阶段：P2 兼容 API `/api/upload-video`
- 错误：旧上传接口对缺失文件、格式不支持等请求错误返回 `{ error: string }`；系统异常虽然返回 `success: false`，但 API 层没有 best-effort 错误日志保护。
- 根因：前后端拆分后新增的 `/api/video-assets` 和 `/api/video-analysis-jobs` 已采用统一错误协议，兼容接口仍保留 P0 早期响应格式。
- 风险：前端和调试工具无法统一读取 `error.code` 与 `traceId`；当分析用例在 API 层抛出异常且日志目录不可写时，也缺少 `Failed to persist API error log.` 技术告警。
- 修复：`/api/upload-video` 请求错误统一返回 `success:false + error.code + error.message + traceId`；分析异常通过 `appendApiErrorLogSafely` 追加 API 错误日志，日志失败时不遮蔽原始 500 响应。
- 回归：`tests/uploadVideoRoute.test.ts`、`tests/apiErrorLoggingResilience.test.ts`
- 验证：缺失视频文件返回 `REQUEST_VIDEO_FILE_REQUIRED`，不支持格式返回 `REQUEST_UNSUPPORTED_VIDEO_FORMAT`；模拟分析异常和日志失败时仍返回 `SYSTEM_VIDEO_ANALYSIS_FAILED` 并输出技术告警。

## 2026-07-10 内容评估缺少可复用关键词推荐

- 阶段：P2 内容质量评估与前端摘要
- 错误：报告已有脚本优秀度、分镜、审美体验等评分和理由，但没有输出可直接复用到创作改写中的关键词。
- 根因：P1/P2 报告 DTO 优先补齐评分解释，未把“关键词自动推荐”沉淀为结构化字段和前端展示块。
- 风险：创作者只能阅读诊断结论，无法快速提取“身份反转、反应镜头、高对比字幕”等可执行制作词，AI 漫剧适配价值下降。
- 修复：`ContentEvaluation` 新增 `keywordRecommendations`，按脚本、钩子、分镜、审美和差异化生成关键词与原因；上传摘要新增“关键词推荐”展示。
- 回归：`tests/videoAnalysisReport.test.ts`、`tests/UploadPipelineSummary.test.tsx`
- 验证：AI 漫剧报告返回“身份反转”“反应镜头”“高对比字幕”；OCR 字幕证据存在时额外推荐“首帧字幕钩子”。

## 2026-07-10 前端分析客户端丢失 API traceId

- 阶段：P2 前端轮询链路与错误诊断
- 错误：`runVideoAnalysisPipelineClient` 在处理结构化 API 错误时只保留 `error.code` 和 `error.message`，轮询到 failed 任务时也只保留任务失败原因，都会丢弃响应里的 `traceId`。
- 根因：客户端错误对象早期只服务 UI 文案展示，没有把运行时错误日志对账作为字段契约。
- 风险：前端出现上传、建任务或查询失败时，无法把用户看到的错误与 `storage/logs/errors.jsonl` 中的同一条记录关联起来。
- 修复：`VideoAnalysisPipelineClientError` 新增 `traceId` 字段，`requestJson` 在结构化错误响应中透传 API `traceId`；任务轮询读取 API envelope，把查询 traceId 附加到进度视图，并在 failed 任务错误中继续透传。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：模拟 `/api/video-assets` 返回 `REQUEST_UNSUPPORTED_VIDEO_FORMAT` 和 `trace_upload_error` 时，客户端错误保留同一个 `traceId`；模拟任务轮询返回 failed 和 `trace_failed_job` 时，客户端错误同时保留 `jobId` 和 `traceId`。

## 2026-07-10 损坏任务快照被查询接口当成成功响应

- 阶段：P2 API 查询链路与任务持久化
- 错误：本地 `storage/jobs/*.json` 中的任务快照如果出现未知 `status`，`GET /api/video-analysis-jobs/:jobId` 会继续返回 `success:true`，并产生不可用的进度投影。
- 根因：查询 route 只捕获仓储读取异常，未把进度投影纳入查询异常边界；`projectVideoAnalysisJobProgress` 也没有运行时校验未知状态。
- 风险：前端可能把损坏任务当成正常任务继续展示或轮询，用户拿不到结构化错误码和可对账的 `traceId`。
- 修复：进度投影新增 `InvalidVideoAnalysisJobProgressProjectionError`，未知任务状态或未知失败阶段会直接拒绝；查询 route 将投影纳入 `SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED` 的结构化 500 分支。
- 回归：`tests/videoAnalysisJobRoute.test.ts`
- 验证：手写损坏 `job_corrupt.json` 后，查询接口返回 `SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED` 和 `traceId`，不再返回成功响应。

## 2026-07-10 本地任务仓储接受未知任务状态

- 阶段：P2 任务持久化
- 错误：`VideoAnalysisJobAggregate.restore` 和 `LocalJsonJobRepository` 保存/读取任务快照时没有校验完整生命周期，只做克隆或 JSON 序列化/反序列化。
- 根因：TypeScript 类型被误当成持久化边界的校验；但本地 JSON 文件可能被旧版本、手动编辑或异常写入污染。
- 风险：非 API 查询路径也可能读到未知状态、跳阶段历史或缺失失败详情的任务，后续编排、进度投影或前端轮询会在更远处才失败。
- 修复：领域层新增 `InvalidJobSnapshotError` 和 `assertValidVideoAnalysisJobSnapshot`，恢复聚合、保存仓储和读取仓储都复用同一套校验；拒绝未知状态、跳阶段历史、当前状态与历史尾部不一致、failed 缺少 failure、非 failed 携带 failure 等污染快照。
- 回归：`tests/VideoAnalysisJob.test.ts`、`tests/LocalJsonJobRepository.test.ts`
- 验证：读取或保存 `unknown_status` 快照时抛出 `Invalid video analysis job snapshot status: unknown_status`；恢复跳过 `extracting_audio/transcribing` 的历史时抛出 `InvalidJobSnapshotError`。

## 2026-07-10 报告仓储接受错配 jobId 和非法状态

- 阶段：P2 报告持久化与 API 查询链路
- 错误：`LocalJsonReportRepository` 读取 `reports/job_123.json` 时不校验报告内容里的 `jobId`，也不校验报告 `status`。
- 根因：报告仓储沿用了早期裸 JSON 读写方式，把 TypeScript DTO 当成了持久化边界校验。
- 风险：`GET /api/video-analysis-jobs/:jobId/report` 可能对 `job_123` 返回属于 `job_other` 的报告，且非法状态也可能流入前端。
- 修复：报告仓储保存和读取时校验 `jobId`、安全文件名和 `status`；按 jobId 读取时要求文件内容 `jobId` 与请求 ID 完全一致，错配进入结构化查询失败分支。
- 回归：`tests/LocalJsonReportRepository.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：读取错配 `job_123.json` 返回 `Report job id mismatch: expected job_123 but found job_other.`；API 查询返回 `SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED` 和 `traceId`。

## 2026-07-10 失败任务快照的阶段和时间可与历史错位

- 阶段：P2 `VideoAnalysisJob` 聚合快照校验
- 错误：`VideoAnalysisJobAggregate.restore` 已校验历史顺序，但没有校验 `failure.stage` 是否等于失败前最后一个 active 阶段，也没有校验 `failure.occurredAt`、`updatedAt` 与历史时间一致。
- 根因：早期快照校验只关注状态流转合法性，没有把错误日志、进度投影和失败详情所依赖的时间/阶段一致性纳入领域不变量。
- 风险：任务可能显示在 `extracting_audio` 失败，但错误详情记录为 `transcribing`；或者 `updatedAt` 与历史尾部不一致，导致 API 查询和前端轮询展示错误阶段。
- 修复：领域快照校验要求 `createdAt` 等于首个历史时间，`updatedAt` 等于最新历史时间；failed 快照要求 `failure.stage` 等于失败前最后 active 阶段，`failure.occurredAt` 等于 failed 历史时间。
- 回归：`tests/VideoAnalysisJob.test.ts`
- 验证：阶段错位、失败时间错位、更新时间错位的快照均被 `InvalidJobSnapshotError` 拒绝。

## 2026-07-10 错误日志复杂 detail 导致 JSONL 写入失败/信息丢失

- 阶段：P2 统一错误日志
- 错误：`LocalJsonlErrorLog` 直接对日志 entry 执行 `JSON.stringify`；当 `detail` 包含 `bigint` 或循环引用时会抛错，包含 `Error` 对象时也可能丢失 message/stack 等关键技术信息。
- 根因：错误日志被当成普通 DTO 序列化，没有把运行时异常对象和诊断上下文中的复杂值纳入持久化边界契约。
- 风险：真正需要排障的 fatal/API 错误可能因为日志 detail 复杂而无法落盘，或落盘后缺少原始错误栈，导致 `traceId` 对账和故障定位失效。
- 修复：`LocalJsonlErrorLog` 增加安全 JSONL 序列化器，`bigint` 转字符串，`Error` 保留 `name/message/stack`，循环引用写为 `[Circular]`，保证单行日志仍可被 `JSON.parse` 读取。
- 回归：`tests/LocalJsonlErrorLog.test.ts`
- 验证：`npm test -- tests\LocalJsonlErrorLog.test.ts tests\apiErrorLoggingResilience.test.ts tests\runVideoAnalysisJob.test.ts` 通过，覆盖复杂 detail 和日志失败不遮蔽原始错误。

## 2026-07-10 旧格式报告缺少评估字段仍被查询接口成功返回

- 阶段：P2 报告持久化与 API 查询链路
- 错误：`LocalJsonReportRepository` 只校验 `jobId/status`，缺少 `evaluation.scoreReasons`、`keywordRecommendations` 或评分越界的旧格式/损坏报告仍会被 `GET /api/video-analysis-jobs/:jobId/report` 当成 `success:true` 返回。
- 根因：报告 DTO 在 P1/P2 增加了脚本优秀度、分镜、审美体验、情绪节奏、差异化和关键词推荐等字段，但持久化边界没有同步升级运行时校验。
- 风险：前端报告页可能拿到无法展示或误导用户的半截报告；RAG 依据、AI 漫剧专项建议和“一键生成相同爆款”入口也会缺少必要上下文。
- 修复：报告仓储保存/读取时校验主报告结构，要求 `video/transcript/understanding/knowledgeEvidence/evaluation/generatedOutline` 存在；核心评分必须是 0-100 的有限数字，评分理由和关键词推荐必须符合报告契约。
- 回归：`tests/LocalJsonReportRepository.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：缺少 `scoreReasons` 或 `viralPotential` 分值越界的报告会被仓储拒绝；报告查询接口返回 `SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED` 和 `traceId`。

## 2026-07-10 错误日志缺少对账字段仍可落盘

- 阶段：P2 统一错误日志
- 错误：`LocalJsonlErrorLog` 能写入空 `traceId` 或非法 `timestamp` 的日志行，`code/stage/message` 等关键字段也没有运行时入口校验。
- 根因：错误日志端口只依赖 TypeScript 类型，未在基础设施持久化边界保护运行时调用方或测试替身传入的坏数据。
- 风险：`errors.jsonl` 中可能出现无法和 API 响应、任务快照对账的记录，后续排障按 `traceId` 查找时会断链。
- 修复：日志写入前校验非空 `traceId/code/stage/message/timestamp`，并要求 timestamp 可被解析为有效日期；非法日志直接拒绝，不污染 JSONL 文件。
- 回归：`tests/LocalJsonlErrorLog.test.ts`
- 验证：空 `traceId` 返回 `Error log traceId is required.`，非法时间戳返回 `Error log timestamp must be a valid ISO date string.`；API 和任务 fatal 日志相关回归仍通过。

## 2026-07-10 热榜 fallback 丢失可读降级原因

- 阶段：P1/P2 热榜抓取与可信展示
- 错误：`getHotVideos` 在 live source 抛错或 live 排名不足 10 条时只返回 `source:"fallback"`，没有告诉前端为什么降级。
- 根因：早期热榜响应只关注数据可用性，没有把“fallback 来源必须可见且原因可读”的信任契约沉淀到 DTO。
- 风险：用户看到回退榜单时无法判断是平台抓取失败、数据不足还是其他问题，容易误以为结果来自实时榜单。
- 修复：`TrendFetchResult` 新增可选 `fallbackReason`；live 异常时保留原始错误 message，live 榜单不足时返回固定中文说明；前端热榜侧栏在 fallback 时展示该原因。
- 回归：`tests/engine.test.ts`
- 验证：live source 抛出 `live unavailable` 时响应包含该原因；live 排名不足 10 条时返回“实时榜单不足 10 条，已切换到本地演示样本。”。

## 2026-07-10 报告关键词推荐元素结构损坏仍被放行

- 阶段：P2 报告持久化与前端摘要展示
- 错误：`LocalJsonReportRepository` 只校验 `evaluation.keywordRecommendations` 是数组，没有校验每个元素的 `dimension/label/keywords/reason`。
- 根因：报告持久化边界只覆盖了字段存在性，未把前端直接调用 `item.keywords.join()` 的元素级契约纳入运行时校验。
- 风险：损坏报告可能在查询接口返回 `success:true` 后导致前端摘要渲染异常，或者展示缺少关键词/原因的不可执行建议。
- 修复：保存和读取报告时校验关键词推荐元素，要求合法维度、非空 label/reason，且 `keywords` 为非空字符串数组。
- 回归：`tests/LocalJsonReportRepository.test.ts`、`tests/videoAnalysisReportRoute.test.ts`
- 验证：`keywords` 为字符串的坏报告被仓储拒绝；报告查询接口返回 `SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED` 和 `traceId`。

## 2026-07-10 报告数组校验未提供 TypeScript 窄化导致构建失败

- 阶段：P2 报告持久化边界
- 错误：新增 `keywordRecommendations` 元素校验后，`npm test` 通过，但 `npm run build` 在 `evaluation.keywordRecommendations` 迭代处失败，提示该字段仍为 `unknown`。
- 根因：`assertArray` 只做运行时校验，函数签名没有使用 `asserts value is unknown[]`，Vitest 运行未触发 Next.js 的完整 TypeScript 构建检查。
- 风险：本地单测绿色但生产构建失败，阻断演示部署。
- 修复：将 `assertArray` 改为 TypeScript assertion function，使运行时校验和静态类型收窄保持一致。
- 回归：`npm run build`
- 验证：重新运行 `npm run build` 通过。

## 2026-07-10 任务快照允许非法时间戳和历史时间倒退

- 阶段：P2 `VideoAnalysisJob` 聚合与任务持久化
- 错误：`VideoAnalysisJobAggregate.restore` 只校验状态流转，没有校验 `createdAt/updatedAt/history.occurredAt/failure.occurredAt` 是有效 ISO 时间，也没有校验历史时间不能倒退；`advance/fail` 也能接受早于当前 `updatedAt` 的时间。
- 根因：早期领域不变量聚焦状态机合法性，把时间字段当作普通字符串，未把进度展示和错误日志依赖的时间线一致性纳入聚合边界。
- 风险：任务查询可能展示倒退进度或错误失败时间，fatal 错误日志与任务历史无法可靠对账。
- 修复：聚合创建、恢复、推进和失败均校验有效时间戳；历史条目必须按时间非递减排列，状态推进/失败时间不得早于当前 `updatedAt`。
- 回归：`tests/VideoAnalysisJob.test.ts`、`tests/LocalJsonJobRepository.test.ts`、`tests/videoAnalysisJobRoute.test.ts`
- 验证：非法时间戳返回 `Job snapshot createdAt must be a valid ISO date string.`，历史倒退返回 `Job snapshot history timestamps must not move backwards.`，倒退推进会保持原始状态不变。

## 2026-07-10 测试时钟超过 9 秒生成非法 ISO 时间

- 阶段：P2 任务编排回归测试
- 错误：`tests/runVideoAnalysisJob.test.ts` 的 `createClock()` 在第 10 次调用时生成 `2026-07-10T00:00:010.000Z`，开启任务时间戳校验后触发 `InvalidJobSnapshotError`。
- 根因：测试时钟使用字符串拼接 `0${index}`，没有按两位秒数补零。
- 风险：本应验证 fatal 错误保持原始异常的测试，被测试夹具自身的非法时间遮蔽。
- 修复：测试时钟改为 `String(index).padStart(2, "0")`，确保生成合法 ISO 时间。
- 回归：`tests/runVideoAnalysisJob.test.ts`
- 验证：任务编排目标测试重新通过。

## 2026-07-10 前端轮询客户端会用空 jobId 继续轮询

- 阶段：P2 前端轮询链路与 API 查询契约
- 错误：`POST /api/video-analysis-jobs` 如果返回 `success:true` 但 `data.job.id` 缺失，`runVideoAnalysisPipelineClient` 会把任务 ID 归一化为空字符串，继续请求 `/api/video-analysis-jobs/`。
- 根因：客户端只校验统一 envelope，没有校验任务进度读模型的关键字段；创建任务响应的 `traceId` 也没有传入归一化阶段。
- 风险：真正的接口契约损坏会被后续裸请求错误遮蔽，用户和日志都拿不到创建任务响应里的 `traceId`。
- 修复：创建任务接口读取完整 envelope，将 `traceId` 传给 `normalizeJobProgress`；任务进度缺少非空 `id` 时抛出 `SYSTEM_INVALID_JOB_PROGRESS`，并停止后续轮询。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：畸形创建任务响应只调用两次 fetch，错误保留 `trace_job_malformed`。

## 2026-07-10 前端上传资产响应缺少 assetId 时继续创建任务

- 阶段：P2 前端上传链路与 API 契约
- 错误：`POST /api/video-assets` 如果返回 `success:true` 但 `data.asset.id` 缺失，`runVideoAnalysisPipelineClient` 会继续读取 `asset.id` 并尝试创建分析任务，最终变成后续请求的裸 `TypeError`。
- 根因：上传资产客户端只校验 envelope，没有校验资产视图的关键身份字段。
- 风险：资产上传接口契约损坏会被任务创建阶段遮蔽，前端无法拿到上传响应的 `traceId`，也可能提交空资产 ID。
- 修复：上传资产接口读取完整 envelope，将 `traceId` 传给 `normalizeUploadedAsset`；资产缺少非空 `id` 时抛出 `SYSTEM_INVALID_ASSET_RESPONSE`，并停止创建任务。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：畸形上传响应只调用一次 fetch，错误保留 `trace_asset_malformed`。

## 2026-07-10 前端轮询客户端放行未知任务状态

- 阶段：P2 前端轮询链路与任务查询契约
- 错误：任务进度响应如果带有非领域状态，例如 `unknown_status`，`runVideoAnalysisPipelineClient` 会把它当作非终态继续轮询，最终被后续空 mock 或异常请求遮蔽。
- 根因：客户端归一化只校验了 `id`，没有复用任务状态白名单和进度范围约束。
- 风险：服务端或代理返回畸形成功响应时，前端可能无限轮询、展示未知状态，且错误 `traceId` 无法对账到真实损坏响应。
- 修复：客户端新增任务状态白名单，校验 `progressPercent` 必须为 0-100 的有限数字；未知状态或非法进度值抛出 `SYSTEM_INVALID_JOB_PROGRESS` 并保留 `traceId/jobId`。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：创建任务响应返回 `unknown_status` 时只调用两次 fetch，错误保留 `trace_job_unknown_status`。

## 2026-07-10 前端客户端会展示错配任务报告

- 阶段：P2 前端报告查询链路
- 错误：任务 `job_123` 完成后，如果报告接口畸形成功返回 `job_other` 的报告，`runVideoAnalysisPipelineClient` 会直接返回该报告给页面展示。
- 根因：客户端报告读取只校验统一 envelope，没有校验报告 `jobId` 与当前任务 ID 的一致性。
- 风险：用户可能看到属于其他任务或旧任务的分析结果，破坏“上传视频 -> 当前任务 -> 当前报告”的追溯链。
- 修复：报告读取改为保留 envelope `traceId`，新增 `normalizeReport` 校验 `jobId` 与当前任务一致、`status` 为合法报告状态；错配时抛出 `SYSTEM_INVALID_REPORT_RESPONSE`。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：报告返回 `job_other` 时客户端抛错并保留 `trace_report_mismatch`。

## 2026-07-10 前端轮询客户端放行状态与终态标记不一致的任务

- 阶段：P2 前端轮询链路与任务状态机契约
- 错误：任务进度响应如果返回 `status:"uploaded"` 但 `isTerminal:true`，客户端会停止轮询并直接请求报告；如果返回 `status:"completed"` 但 `isTerminal:false`，客户端会继续轮询，最终被后续裸 `TypeError` 或超时遮蔽。
- 根因：客户端只校验了状态白名单和进度值，没有校验 `isTerminal` 必须与领域终态 `completed/failed` 保持一致。
- 风险：畸形成功响应会触发错误请求、无限等待或错误地拉取尚未生成的报告，用户拿不到可对账的 `traceId/jobId`。
- 修复：`normalizeJobProgress` 新增终态一致性校验，显式 `isTerminal` 必须等于 `status in ["completed", "failed"]`；不一致时抛出 `SYSTEM_INVALID_JOB_PROGRESS` 并保留原响应 `traceId/jobId`。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：未完成任务标记终态、已完成任务标记非终态时均只调用两次 fetch，错误保留对应 `traceId`。

## 2026-07-10 前端上传链路泄露裸网络异常

- 阶段：P2 前端上传、轮询与报告请求封装
- 错误：浏览器请求因本地 Next.js 服务未启动、连接中断等原因失败时，`runVideoAnalysisPipelineClient` 直接向页面抛出 `TypeError: fetch failed`。
- 根因：统一 envelope 解析只处理已收到 HTTP response 的错误，没有捕获 `fetcher` 在建立连接阶段抛出的异常。
- 风险：用户看到不可行动的底层错误文案，页面无法按稳定错误码分类展示“本地服务未启动”等提示，自动化测试也无法区分网络故障和接口业务错误。
- 修复：`requestJsonEnvelope` 捕获网络异常并转成 `SYSTEM_VIDEO_ANALYSIS_REQUEST_FAILED`，提示检查本地服务是否启动；已收到的结构化 API 错误仍保留服务端 `code/traceId`。
- 回归：`tests/runVideoAnalysisPipelineClient.test.ts`
- 验证：模拟 `fetcher` 抛出 `TypeError("fetch failed")` 时，只发送一次请求并返回稳定客户端错误。
