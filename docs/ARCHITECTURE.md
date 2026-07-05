# 博闻 — 四层架构规范

本文定义博闻后续开发的目标架构。当前项目是单体 Next.js 本地 MVP，后续仍保持模块化单体：先把热点发现、视频抓取、文案分析、拍摄建议跑通，再逐步替换真实数据源、LLM、多模态解析和持久化。

## 1. 架构原则

依赖只能向内：

```text
interface      Next.js pages, API routes, UI adapters
infrastructure live APIs, crawlers, storage, LLM clients
application    use cases, orchestration, ports
domain         business types, ranking, analysis rules, invariants
```

关键规则：

- `domain` 只放纯业务类型、规则、算法，不访问网络、文件、数据库、环境变量。
- `application` 编排业务流程，只依赖 `domain` 和 `ports`。
- `infrastructure` 实现外部能力，例如 Bilibili 抓取、Playwright 页面抓取、LLM 调用、缓存。
- `interface` 负责协议和展示，例如 `app/page.tsx`、`app/api/*/route.ts`。
- 跨层传递稳定 DTO 或 domain 对象，不把第三方 API 原始字段直接传到 UI。

## 2. 当前代码归层

| 文件 | 当前层 | 说明 |
| --- | --- | --- |
| `src/domain/types.ts` | domain | 核心类型，后续应补齐 DTO 边界 |
| `src/domain/categories.ts` | domain | 品类枚举与关键词 |
| `src/domain/fallbackVideos.ts` | domain/data | 本地演示兜底数据，后续迁到 infrastructure fixture |
| `src/engine/rankHotVideos.ts` | domain/application 边界 | 热榜排序核心算法，保持纯函数 |
| `src/engine/analyzeSample.ts` | domain/application 边界 | 样本文案分析规则 |
| `src/engine/retrieveKnowledge.ts` | application | 知识召回编排 |
| `src/engine/generatePlan.ts` | application | 建议生成编排 |
| `src/knowledge/bowenStrategies.ts` | domain/data | 内置知识库 |
| `app/api/hot-videos/route.ts` | interface | 已退化为薄 route，调用 `getHotVideos` |
| `app/api/generate-plan/route.ts` | interface | 前端生成建议的 HTTP 边界 |
| `app/page.tsx` | interface | UI 状态、交互和结果展示 |

## 3. MVP 主链路

```text
用户选择品类
  -> 获取该品类近五日候选视频
  -> 计算快速增长 Top10
  -> 用户选择范例视频
  -> 解析标题/简介/文案结构/评论信号
  -> 召回知识库策略
  -> 输出爆点策略、差异化建议、拍摄大纲
```

当前必须保留的产品行为：

- 品类切换后 Top10 必须重新计算。
- 热榜只关注近五日内快速达到 10 万播放、显著高于同品类增长率的视频。
- 每个范例必须有可点击视频链接。
- 输出必须包含文案逻辑、拍摄场景/镜头建议、爆点策略、差异化方向。

## 4. 近期重构方向

优先拆分 `app/api/hot-videos/route.ts`：

```text
application/useCases/getHotVideos.ts
application/ports/TrendSourcePort.ts
infrastructure/trends/BilibiliPopularTrendSource.ts
infrastructure/trends/FallbackTrendSource.ts
interface/http/hotVideosRoute.ts
```

第二步增加视频详情抓取：

```text
application/useCases/analyzeVideoReference.ts
application/ports/VideoDetailCrawlerPort.ts
infrastructure/crawler/PlaywrightVideoDetailCrawler.ts
domain/video/copyExtractor.ts
```

第三步再接 LLM：

```text
application/ports/CopyAnalysisPort.ts
infrastructure/llm/OpenAICompatibleCopyAnalysis.ts
```

## 5. 架构红线

- UI 不直接知道 Bilibili 原始字段，如 `bvid`、`stat.view`、`owner.name`。
- 排名算法不访问网络。
- API route 不承载复杂业务规则，只做参数解析、调用 use case、响应封装。
- fallback 数据必须明确标记来源，不能伪装成实时数据。
- 抓取失败必须可降级，但响应里要保留 `source` 和可读原因。

一句话：博闻保持单体，但代码按领域边界生长，让“抓取、排序、分析、建议”可以独立替换。
