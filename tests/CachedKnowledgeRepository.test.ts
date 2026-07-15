import { describe, expect, it, vi } from "vitest";
import { CachedKnowledgeRepository } from "../src/infrastructure/knowledge/CachedKnowledgeRepository";
import type { KnowledgeRepositoryPort, KnowledgeQuery } from "../src/application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge } from "../src/domain/types";

function makeMockRepo(results: RetrievedKnowledge[]): KnowledgeRepositoryPort {
  const retrieve = vi.fn(async () => [...results]);
  return { retrieve };
}

function makeQuery(overrides: Partial<KnowledgeQuery> = {}): KnowledgeQuery {
  return {
    category: "AI科技",
    hotspot: "AI工具",
    creatorPositioning: "AI评测",
    sampleText: "反常识钩子",
    commentSignals: "",
    ...overrides
  };
}

describe("CachedKnowledgeRepository — LRU 召回缓存", () => {
  it("首次查询调用底层 retrieve，第二次命中缓存不调用", async () => {
    const results: RetrievedKnowledge[] = [
      { item: { id: "a", category: "通用", title: "A", strategy: "...", appliesWhen: [] }, score: 1, matchReasons: [] }
    ];
    const inner = makeMockRepo(results);
    const cached = new CachedKnowledgeRepository(inner, { maxSize: 100 });

    const q = makeQuery();
    const r1 = await cached.retrieve(q);
    const r2 = await cached.retrieve(q);

    expect(r1).toEqual(results);
    expect(r2).toEqual(results);
    expect(inner.retrieve).toHaveBeenCalledTimes(1);
  });

  it("不同查询各自调用一次底层 retrieve", async () => {
    const inner = makeMockRepo([]);
    const cached = new CachedKnowledgeRepository(inner);

    await cached.retrieve(makeQuery({ sampleText: "A" }));
    await cached.retrieve(makeQuery({ sampleText: "B" }));
    await cached.retrieve(makeQuery({ sampleText: "A" }));

    expect(inner.retrieve).toHaveBeenCalledTimes(2);
  });

  it("dimension 不同的查询分别缓存", async () => {
    const inner = makeMockRepo([]);
    const cached = new CachedKnowledgeRepository(inner);

    await cached.retrieve(makeQuery({ dimension: "hookStrength" }));
    await cached.retrieve(makeQuery({ dimension: "scriptQuality" }));
    await cached.retrieve(makeQuery({ dimension: "hookStrength" }));

    expect(inner.retrieve).toHaveBeenCalledTimes(2);
  });

  it("LRU 淘汰：超过 maxSize 时淘汰最久未使用的", async () => {
    const inner = makeMockRepo([]);
    const cached = new CachedKnowledgeRepository(inner, { maxSize: 3 });

    await cached.retrieve(makeQuery({ sampleText: "1" }));
    await cached.retrieve(makeQuery({ sampleText: "2" }));
    await cached.retrieve(makeQuery({ sampleText: "3" }));
    // 访问 "1" 使其成为最近使用
    await cached.retrieve(makeQuery({ sampleText: "1" }));
    // 插入 "4"，应淘汰 "2"（最久未使用）
    await cached.retrieve(makeQuery({ sampleText: "4" }));
    // "2" 不在缓存中，应再次调用底层
    await cached.retrieve(makeQuery({ sampleText: "2" }));

    expect(inner.retrieve).toHaveBeenCalledTimes(5);
  });

  it("缓存命中时返回结果的副本而非引用", async () => {
    const results: RetrievedKnowledge[] = [
      { item: { id: "a", category: "通用", title: "A", strategy: "...", appliesWhen: [] }, score: 1, matchReasons: [] }
    ];
    const inner = makeMockRepo(results);
    const cached = new CachedKnowledgeRepository(inner);

    const r1 = await cached.retrieve(makeQuery());
    r1[0].score = 999;

    const r2 = await cached.retrieve(makeQuery());
    expect(r2[0].score).toBe(1);
  });

  it("空结果也缓存（避免重复查询空结果）", async () => {
    const inner = makeMockRepo([]);
    const cached = new CachedKnowledgeRepository(inner);

    await cached.retrieve(makeQuery());
    await cached.retrieve(makeQuery());

    expect(inner.retrieve).toHaveBeenCalledTimes(1);
  });

  it("缓存统计：getStats 返回 hits / misses / size", async () => {
    const inner = makeMockRepo([]);
    const cached = new CachedKnowledgeRepository(inner, { maxSize: 10 });

    await cached.retrieve(makeQuery({ sampleText: "A" }));
    await cached.retrieve(makeQuery({ sampleText: "A" })); // hit
    await cached.retrieve(makeQuery({ sampleText: "B" }));

    const stats = cached.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.size).toBe(2);
  });
});
