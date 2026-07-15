import { describe, expect, it, vi } from "vitest";
import { VectorKnowledgeRepository } from "../src/infrastructure/knowledge/VectorKnowledgeRepository";
import type { EmbeddingPort } from "../src/application/ports/EmbeddingPort";
import type { VectorStorePort, VectorQueryResult } from "../src/application/ports/VectorStorePort";
import type { KnowledgeItem } from "../src/domain/types";

function makeMockEmbedder(): EmbeddingPort {
  return {
    model: "mock",
    dimension: 3,
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    embedQuery: vi.fn(async () => [0.1, 0.2, 0.3])
  };
}

function makeMockVectorStore(results: VectorQueryResult[]): VectorStorePort {
  return {
    collectionName: "test",
    upsert: vi.fn(async () => {}),
    query: vi.fn(async () => results),
    delete: vi.fn(async () => {}),
    count: vi.fn(async () => 0)
  };
}

const strategies: KnowledgeItem[] = [
  { id: "hook-001", category: "通用", title: "反常识", strategy: "...", appliesWhen: ["反常识"], type: "hook_strategy", dimension: "hookStrength", source: "local-markdown", version: "1.0.0" }
];

describe("P3-#24: 知识来源审计 — retrievalLatencyMs", () => {
  it("向量检索结果 matchReasons 包含 retrieval-path: vector", async () => {
    const repo = new VectorKnowledgeRepository(
      makeMockEmbedder(),
      makeMockVectorStore([
        { id: "hook-001", score: 0.9, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } }
      ]),
      strategies
    );

    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识钩子",
      commentSignals: ""
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchReasons.some((r) => r.startsWith("retrieval-path:"))).toBe(true);
    expect(results[0].matchReasons.some((r) => r.includes("vector"))).toBe(true);
  });

  it("关键词回退结果 matchReasons 包含 retrieval-path: keyword-fallback", async () => {
    const embedder: EmbeddingPort = {
      model: "fallback",
      dimension: 384,
      embed: vi.fn(async () => { throw new Error("unavailable"); }),
      embedQuery: vi.fn(async () => { throw new Error("unavailable"); })
    };

    const repo = new VectorKnowledgeRepository(embedder, makeMockVectorStore([]), strategies);

    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识",
      commentSignals: ""
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchReasons.some((r) => r.includes("keyword-fallback"))).toBe(true);
  });

  it("每条结果的 matchReasons 包含 retrieval-latency-ms: <number>", async () => {
    const repo = new VectorKnowledgeRepository(
      makeMockEmbedder(),
      makeMockVectorStore([
        { id: "hook-001", score: 0.9, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } }
      ]),
      strategies
    );

    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识",
      commentSignals: ""
    });

    expect(results.length).toBeGreaterThan(0);
    const latencyReason = results[0].matchReasons.find((r) => r.startsWith("retrieval-latency-ms:"));
    expect(latencyReason).toBeDefined();
    const ms = parseInt(latencyReason!.split(":")[1].trim());
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
