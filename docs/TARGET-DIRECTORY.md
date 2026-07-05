# 博闻 — 目标目录

当前项目已经有 `app`、`src/domain`、`src/engine`、`src/knowledge`。后续不做大爆炸迁移，采用渐进式目录演进。

## 1. 目标目录树

```text
bowen-search/
  app/
    api/
      hot-videos/
        route.ts
    page.tsx
    layout.tsx
    globals.css

  src/
    domain/
      categories.ts
      types.ts
      video/
        ranking.ts
        copySignals.ts

    application/
      ports/
        TrendSourcePort.ts
        VideoDetailCrawlerPort.ts
        KnowledgeRepositoryPort.ts
        CopyAnalysisPort.ts
      useCases/
        getHotVideos.ts
        analyzeVideoReference.ts
        generateCreatorPlan.ts

    infrastructure/
      trends/
        BilibiliPopularTrendSource.ts
        FallbackTrendSource.ts
      crawler/
        PlaywrightVideoDetailCrawler.ts
      storage/
        JsonTrendSnapshotStore.ts
      llm/
        OpenAICompatibleCopyAnalysis.ts
      knowledge/
        StaticKnowledgeRepository.ts

    engine/
      rankHotVideos.ts
      analyzeSample.ts
      retrieveKnowledge.ts
      generatePlan.ts

    knowledge/
      bowenStrategies.ts

    interface/
      http/
        response.ts
        errors.ts

  tests/
    engine.test.ts
    application/
    infrastructure/

  docs/
```

## 2. 当前文件迁移对照

| 当前文件 | 目标位置 | 时机 |
| --- | --- | --- |
| `src/engine/rankHotVideos.ts` | `src/domain/video/ranking.ts` 或保留 engine | P1，先保证测试 |
| `src/domain/fallbackVideos.ts` | `src/infrastructure/trends/FallbackTrendSource.ts` | P1 |
| `app/api/hot-videos/route.ts` | route + `getHotVideos` + TrendSource adapter | P1 |
| `src/engine/analyzeSample.ts` | `src/application/useCases/analyzeVideoReference.ts` 的规则实现 | P2 |
| `src/engine/retrieveKnowledge.ts` | `StaticKnowledgeRepository` + use case | P2 |
| `src/knowledge/bowenStrategies.ts` | 继续保留，作为静态知识源 | 当前 |
| `app/page.tsx` | 可拆组件到 `src/interface/components` | UI 复杂后 |

## 3. 命名规范

- domain 类型使用 PascalCase：`VideoTrend`, `GrowthBenchmark`。
- use case 使用动词短语：`getHotVideos`, `generateCreatorPlan`。
- Port 以能力命名：`TrendSourcePort`。
- Adapter 以来源命名：`BilibiliPopularTrendSource`。
- 测试文件与被测能力同名：`rankHotVideos.test.ts`。

## 4. 迁移顺序

1. 新建 `src/application/ports/TrendSourcePort.ts`。
2. 将 fallback 数据封装为 `FallbackTrendSource`。
3. 将 Bilibili fetch 封装为 `BilibiliPopularTrendSource`。
4. 新建 `getHotVideos` use case，集中处理 live/fallback 降级。
5. API route 改为薄入口。
6. 增加历史快照存储。
7. 增加 Playwright 视频详情抓取。

## 5. 保留策略

`src/engine` 暂时可以保留，因为它已经承载纯函数分析能力。后续只有在模块变大时再迁移到 `domain` 或 `application`，不为了目录纯粹而重构。

一句话：目录演进服务于产品验证，先拆最痛的 API 混层，再拆分析与抓取。
