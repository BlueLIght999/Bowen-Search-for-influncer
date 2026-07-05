# 博闻 — 架构基线

本文是后续开发的基线：所有新功能默认按这里落位，旧代码在改动时顺手向基线靠拢。

## 1. 当前状态

技术栈：

- Next.js + React + TypeScript
- Tailwind CSS
- Vitest
- 本地 fallback 数据 + Bilibili public popular API 尝试抓取

已实现能力：

- 品类切换
- `/api/hot-videos?category=...`
- 近五日快速增长 Top10 排名
- fallback 演示数据
- 文案逻辑分析
- 知识库建议
- 拍摄大纲和差异化方向

主要问题：

- API route 同时负责外部抓取、数据映射、业务降级。
- “同品类基准增长率”目前是单次候选集内估算，没有历史快照。
- 视频详情页文案抓取还没有独立 crawler。
- fallback 数据和 domain 类型混在一起，长期应迁出。

## 2. 目标范式

模块化单体，四层边界：

| 层 | 责任 | 目录 |
| --- | --- | --- |
| domain | 类型、规则、排序、纯分析 | `src/domain`, `src/engine` 中纯函数 |
| application | 用例编排、Port 定义 | `src/application` |
| infrastructure | Bilibili、Playwright、LLM、存储 | `src/infrastructure` |
| interface | UI、API route、响应封装 | `app`, `src/interface` |

## 3. 核心不变量

| 编号 | 不变量 | 所属模块 |
| --- | --- | --- |
| R1 | 品类切换必须刷新对应 Top10 | trends |
| R2 | 热榜候选必须限定近五日 | ranking |
| R3 | 入榜视频播放量必须达到 10 万或配置阈值 | ranking |
| R4 | 增长速度必须显著高于同品类基准 | ranking |
| R5 | 每条结果必须有可打开链接和增长理由 | trends |
| R6 | live 抓取失败必须降级 fallback，不能中断演示 | resilience |
| R7 | fallback 来源必须显式暴露 | trust |
| R8 | 建议输出必须能指导当天拍摄 | planning |

## 4. 近期目标

P0：稳定当前 MVP

- 修正编码/文案显示问题。
- 保证测试和构建通过。
- API 返回结构固定。

P1：拆出真实抓取能力

- 新增 `TrendSourcePort`。
- Bilibili popular/search 作为一个 adapter。
- fallback 作为另一个 adapter。
- API route 只调用 use case。

P2：增加快照存储

- 本地 JSON 或 SQLite 保存每日/每次抓取结果。
- 计算同品类历史增长基准。
- 支持“5 天内从低位快速涨到 10 万+”的真实判断。

P3：增加视频详情解析

- Playwright 抓标题、简介、标签、评论摘要、页面可见文本。
- 能解析视频页公开元信息。
- 文案分析从 fallback 文本升级为真实页面内容。

P4：LLM 与知识库升级

- 将规则分析替换为可配置 LLM adapter。
- 知识库支持结构化条目、向量或关键词召回。

## 5. 验收基线

每次重要改动至少满足：

- `npm test` 通过。
- `npm run build` 通过，除非本轮明确只改文档。
- 品类切换后 UI 展示 Top10。
- `/api/hot-videos?category=AI科技` 返回 `videos.length <= 10`，且包含 `source`。
- 排名算法测试覆盖近五日、10 万播放、增长倍数过滤。

一句话：先让本地演示可信，再把每个 mock/估算点替换成可追踪的真实数据能力。
