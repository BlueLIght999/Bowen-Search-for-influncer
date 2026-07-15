# 博闻 — 错误处理规范

博闻 MVP 的错误处理目标：演示不断、来源透明、问题可定位。

## 1. 错误分类

| 类型 | code 前缀 | 示例 | 处理方式 |
| --- | --- | --- | --- |
| 参数错误 | `PARAM_*` | 非法品类 | 返回 400 或使用默认值并记录 |
| 请求错误 | `REQUEST_*` | 缺少视频文件、格式不支持 | 返回 400/413/415 |
| 资源错误 | `RESOURCE_*` | 视频资产不存在 | 返回 404 |
| 数据源错误 | `SOURCE_*` | Bilibili 请求失败 | 降级 fallback |
| 抓取错误 | `CRAWLER_*` | 视频页超时 | 返回低可信度分析或提示 |
| 分析错误 | `ANALYSIS_*` | LLM JSON 无法解析 | 回退规则分析 |
| 系统错误 | `SYSTEM_*` | 未预期异常 | 返回错误响应并记录 |

## 2. 降级规则

必须降级的场景：

- live 热榜抓取失败。
- live 数据不足 10 条。
- 视频详情抓取失败但已有标题/简介。
- LLM 不可用但规则分析可用。

不能静默降级：

- source 必须显示 `fallback`。
- 低可信度分析必须标记 `confidence`。
- 日志中必须保留原始错误 message。

## 3. API route 处理方式

API route 只做三件事：

1. 解析参数。
2. 调用 use case。
3. 将结果或错误转成 HTTP response。

业务降级不写在 route 内，放在 application use case。

错误日志采用 best-effort：

- 错误日志必须始终保持可解析 JSONL；`detail` 中的 `Error`、循环引用和 `bigint` 等复杂技术信息需要安全序列化，不能因为日志内容复杂导致写入失败或丢失关键 message/stack。
- 错误日志 entry 必须包含非空 `traceId`、`code`、`stage`、`message` 和有效时间戳；缺少这些对账字段的日志不能写入 `errors.jsonl`。
- 可恢复错误日志持久化失败时必须保留技术告警，但不能反向中断已有 fallback 的业务链路。
- 分析任务致命错误日志持久化失败时必须保留技术告警，但不能遮蔽原始 `VideoAnalysisJobExecutionError`。
- 分析任务进入 `failed` 时，如果 failed 快照持久化失败，必须保留技术告警并继续抛出原始 `VideoAnalysisJobExecutionError`，错误日志 detail 需要包含 failed 快照持久化错误。
- API 系统错误日志持久化失败时必须保留技术告警，但不能遮蔽原始结构化 HTTP 错误响应。
- API 查询链路读取任务、报告或 model-run 记录失败时必须返回结构化 `SYSTEM_*_QUERY_FAILED`，并 best-effort 写入错误日志。
- RAG/知识检索仓储失败时必须显式降级为空知识依据，报告写入 `knowledgeSummary.status=failed`，并记录 `SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE`；不得让用户误以为只是“没有匹配知识”。
- slice 级多模态理解缓存读写失败时必须继续执行可用的模型分析链路，并分别记录 `SYSTEM_SLICE_UNDERSTANDING_CACHE_READ_FAILED` 或 `SYSTEM_SLICE_UNDERSTANDING_CACHE_WRITE_FAILED`，日志 detail 需要包含失败次数、`cacheStats` 和受影响 slice。
- 多模态 provider selection 缺失时必须继续执行当前可用 adapter，但要记录 `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE`；日志 detail 需要包含 stage、policy、requestedInput、reason，并在策略拒绝候选时包含 `rejectedCandidates`。

异步任务创建必须避免悬空状态：

- `createVideoAnalysisJob` 在保存 `uploaded` 快照后，如果后台调度器 `schedule()` 立即失败，必须将同一个任务持久化为 `failed`。
- 该失败使用 `SYSTEM_VIDEO_ANALYSIS_SCHEDULING_FAILED`，`failure.stage` 保留为 `uploaded`，并继续向上抛出原始调度异常。
- 调度失败后保存 `failed` 快照也失败时，必须保留技术告警并继续抛出原始调度异常，由 API 层返回原始创建失败响应。
- 查询链路必须把此类任务视为终态，前端轮询不能无限等待。
- `runVideoAnalysisJob` 初始 `uploaded` 快照保存失败时也必须进入统一 fatal 处理，尽力记录 `uploaded -> failed`，不能抛出裸仓储错误。
- `runVideoAnalysisJob` 记录 fatal 失败时必须基于最后一次成功持久化的任务快照，而不是基于可能已经提前推进但尚未落库的内存状态。
- `runVideoAnalysisJob` 收到终态初始任务时必须返回 `SYSTEM_VIDEO_ANALYSIS_TERMINAL_JOB_RERUN_REJECTED` 日志并抛出 `VideoAnalysisJobExecutionError`，不得执行媒体处理副作用。
- 任务聚合和本地任务仓储必须拒绝非法时间戳和历史时间倒退的快照，不能让进度查询或错误日志展示错乱时间线。

查询参数必须先于仓储访问校验：

- 任务 ID 只能包含英文字母、数字、下划线和短横线。
- 非法任务 ID 返回 `PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID` 和 400，不能交给本地仓储清洗后变成系统错误。

报告持久化边界必须校验主报告 DTO：

- `LocalJsonReportRepository` 保存和读取报告时必须校验 `video`、`transcript`、`understanding`、`knowledgeEvidence`、`evaluation` 和 `generatedOutline` 等前端展示依赖字段。
- `evaluation.scores` 必须覆盖脚本优秀度、前三秒钩子、分镜、审美体验、情绪节奏、差异化和爆点潜力，分值必须是 0-100 的有限数字。
- `evaluation.scoreReasons` 和 `evaluation.keywordRecommendations` 属于报告契约；关键词推荐的每一项必须包含合法维度、非空 label/reason 和字符串数组 keywords。旧格式或损坏报告不能返回 `success:true`，应由查询接口转成结构化 `SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED`。

## 4. 用户可见文案

错误文案要可行动：

- 好：`实时榜单暂时不可用，已切换到本地演示样本。`
- 差：`fetch failed`

抓取失败建议：

- `视频详情抓取失败，当前分析基于标题、简介和公开互动数据生成。`

## 5. 测试要求

必须覆盖：

- live source 抛错后 fallback。
- 非法 category 的默认行为。
- live 返回不足时 fallback。
- ranking 空数组不报错。
- LLM 分析失败回退规则分析。
- 不支持的视频格式返回结构化 415。
- 兼容上传接口 `/api/upload-video` 的请求错误也必须返回结构化 `success:false + error.code + traceId`。
- 基于不存在的资产创建任务返回结构化 404。
- 非法任务 ID 查询返回结构化 400。
- 后台调度器启动失败时，已创建任务必须从 `uploaded` 转为 `failed`。
- 致命任务错误写入 `storage/logs/errors.jsonl` 并保留 `traceId`。
- 日志写入失败时，API 仍返回原始结构化错误。
- 致命任务日志写入失败时，用例仍抛出原始 `VideoAnalysisJobExecutionError`。
- 任务/报告查询仓储异常时，GET 接口仍返回结构化 500，日志失败不能再次遮蔽响应。
- 任务快照损坏或状态无法投影时，GET 任务查询接口必须返回结构化 500，不能返回 `success:true`。
- model-run 查询接口遇到损坏记录时必须返回 `SYSTEM_MODEL_RUN_QUERY_FAILED` 和 500，并写入 `querying_model_runs` 阶段日志；没有记录时返回空成功列表。
- 终态任务重复执行时，用例必须早期拒绝并记录结构化错误。
- 知识检索仓储失败时，上传视频分析任务仍应完成，但必须写入 `SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE` recoverable error，并在报告中展示知识检索失败摘要。
- slice cache 读写失败时，上传视频分析任务仍应完成，但必须写入对应 `SYSTEM_SLICE_UNDERSTANDING_CACHE_*_FAILED` recoverable error，并在 model-run summary 中体现 read/write failure 数量。
- 多模态 provider selection 缺失或被策略拒绝时，上传视频分析任务仍应完成，但必须写入 `SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE` recoverable error，并在 model-run summary 中通过 `runsMissingSelection` 与 `byStage` 体现缺口。
- 前端轮询客户端必须拒绝畸形成功响应；上传资产缺少 `asset.id` 时返回 `SYSTEM_INVALID_ASSET_RESPONSE`，任务进度缺少 `id`、包含未知 `status`、非法 `progressPercent`，或 `isTerminal` 与 `completed/failed` 终态集合不一致时返回 `SYSTEM_INVALID_JOB_PROGRESS`，报告 `jobId` 与当前任务不匹配或报告状态非法时返回 `SYSTEM_INVALID_REPORT_RESPONSE`。不能继续创建空资产任务、轮询空任务 ID、展示未知任务状态、错误拉取未生成报告或展示错配报告。

一句话：错误可以发生，但不能让用户误以为结果来自真实数据。
