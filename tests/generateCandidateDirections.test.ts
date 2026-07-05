import { describe, expect, it } from "vitest";
import { generateCandidateDirections, generatePlan } from "../src/engine/generatePlan";
import { defaultInput } from "../src/domain/sampleInputs";
import type { Category } from "../src/domain/types";

/**
 * generateCandidateDirections 边界测试
 */

describe("generateCandidateDirections - 基本行为", () => {
  it("始终生成 3 个方向", () => {
    const directions = generateCandidateDirections({
      category: "AI科技",
      hotspot: "AI搜索",
      creatorPositioning: "面向职场新人"
    });

    expect(directions).toHaveLength(3);
  });

  it("每个方向包含完整的字段", () => {
    const directions = generateCandidateDirections({
      category: "知识科普",
      hotspot: "黑洞",
      creatorPositioning: "科普创作者"
    });

    for (const direction of directions) {
      expect(direction.title).toBeTruthy();
      expect(direction.angle).toBeTruthy();
      expect(direction.uniquenessScore).toBeGreaterThan(0);
      expect(direction.uniquenessScore).toBeLessThanOrEqual(100);
      expect(direction.competitionScore).toBeGreaterThanOrEqual(0);
      expect(direction.competitionScore).toBeLessThanOrEqual(100);
      expect(direction.explosionStrategy).toBeTruthy();
      expect(direction.filmingAdvice).toBeTruthy();
      expect(direction.outline.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("三个方向分别对应对立翻转、人群下钻、维度升降", () => {
    const directions = generateCandidateDirections({
      category: "商业分析",
      hotspot: "消费趋势",
      creatorPositioning: "商业分析师"
    });

    expect(directions[0].angle).toContain("对立翻转");
    expect(directions[1].angle).toContain("人群下钻");
    expect(directions[2].angle).toContain("维度升降");
  });
});

describe("generateCandidateDirections - 热点与品类注入", () => {
  it("热点关键词注入到方向标题中", () => {
    const hotspot = "元宇宙";
    const directions = generateCandidateDirections({
      category: "AI科技",
      hotspot,
      creatorPositioning: "面向职场新人"
    });

    expect(directions[0].title).toContain(hotspot);
    expect(directions[2].title).toContain(hotspot);
  });

  it("创作者定位注入到人群下钻方向标题中", () => {
    const positioning = "面向小镇青年的创作者";
    const directions = generateCandidateDirections({
      category: "时评热点",
      hotspot: "社会事件",
      creatorPositioning: positioning
    });

    expect(directions[1].title).toContain(positioning);
  });

  it("所有 6 个品类都能正常生成方向", () => {
    const categories: Category[] = [
      "时评热点",
      "知识科普",
      "职场成长",
      "商业分析",
      "AI科技",
      "教育观察"
    ];

    for (const category of categories) {
      const directions = generateCandidateDirections({
        category,
        hotspot: "测试热点",
        creatorPositioning: "测试创作者"
      });

      expect(directions).toHaveLength(3);
    }
  });
});

describe("generateCandidateDirections - 边界输入", () => {
  it("空热点字符串仍能生成方向", () => {
    const directions = generateCandidateDirections({
      category: "AI科技",
      hotspot: "",
      creatorPositioning: "面向职场新人"
    });

    expect(directions).toHaveLength(3);
    // 标题中不会因空字符串崩溃
    expect(directions[0].title).toBeTruthy();
  });

  it("空创作者定位仍能生成方向", () => {
    const directions = generateCandidateDirections({
      category: "AI科技",
      hotspot: "AI搜索",
      creatorPositioning: ""
    });

    expect(directions).toHaveLength(3);
    expect(directions[1].title).toBeTruthy();
  });

  it("超长热点字符串不会崩溃", () => {
    const longHotspot = "这是一个非常非常非常长的热点关键词".repeat(20);
    const directions = generateCandidateDirections({
      category: "AI科技",
      hotspot: longHotspot,
      creatorPositioning: "面向职场新人"
    });

    expect(directions).toHaveLength(3);
  });
});

describe("generatePlan - 与 generateCandidateDirections 的一致性", () => {
  it("generatePlan 返回的方向与 generateCandidateDirections 一致", () => {
    const plan = generatePlan(defaultInput);
    const candidates = generateCandidateDirections({
      category: defaultInput.category,
      hotspot: defaultInput.hotspot,
      creatorPositioning: defaultInput.creatorPositioning
    });

    expect(plan.directions).toHaveLength(candidates.length);
    expect(plan.directions[0].angle).toBe(candidates[0].angle);
    expect(plan.directions[1].angle).toBe(candidates[1].angle);
    expect(plan.directions[2].angle).toBe(candidates[2].angle);
  });
});
