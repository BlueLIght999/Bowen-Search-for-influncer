import { describe, expect, it, vi } from "vitest";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import { retrieveEvaluationKnowledge } from "../src/application/useCases/retrieveEvaluationKnowledge";

describe("retrieveEvaluationKnowledge", () => {
  it("retrieves explainable knowledge through a repository port", async () => {
    const repository: KnowledgeRepositoryPort = {
      retrieve: vi.fn().mockResolvedValue([
        {
          item: {
            id: "ai-drama-reversal",
            category: "通用",
            title: "AI漫剧反转钩子",
            strategy: "把身份反转前置。",
            appliesWhen: ["identity reversal"]
          },
          score: 5,
          matchReasons: ["model-signal: identity reversal"]
        }
      ])
    };

    const result = await retrieveEvaluationKnowledge({
      query: {
        category: "知识科普",
        hotspot: "上传视频分析",
        creatorPositioning: "AI漫剧创作者",
        sampleText: "普通文稿",
        commentSignals: "",
        modelSignals: ["identity reversal"]
      },
      repository,
      limit: 3
    });

    expect(repository.retrieve).toHaveBeenCalledWith({
      category: "知识科普",
      hotspot: "上传视频分析",
      creatorPositioning: "AI漫剧创作者",
      sampleText: "普通文稿",
      commentSignals: "",
      modelSignals: ["identity reversal"]
    });
    expect(result.status).toBe("completed");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].matchReasons).toContain("model-signal: identity reversal");
  });

  it("deduplicates results and applies the requested limit", async () => {
    const repository: KnowledgeRepositoryPort = {
      retrieve: vi.fn().mockResolvedValue([
        retrievedKnowledge("a", 3),
        retrievedKnowledge("b", 4),
        retrievedKnowledge("a", 8),
        retrievedKnowledge("c", 2)
      ])
    };

    const result = await retrieveEvaluationKnowledge({
      query: baseQuery(),
      repository,
      limit: 2
    });

    expect(result.status).toBe("completed");
    expect(result.evidence.map((entry) => entry.item.id)).toEqual(["a", "b"]);
    expect(result.evidence[0].score).toBe(8);
  });

  it("returns an empty fallback result when the repository fails", async () => {
    const repository: KnowledgeRepositoryPort = {
      retrieve: vi.fn().mockRejectedValue(new Error("vector store unavailable"))
    };

    const result = await retrieveEvaluationKnowledge({
      query: baseQuery(),
      repository,
      limit: 4
    });

    expect(result).toEqual({
      status: "failed",
      evidence: [],
      reason: "vector store unavailable"
    });
  });
});

function baseQuery() {
  return {
    category: "AI科技" as const,
    hotspot: "AI搜索",
    creatorPositioning: "AI创作者",
    sampleText: "AI搜索真假判断",
    commentSignals: "",
    modelSignals: []
  };
}

function retrievedKnowledge(id: string, score: number) {
  return {
    item: {
      id,
      category: "通用" as const,
      title: `knowledge ${id}`,
      strategy: "strategy",
      appliesWhen: [id]
    },
    score,
    matchReasons: [`keyword: ${id}`]
  };
}
