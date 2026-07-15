import { describe, expect, it, vi } from "vitest";
import { VectorKnowledgeRepository } from "../src/infrastructure/knowledge/VectorKnowledgeRepository";
import type { EmbeddingPort } from "../src/application/ports/EmbeddingPort";
import type { VectorStorePort, VectorEntry, VectorQueryResult, VectorFilter } from "../src/application/ports/VectorStorePort";
import type { KnowledgeItem, RetrievedKnowledge } from "../src/domain/types";

// --- Mock EmbeddingPort ---
function makeMockEmbedder(vectors: Record<string, number[]> = {}): EmbeddingPort {
  return {
    model: "mock-model",
    dimension: 3,
    embed: vi.fn(async (texts: string[]) => texts.map((t) => vectors[t] ?? [0.1, 0.2, 0.3])),
    embedQuery: vi.fn(async (text: string) => vectors[text] ?? [0.1, 0.2, 0.3])
  };
}

// --- Mock VectorStorePort ---
function makeMockVectorStore(
  queryResults: VectorQueryResult[] = [],
  entries: Map<string, KnowledgeItem> = new Map()
): VectorStorePort {
  return {
    collectionName: "bowen-knowledge",
    upsert: vi.fn(async (_entries: VectorEntry[]) => {}),
    query: vi.fn(async (_vector: number[], _topK: number, _filter?: VectorFilter) => queryResults),
    delete: vi.fn(async (_ids: string[]) => {}),
    count: vi.fn(async () => entries.size)
  };
}

// --- 构造测试知识条目 ---
const strategyItems: KnowledgeItem[] = [
  { id: "hook-001", category: "通用", title: "反常识开头钩子", strategy: "开场3秒内出现与常识相悖的论断", appliesWhen: ["反常识", "开场", "钩子"] },
  { id: "hook-002", category: "通用", title: "冲突式开头", strategy: "用利益冲突制造悬念", appliesWhen: ["冲突", "开场"] },
  { id: "script-001", category: "通用", title: "三段式递进脚本", strategy: "起承转合结构", appliesWhen: ["脚本", "结构"] },
  { id: "scene-001", category: "AI科技", title: "证据特写分镜", strategy: "用数据截图做证据", appliesWhen: ["分镜", "证据"] }
];

const strategyMap = new Map(strategyItems.map((s) => [s.id, s]));

describe("VectorKnowledgeRepository", () => {
  it("实现 KnowledgeRepositoryPort 接口", () => {
    const repo = new VectorKnowledgeRepository(
      makeMockEmbedder(),
      makeMockVectorStore([], strategyMap),
      strategyItems
    );

    expect(repo.retrieve).toBeDefined();
    expect(typeof repo.retrieve).toBe("function");
  });

  it("检索流程：query 文本 → embed → vector query → 包装为 RetrievedKnowledge", async () => {
    const embedder = makeMockEmbedder({ "AI工具真假判断": [0.9, 0.1, 0.0] });
    const vectorStore = makeMockVectorStore(
      [
        { id: "hook-001", score: 0.92, metadata: { title: "反常识开头钩子", category: "通用", type: "hook_strategy" } },
        { id: "hook-002", score: 0.85, metadata: { title: "冲突式开头", category: "通用", type: "hook_strategy" } }
      ],
      strategyMap
    );

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具真假判断",
      creatorPositioning: "面向普通人的AI工具评测",
      sampleText: "如何验证AI搜索答案真假并避免工具误导",
      commentSignals: "普通人怎么看真假"
    });

    expect(results).toHaveLength(2);
    expect(results[0].item.id).toBe("hook-001");
    expect(results[0].score).toBeGreaterThan(0.5);
    expect(results[0].matchReasons).toContain("semantic-similarity: 0.92");
  });

  it("向量召回 + 关键词混合 rerank：先向量 top-10，再关键词 rerank 取 top-4", async () => {
    const embedder = makeMockEmbedder();
    // 模拟向量召回 5 条，但只有 2 条匹配关键词
    const vectorResults: VectorQueryResult[] = [
      { id: "hook-001", score: 0.90, metadata: { title: "反常识开头", category: "通用", type: "hook_strategy" } },
      { id: "script-001", score: 0.85, metadata: { title: "三段式脚本", category: "通用", type: "script_structure" } },
      { id: "scene-001", score: 0.80, metadata: { title: "证据特写", category: "AI科技", type: "scene_design" } },
      { id: "hook-002", score: 0.75, metadata: { title: "冲突开头", category: "通用", type: "hook_strategy" } },
      { id: "hook-003", score: 0.70, metadata: { title: "悬念开头", category: "通用", type: "hook_strategy" } }
    ];
    const vectorStore = makeMockVectorStore(vectorResults, strategyMap);

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具真假判断",
      creatorPositioning: "AI评测",
      sampleText: "反常识的开场钩子如何验证真假",
      commentSignals: ""
    });

    // 混合 rerank 后，匹配关键词的条目应该排前面
    expect(results.length).toBeLessThanOrEqual(4);
    // hook-001 同时有向量高分和关键词匹配，应排第一
    expect(results[0].item.id).toBe("hook-001");
    // matchReasons 应同时包含 semantic-similarity 和 keyword
    expect(results[0].matchReasons.some((r) => r.startsWith("semantic-similarity"))).toBe(true);
    expect(results[0].matchReasons.some((r) => r.startsWith("keyword"))).toBe(true);
  });

  it("向量服务不可用时降级到关键词检索", async () => {
    const embedder: EmbeddingPort = {
      model: "fallback",
      dimension: 384,
      embed: vi.fn(async () => { throw new Error("service unavailable"); }),
      embedQuery: vi.fn(async () => { throw new Error("service unavailable"); })
    };
    const vectorStore = makeMockVectorStore([], strategyMap);

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI创作者",
      sampleText: "反常识的开场钩子",
      commentSignals: ""
    });

    // 降级到关键词：至少匹配到含"反常识"和"钩子"的条目
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchReasons.some((r) => r.startsWith("keyword"))).toBe(true);
    expect(results[0].matchReasons.some((r) => r.startsWith("fallback"))).toBe(true);
  });

  it("空查询返回空数组", async () => {
    const embedder = makeMockEmbedder();
    const vectorStore = makeMockVectorStore([], strategyMap);

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "",
      creatorPositioning: "",
      sampleText: "",
      commentSignals: ""
    });

    expect(results).toEqual([]);
  });

  it("向量结果中找不到对应知识条目时跳过该结果", async () => {
    const embedder = makeMockEmbedder();
    const vectorStore = makeMockVectorStore(
      [
        { id: "unknown-id", score: 0.99, metadata: { title: "未知", category: "通用", type: "hook_strategy" } },
        { id: "hook-001", score: 0.85, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } }
      ],
      strategyMap
    );

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识钩子",
      commentSignals: ""
    });

    // unknown-id 应被跳过
    expect(results.every((r) => r.item.id !== "unknown-id")).toBe(true);
    expect(results.some((r) => r.item.id === "hook-001")).toBe(true);
  });

  it("结果按综合得分降序排列", async () => {
    const embedder = makeMockEmbedder();
    const vectorResults: VectorQueryResult[] = [
      { id: "script-001", score: 0.60, metadata: { title: "脚本", category: "通用", type: "script_structure" } },
      { id: "hook-001", score: 0.95, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } },
      { id: "scene-001", score: 0.70, metadata: { title: "分镜", category: "AI科技", type: "scene_design" } }
    ];
    const vectorStore = makeMockVectorStore(vectorResults, strategyMap);

    const repo = new VectorKnowledgeRepository(embedder, vectorStore, strategyItems);
    const results = await repo.retrieve({
      category: "AI科技",
      hotspot: "AI工具",
      creatorPositioning: "AI",
      sampleText: "反常识钩子分镜",
      commentSignals: ""
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});
