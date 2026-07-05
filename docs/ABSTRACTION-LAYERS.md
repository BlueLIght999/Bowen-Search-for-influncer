# 博闻 — 抽象层规范

本文定义哪些能力必须通过 Port 隔离，防止后续真实抓取、LLM 和存储接入后污染业务逻辑。

## 1. 模型分层

| 模型 | 所在层 | 示例 | 规则 |
| --- | --- | --- | --- |
| 外部原始模型 | infrastructure | Bilibili API item | 不进入 UI，不进入 domain |
| Domain 模型 | domain | `VideoTrend`, `SampleAnalysis` | 稳定业务语言 |
| DTO | application/interface | API response | 面向前端契约 |
| ViewModel | interface | 页面状态 | 只服务展示 |

禁止：

- 前端读取 `stat.view`、`owner.name`、`bvid` 等平台原始字段。
- ranking 函数依赖 Bilibili 字段。
- LLM 返回 JSON 未校验就进入 UI。

## 2. Repository 抽象

MVP 暂不强制数据库，但一旦需要历史快照，必须走 Repository。

```ts
export interface TrendSnapshotRepository {
  saveSnapshot(snapshot: TrendSnapshot): Promise<void>;
  listRecentSnapshots(category: Category, days: number): Promise<TrendSnapshot[]>;
}
```

用途：

- 记录每次抓取的视频播放、互动、发布时间。
- 计算真实同品类增长基准。
- 判断是否“快速达到 10 万播放”。

## 3. 外部能力抽象

### TrendSourcePort

```ts
export interface TrendSourcePort {
  fetchCandidates(category: Category): Promise<VideoTrend[]>;
}
```

实现：

- `BilibiliPopularTrendSource`
- `BilibiliSearchTrendSource`
- `FallbackTrendSource`

### VideoDetailCrawlerPort

```ts
export interface VideoDetailCrawlerPort {
  fetchDetail(url: string): Promise<VideoDetail>;
}
```

实现：

- `PlaywrightVideoDetailCrawler`
- `StaticVideoDetailCrawler` for tests

### CopyAnalysisPort

```ts
export interface CopyAnalysisPort {
  analyze(input: CopyAnalysisInput): Promise<SampleAnalysis>;
}
```

实现：

- `RuleBasedCopyAnalysis`
- `OpenAICompatibleCopyAnalysis`

### KnowledgeRepositoryPort

```ts
export interface KnowledgeRepositoryPort {
  retrieve(input: KnowledgeQuery): Promise<KnowledgeItem[]>;
}
```

实现：

- `StaticKnowledgeRepository`
- future vector store

## 4. 中间件抽象

以下能力不得出现在 domain：

- `fetch`
- `fs`
- Playwright
- OpenAI/LLM SDK
- 环境变量读取
- Next.js `Request`/`NextResponse`

## 5. 落地顺序

1. 先抽 `TrendSourcePort`，因为它直接影响热榜可信度。
2. 再抽 `VideoDetailCrawlerPort`，支撑真实文案解析。
3. 再抽 `CopyAnalysisPort`，方便规则和 LLM 切换。
4. 最后抽存储 Repository，支撑历史快照。

一句话：外部世界都包成 Port，博闻自己的业务模型保持干净。
