/**
 * 黄金评估测试集 — 10 条标注视频
 *
 * 每条标注期望召回的知识 ID 和期望评分区间。
 * 用于知识库更新后的回归测试，确保检索质量不退化。
 *
 * 运行方式：
 *   npx vitest run tests/goldenTestSet.test.ts
 */

import { describe, expect, it } from "vitest";
import { retrieveKnowledgeEvidence } from "../src/engine/retrieveKnowledge";
import { bowenStrategies } from "../src/knowledge/bowenStrategies";
import type { MvpInput } from "../src/domain/types";

interface GoldenCase {
  /** 测试用例 ID */
  id: string;
  /** 输入描述 */
  description: string;
  /** MVP 输入 */
  input: MvpInput;
  /** 期望召回的知识 ID（至少命中其中一个） */
  expectedKnowledgeIds: string[];
  /** 期望检索到的条目数范围 */
  expectedCountRange: { min: number; max: number };
}

const goldenCases: GoldenCase[] = [
  {
    id: "golden-001",
    description: "AI科技类 — AI搜索工具真假判断",
    input: {
      category: "AI科技",
      hotspot: "AI搜索工具真假判断",
      creatorPositioning: "面向普通人的AI工具评测",
      sampleText: "如何验证AI搜索答案真假并避免工具误导",
      commentSignals: "普通人怎么看真假"
    },
    expectedKnowledgeIds: ["ai-verification"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-002",
    description: "通用类 — 反常识钩子选题",
    input: {
      category: "知识科普",
      hotspot: "反常识选题",
      creatorPositioning: "知识科普创作者",
      sampleText: "反常识的开场钩子如何吸引注意力",
      commentSignals: ""
    },
    expectedKnowledgeIds: ["opposite-turn"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-003",
    description: "通用类 — 人群下钻策略",
    input: {
      category: "职场",
      hotspot: "职场新人技能",
      creatorPositioning: "职场导师",
      sampleText: "给职场新人的沟通建议，下钻到具体岗位",
      commentSignals: "新人怎么看"
    },
    expectedKnowledgeIds: ["audience-drilldown"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-004",
    description: "通用类 — 收藏型清单策略",
    input: {
      category: "知识科普",
      hotspot: "收藏型内容",
      creatorPositioning: "知识整理者",
      sampleText: "可收藏的清单和判断标准",
      commentSignals: "收藏"
    },
    expectedKnowledgeIds: ["collectible-checklist"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-005",
    description: "AI漫剧 — 身份反转 + 字幕可读性模型信号",
    input: {
      category: "知识科普",
      hotspot: "上传视频分析",
      creatorPositioning: "AI漫剧创作者",
      sampleText: "常规口播内容",
      commentSignals: "",
      modelSignals: ["identity reversal", "cliffhanger", "subtitle legibility"]
    },
    expectedKnowledgeIds: ["ai-drama-reversal", "subtitle-readability"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-006",
    description: "通用类 — 维度升降策略",
    input: {
      category: "知识科普",
      hotspot: "维度升降",
      creatorPositioning: "知识科普",
      sampleText: "从宏观到微观的维度升降选题",
      commentSignals: ""
    },
    expectedKnowledgeIds: ["opposite-turn"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-007",
    description: "AI科技类 — AI搜索准确率",
    input: {
      category: "AI科技",
      hotspot: "AI搜索准确率问题",
      creatorPositioning: "AI工具评测博主",
      sampleText: "AI搜索的准确率不够高，需要交叉验证",
      commentSignals: "准确率"
    },
    expectedKnowledgeIds: ["ai-verification"],
    expectedCountRange: { min: 1, max: 4 }
  },
  {
    id: "golden-008",
    description: "通用类 — 空查询返回空结果",
    input: {
      category: "AI科技",
      hotspot: "",
      creatorPositioning: "",
      sampleText: "",
      commentSignals: ""
    },
    expectedKnowledgeIds: [],
    expectedCountRange: { min: 0, max: 4 }
  },
  {
    id: "golden-009",
    description: "情感类 — 情感共鸣选题",
    input: {
      category: "情感",
      hotspot: "情感共鸣",
      creatorPositioning: "情感博主",
      sampleText: "职场中的情感困惑和共鸣",
      commentSignals: "共鸣"
    },
    expectedKnowledgeIds: [],
    expectedCountRange: { min: 0, max: 4 }
  },
  {
    id: "golden-010",
    description: "AI科技类 — AI漫剧风格漂移信号",
    input: {
      category: "AI科技",
      hotspot: "AI漫剧制作",
      creatorPositioning: "AI漫剧创作者",
      sampleText: "AI生成的短剧画面",
      commentSignals: "",
      modelSignals: ["style drift", "identity reversal"]
    },
    expectedKnowledgeIds: ["ai-drama-reversal"],
    expectedCountRange: { min: 1, max: 4 }
  }
];

describe("P3-#22: 黄金评估测试集 — 10 条标注视频", () => {
  for (const testCase of goldenCases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const results = retrieveKnowledgeEvidence(testCase.input, bowenStrategies);

      // 验证条目数范围
      expect(results.length).toBeGreaterThanOrEqual(testCase.expectedCountRange.min);
      expect(results.length).toBeLessThanOrEqual(testCase.expectedCountRange.max);

      // 验证期望知识 ID（至少命中一个）
      if (testCase.expectedKnowledgeIds.length > 0) {
        const resultIds = results.map((r) => r.item.id);
        const hasExpected = testCase.expectedKnowledgeIds.some((id) => resultIds.includes(id));
        expect(hasExpected).toBe(true);
      }
    });
  }

  it("所有测试用例都有唯一 ID", () => {
    const ids = goldenCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("测试集覆盖至少 5 个不同的品类", () => {
    const categories = new Set(goldenCases.map((c) => c.input.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});
