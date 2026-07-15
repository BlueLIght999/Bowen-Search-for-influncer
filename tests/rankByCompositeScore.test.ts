import { describe, expect, it } from "vitest";
import { rankByCompositeScore } from "../src/engine/rankByCompositeScore";
import type { DifferentiatedDirection } from "../src/domain/types";

function makeDirection(
  title: string,
  uniqueness: number,
  competition: number
): DifferentiatedDirection {
  return {
    title,
    angle: title,
    uniquenessScore: uniqueness,
    competitionScore: competition,
    explosionStrategy: "",
    filmingAdvice: "",
    outline: []
  };
}

describe("rankByCompositeScore — 纯函数排序", () => {
  it("按 uniqueness - competition * 0.5 降序排列", () => {
    const directions = [
      makeDirection("A", 50, 40), // 50-20=30
      makeDirection("B", 80, 40), // 80-20=60
      makeDirection("C", 65, 10)  // 65-5=60
    ];

    const sorted = rankByCompositeScore(directions);

    // B 和 C 同分，保持原始相对顺序（稳定排序）
    expect(sorted[0].title).toBe("B");
    expect(sorted[1].title).toBe("C");
    expect(sorted[2].title).toBe("A");
  });

  it("空列表返回空数组", () => {
    expect(rankByCompositeScore([])).toEqual([]);
  });

  it("单元素原样返回", () => {
    const single = [makeDirection("solo", 70, 30)];
    expect(rankByCompositeScore(single)).toEqual(single);
  });

  it("不修改原始数组", () => {
    const original = [
      makeDirection("A", 50, 40),
      makeDirection("B", 80, 40)
    ];
    const originalFirst = original[0].title;

    rankByCompositeScore(original);

    expect(original[0].title).toBe(originalFirst);
  });
});
