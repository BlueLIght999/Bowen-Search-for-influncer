# 博闻 — 测试规范

测试目标：保护热点排名可信度、品类切换稳定性、建议输出可用性。

## 1. 测试分层

| 层级 | 范围 | 工具 |
| --- | --- | --- |
| 单元测试 | ranking、分析规则、知识召回 | Vitest |
| 用例测试 | getHotVideos、generatePlan | Vitest + fake ports |
| API 测试 | `/api/hot-videos` 响应结构 | Vitest/Next test helper |
| UI 冒烟 | 品类切换、Top10 展示、选择范例 | Playwright，后续加入 |

## 2. 当前必须守护的用例

`rankHotVideos`：

- 过滤五天外视频。
- 过滤 10 万播放以下视频。
- 过滤低于同品类增长阈值的视频。
- 按 `growthScore` 降序。
- 最多返回 10 条。

`generatePlan`：

- 输出包含 summary。
- 至少一个差异化方向。
- 每个方向有 outline 和 filmingAdvice。

`retrieveKnowledge`：

- 按品类优先召回。
- 通用策略可兜底。

## 3. 新功能测试要求

新增 Port：

- 必须有 fake 实现用于 application 测试。
- infrastructure adapter 至少有契约测试或 fixture 测试。

新增 API：

- 必须测试成功响应结构。
- 必须测试错误/降级响应。
- `/api/hot-videos` 必须覆盖 live 失败后 `source=fallback + fallbackReason`，以及非法 category/platform 的默认行为。

新增 UI 状态：

- 至少手动验证一次桌面宽度。
- 复杂交互加入 Playwright。

## 4. 覆盖率态度

MVP 不追求形式化覆盖率，优先覆盖高风险逻辑：

- 排名算法。
- 数据源降级。
- 平台字段映射。
- LLM/schema 解析。
- 生成结果结构。
- 前端轮询客户端的任务状态机契约，尤其是 `status`、`progressPercent`、`isTerminal` 和报告 `jobId` 的一致性。

## 5. 执行命令

```bash
npm test
npm run build
```

文档-only 改动可不跑构建，但最终交付需要说明未运行。

## 6. 测试命名

使用业务语言：

```ts
it("keeps only videos published within five days");
it("falls back when live source returns too few videos");
it("refreshes top ten when category changes");
```

一句话：测试先保护“榜单是不是真的可信”，再保护“建议是不是能交付”。
