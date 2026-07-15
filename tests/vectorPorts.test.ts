import { describe, expect, it } from "vitest";
import type { EmbeddingPort } from "../src/application/ports/EmbeddingPort";
import type { VectorStorePort, VectorEntry, VectorQueryResult, VectorFilter } from "../src/application/ports/VectorStorePort";
import type { KnowledgeItem } from "../src/domain/types";

/**
 * P0 向量数据库端口契约测试
 *
 * 验证端口接口定义存在、类型签名正确、不依赖具体实现。
 * 这些测试在端口定义文件创建前必须失败（Red）。
 */

describe("EmbeddingPort 契约", () => {
  it("定义 embed 批量嵌入方法", () => {
    const mock: EmbeddingPort = {
      embed: async (_texts: string[]) => [[0.1, 0.2, 0.3]],
      embedQuery: async (_text: string) => [0.1, 0.2, 0.3],
      model: "test-model",
      dimension: 3
    };

    expect(mock.embed).toBeDefined();
    expect(mock.embedQuery).toBeDefined();
    expect(mock.model).toBe("test-model");
    expect(mock.dimension).toBe(3);
  });

  it("embed 返回的向量数量与输入文本数量一致", async () => {
    const mock: EmbeddingPort = {
      embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
      embedQuery: async () => [0.1, 0.2, 0.3],
      model: "test-model",
      dimension: 3
    };

    const texts = ["第一段文本", "第二段文本", "第三段文本"];
    const vectors = await mock.embed(texts);

    expect(vectors).toHaveLength(texts.length);
    expect(vectors[0]).toHaveLength(3);
  });

  it("embedQuery 返回单个向量", async () => {
    const mock: EmbeddingPort = {
      embed: async () => [[0.1]],
      embedQuery: async () => [0.1, 0.2, 0.3],
      model: "test-model",
      dimension: 3
    };

    const vector = await mock.embedQuery("测试查询");
    expect(vector).toHaveLength(3);
  });
});

describe("VectorStorePort 契约", () => {
  it("定义 upsert / query / delete 方法", () => {
    const mock: VectorStorePort = {
      upsert: async (_entries: VectorEntry[]) => {},
      query: async (_vector: number[], _topK: number) => [],
      delete: async (_ids: string[]) => {},
      count: async () => 0,
      collectionName: "bowen-knowledge"
    };

    expect(mock.upsert).toBeDefined();
    expect(mock.query).toBeDefined();
    expect(mock.delete).toBeDefined();
    expect(mock.count).toBeDefined();
    expect(mock.collectionName).toBe("bowen-knowledge");
  });

  it("query 返回 VectorQueryResult 数组含 id/score/metadata", async () => {
    const mock: VectorStorePort = {
      upsert: async () => {},
      query: async (_vector: number[], topK: number) => {
        const results: VectorQueryResult[] = Array.from({ length: topK }, (_, i) => ({
          id: `item-${i}`,
          score: 0.9 - i * 0.1,
          metadata: {
            title: `测试条目 ${i}`,
            category: "通用",
            type: "hook_strategy" as const
          }
        }));
        return results;
      },
      delete: async () => {},
      count: async () => 42,
      collectionName: "bowen-knowledge"
    };

    const results = await mock.query([0.1, 0.2], 3);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("item-0");
    expect(results[0].score).toBe(0.9);
    expect(results[0].metadata.title).toBe("测试条目 0");
    expect(results[0].metadata.type).toBe("hook_strategy");
  });

  it("VectorFilter 支持 dimension 和 category 过滤", () => {
    const filter: VectorFilter = {
      dimension: "hookStrength",
      category: "AI科技"
    };

    expect(filter.dimension).toBe("hookStrength");
    expect(filter.category).toBe("AI科技");
  });

  it("VectorEntry 包含 id / vector / metadata / text", () => {
    const entry: VectorEntry = {
      id: "hook-001",
      vector: [0.1, 0.2, 0.3],
      text: "反常识开头钩子策略",
      metadata: {
        title: "反常识开头",
        category: "通用",
        type: "hook_strategy",
        dimension: "hookStrength",
        tags: ["开场", "反常识"],
        source: "local-markdown",
        version: "1.0.0"
      }
    };

    expect(entry.id).toBe("hook-001");
    expect(entry.vector).toHaveLength(3);
    expect(entry.text).toBe("反常识开头钩子策略");
    expect(entry.metadata.type).toBe("hook_strategy");
    expect(entry.metadata.dimension).toBe("hookStrength");
  });
});

describe("KnowledgeItem 类型扩展", () => {
  it("原有字段保持兼容", () => {
    const item: KnowledgeItem = {
      id: "opposite-turn",
      category: "通用",
      title: "对立翻转",
      strategy: "把大众都在讲的正向结论翻到反面",
      appliesWhen: ["同质化", "热点"]
    };

    expect(item.id).toBe("opposite-turn");
    expect(item.category).toBe("通用");
  });

  it("新增可选字段 type / dimension / tags / source / version", () => {
    const item: KnowledgeItem = {
      id: "hook-strategy-001",
      category: "通用",
      title: "反常识开头钩子",
      strategy: "开场3秒内出现与常识相悖的论断",
      appliesWhen: ["反常识", "开场"],
      type: "hook_strategy",
      dimension: "hookStrength",
      tags: ["开场", "钩子", "前三秒"],
      source: "local-markdown",
      version: "1.0.0"
    };

    expect(item.type).toBe("hook_strategy");
    expect(item.dimension).toBe("hookStrength");
    expect(item.tags).toContain("前三秒");
    expect(item.source).toBe("local-markdown");
    expect(item.version).toBe("1.0.0");
  });

  it("原有 7 条策略无需修改即通过类型检查", () => {
    const items: KnowledgeItem[] = [
      { id: "opposite-turn", category: "通用", title: "对立翻转", strategy: "...", appliesWhen: [] },
      { id: "audience-drilldown", category: "通用", title: "人群下钻", strategy: "...", appliesWhen: [] },
      { id: "ai-verification", category: "AI科技", title: "AI答案交叉验证", strategy: "...", appliesWhen: [] }
    ];

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.type === undefined)).toBe(true);
  });
});
