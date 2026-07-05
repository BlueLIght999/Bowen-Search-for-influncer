import { describe, expect, it } from "vitest";
import { scoreDifferentiation } from "../src/engine/scoreDifferentiation";
import { generateCandidateDirections } from "../src/engine/generatePlan";
import type { DifferentiationPort } from "../src/application/ports/DifferentiationPort";
import type { DifferentiatedDirection } from "../src/domain/types";

/**
 * scoreDifferentiation 引擎边界与行为测试
 *
 * 覆盖：
 * - 正常评分与排序
 * - 空方向列表
 * - 单方向
 * - 端口部分失败（uniqueness 成功、competition 失败）
 * - 端口全部失败 → 回退
 * - 评分长度不匹配 → 回退
 */

function buildDirections(): DifferentiatedDirection[] {
  return generateCandidateDirections({
    category: "AI科技",
    hotspot: "AI搜索",
    creatorPositioning: "面向职场新人"
  });
}

describe("scoreDifferentiation - 正常路径", () => {
  it("为每个方向填入真实评分并按综合得分降序排列", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async ({ candidateAngles }) => ({
        scores: candidateAngles.map((_, i) => 90 - i * 15),
        source: "sentence-transformers"
      }),
      scoreCompetition: async ({ corpus }) => ({
        score: 30,
        topicId: 1,
        topicSize: 5,
        corpusSize: corpus.length,
        source: "bertopic"
      })
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: ["参照1", "参照2"],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions[0].uniquenessScore).toBe(90);
    expect(result.directions.every((d) => d.competitionScore === 30)).toBe(true);
    expect(result.meta.source).toBe("bertopic");
  });

  it("综合得分 = uniqueness - competition * 0.5，按此降序排列", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => ({
        scores: [50, 80, 65],
        source: "mock"
      }),
      scoreCompetition: async () => ({
        score: 20,
        topicId: 0,
        topicSize: 1,
        corpusSize: 10,
        source: "mock"
      })
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: [],
      differentiator: mock
    });

    // 综合得分：80-10=70 > 65-10=55 > 50-10=40
    expect(result.directions.map((d) => d.uniquenessScore)).toEqual([80, 65, 50]);
  });
});

describe("scoreDifferentiation - 边界用例", () => {
  it("空方向列表返回空结果", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => ({ scores: [], source: "mock" }),
      scoreCompetition: async () => ({
        score: 0,
        topicId: -1,
        topicSize: 0,
        corpusSize: 0,
        source: "mock"
      })
    };

    const result = await scoreDifferentiation({
      directions: [],
      referenceTexts: [],
      differentiator: mock
    });

    expect(result.directions).toEqual([]);
  });

  it("单方向也能正常评分", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => ({ scores: [85], source: "mock" }),
      scoreCompetition: async () => ({
        score: 25,
        topicId: 0,
        topicSize: 2,
        corpusSize: 10,
        source: "mock"
      })
    };

    const singleDirection: DifferentiatedDirection[] = [
      {
        title: "测试方向",
        angle: "测试角度",
        uniquenessScore: 50,
        competitionScore: 50,
        explosionStrategy: "策略",
        filmingAdvice: "建议",
        outline: ["步骤1", "步骤2"]
      }
    ];

    const result = await scoreDifferentiation({
      directions: singleDirection,
      referenceTexts: [],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(1);
    expect(result.directions[0].uniquenessScore).toBe(85);
    expect(result.directions[0].competitionScore).toBe(25);
  });
});

describe("scoreDifferentiation - 端口失败回退", () => {
  it("uniqueness 成功但 competition 全部失败 → 使用回退竞争分 50", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async ({ candidateAngles }) => ({
        scores: candidateAngles.map(() => 80),
        source: "sentence-transformers"
      }),
      scoreCompetition: async () => {
        throw new Error("bertopic unavailable");
      }
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: ["参照"],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore === 80)).toBe(true);
    expect(result.directions.every((d) => d.competitionScore === 50)).toBe(true);
    // source 应保持 uniqueness 的来源
    expect(result.meta.source).toBe("sentence-transformers");
  });

  it("uniqueness 失败但 competition 成功 → 使用回退独特性分", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => {
        throw new Error("embedding unavailable");
      },
      scoreCompetition: async () => ({
        score: 35,
        topicId: 2,
        topicSize: 8,
        corpusSize: 20,
        source: "bertopic"
      })
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: [],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(3);
    // 回退独特性：80, 75, 70
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.directions.every((d) => d.competitionScore === 35)).toBe(true);
    expect(result.meta.source).toBe("bertopic");
  });

  it("端口完全失败 → 全部使用回退值", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => {
        throw new Error("total failure");
      },
      scoreCompetition: async () => {
        throw new Error("total failure");
      }
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: [],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.directions.every((d) => d.competitionScore === 50)).toBe(true);
    expect(result.meta.source).toBe("fallback");
  });

  it("uniqueness 返回长度不匹配 → 使用回退独特性分", async () => {
    const mock: DifferentiationPort = {
      scoreUniqueness: async () => ({
        scores: [90, 80], // 只返回 2 个，但方向有 3 个
        source: "mock"
      }),
      scoreCompetition: async () => ({
        score: 40,
        topicId: 0,
        topicSize: 1,
        corpusSize: 5,
        source: "mock"
      })
    };

    const result = await scoreDifferentiation({
      directions: buildDirections(),
      referenceTexts: [],
      differentiator: mock
    });

    expect(result.directions).toHaveLength(3);
    // 长度不匹配 → 不采用，使用回退值 80/75/70
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
  });
});
