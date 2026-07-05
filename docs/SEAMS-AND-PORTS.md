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

一句话：Port 的目标是让真实抓取、历史数据、LLM 和知识库都能替换，而 UI 和排序规则不跟着震荡。
