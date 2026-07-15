import { describe, expect, it, vi } from "vitest";
import { VectorKnowledgeRepository } from "../src/infrastructure/knowledge/VectorKnowledgeRepository";
import type { EmbeddingPort } from "../src/application/ports/EmbeddingPort";
import type { VectorStorePort, VectorQueryResult, VectorEntry, VectorFilter } from "../src/application/ports/VectorStorePort";
import type { KnowledgeItem, RetrievedKnowledge } from "../src/domain/types";

function makeMockEmbedder(): EmbeddingPort {
  return {
    model: "mock-model",
    dimension: 3,
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    embedQuery: vi.fn(async () => [0.1, 0.2, 0.3])
  };
}

function makeMockVectorStore(queryResults: VectorQueryResult[]): VectorStorePort {
  return {
    collectionName: "bowen-knowledge",
    upsert: vi.fn(async () => {}),
    query: vi.fn(async (_vector: number[], _topK: number, _filter?: VectorFilter) => queryResults),
    delete: vi.fn(async () => {}),
    count: vi.fn(async () => 0)
  };
}

const strategiesByDimension: KnowledgeItem[] = [
  { id: "hook-001", category: "通用", title: "反常识钩子", strategy: "...", appliesWhen: ["反常识"], type: "hook_strategy", dimension: "hookStrength" },
  { id: "hook-002", category: "通用", title: "冲突钩子", strategy: "...", appliesWhen: ["冲突"], type: "hook_strategy", dimension: "hookStrength" },
  { id: "script-001", category: "通用", title: "三段脚本", strategy: "...", appliesWhen: ["脚本"], type: "script_structure", dimension: "scriptQuality" },
  { id: "scene-001", category: "通用", title: "证据特写", strategy: "...", appliesWhen: ["分镜"], type: "scene_design", dimension: "sceneDesign" },
  { id: "aesthetic-001", category: "通用", title: "字幕可读性", strategy: "...", appliesWhen: ["字幕"], type: "aesthetic_rule", dimension: "aestheticExperience" }
];

const strategyMap = new Map(strategiesByDimension.map((s) => [s.id, s]));

describe("分桶召回 — dimension 过滤", () => {
  it("query 带 dimension 时只召回该维度的知识", async () => {
    const vectorResults: VectorQueryResult[] = [
      { id: "hook-001", score: 0.92, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } },
      { id: "script-001", score: 0.88, metadata: { title: "脚本", category: "通用", type: "script_structure" } },
      { id: "scene-001", score: 0.85, metadata: { title: "分镜", category: "通用", type: "scene_design" } }
    ];

    const vectorStore = makeMockVectorStore(vectorResults);
    const embedder = makeMockEmbedder();

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategiesByDimension);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI评测",
      sampleText: "反常识钩子",
      commentSignals: "",
      dimension: "hookStrength"
    });

    // 只应返回 dimension=hookStrength 的条目
    expect(results.every((r) => r.item.dimension === "hookStrength")).toBe(true);
    expect(results.some((r) => r.item.id === "hook-001")).toBe(true);
    expect(results.every((r) => r.item.id !== "script-001")).toBe(true);
    expect(results.every((r) => r.item.id !== "scene-001")).toBe(true);
  });

  it("query 带 dimension 时向 VectorStore 传递 filter", async () => {
    const vectorStore = makeMockVectorStore([]);
    const embedder = makeMockEmbedder();

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategiesByDimension);
    await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "分镜证据",
      commentSignals: "",
      dimension: "sceneDesign"
    });

    // 验证 vectorStore.query 被调用时传了 filter
    const queryMock = vectorStore.query as ReturnType<typeof vi.fn>;
    expect(queryMock).toHaveBeenCalled();
    const callArgs = queryMock.mock.calls[0];
    // 第三个参数是 filter
    expect(callArgs[2]).toEqual({ dimension: "sceneDesign" });
  });

  it("query 不带 dimension 时不过滤，返回所有维度的结果", async () => {
    const vectorResults: VectorQueryResult[] = [
      { id: "hook-001", score: 0.92, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } },
      { id: "script-001", score: 0.85, metadata: { title: "脚本", category: "通用", type: "script_structure" } }
    ];

    const vectorStore = makeMockVectorStore(vectorResults);
    const embedder = makeMockEmbedder();

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategiesByDimension);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "钩子脚本",
      commentSignals: ""
    });

    // 不带 dimension 时应返回所有维度的结果
    const dimensions = new Set(results.map((r) => r.item.dimension));
    expect(dimensions.size).toBeGreaterThan(1);
  });

  it("分桶模式下同一维度返回多条，不被其他维度截断", async () => {
    // 向量召回 8 条，其中 5 条是 hookStrength 维度
    const vectorResults: VectorQueryResult[] = [
      { id: "hook-001", score: 0.95, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } },
      { id: "hook-002", score: 0.90, metadata: { title: "冲突", category: "通用", type: "hook_strategy" } },
      { id: "script-001", score: 0.88, metadata: { title: "脚本", category: "通用", type: "script_structure" } },
      { id: "scene-001", score: 0.85, metadata: { title: "分镜", category: "通用", type: "scene_design" } },
      { id: "aesthetic-001", score: 0.82, metadata: { title: "字幕", category: "通用", type: "aesthetic_rule" } }
    ];

    const vectorStore = makeMockVectorStore(vectorResults);
    const embedder = makeMockEmbedder();

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategiesByDimension);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "钩子反常识冲突",
      commentSignals: "",
      dimension: "hookStrength"
    });

    // 应该返回 2 条 hookStrength 的结果（而不是被 top-4 截断后只剩 1 条）
    const hookResults = results.filter((r) => r.item.dimension === "hookStrength");
    expect(hookResults.length).toBe(2);
  });

  it("dimension 过滤也应用于关键词回退模式", async () => {
    const embedder: EmbeddingPort = {
      model: "fallback",
      dimension: 384,
      embed: vi.fn(async () => { throw new Error("unavailable"); }),
      embedQuery: vi.fn(async () => { throw new Error("unavailable"); })
    };
    const vectorStore = makeMockVectorStore([]);

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategiesByDimension);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识钩子",
      commentSignals: "",
      dimension: "hookStrength"
    });

    // 降级到关键词模式后也应只返回 hookStrength 维度的条目
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.item.dimension === "hookStrength")).toBe(true);
  });
});
