import { describe, expect, it } from "vitest";
import { LocalDifferentiationClient } from "../src/infrastructure/differentiation/LocalDifferentiationClient";

/**
 * LocalDifferentiationClient 边界测试
 *
 * 覆盖：
 * - 空输入
 * - 单元素输入
 * - 高重合度（低独特性）
 * - 零重合度（高独特性）
 * - 大量参照池
 * - 特殊字符
 */

describe("LocalDifferentiationClient - scoreUniqueness", () => {
  const client = new LocalDifferentiationClient();

  it("空候选角度返回空分数列表", async () => {
    const result = await client.scoreUniqueness({
      candidateAngles: [],
      referenceTexts: ["参照"]
    });

    expect(result.scores).toEqual([]);
    expect(result.source).toBe("fallback");
  });

  it("无参照池时，使用候选间相似度惩罚", async () => {
    const result = await client.scoreUniqueness({
      candidateAngles: ["对立翻转角度", "人群下钻角度", "维度升降角度"],
      referenceTexts: []
    });

    expect(result.scores).toHaveLength(3);
    expect(result.scores.every((s) => s >= 0 && s <= 100)).toBe(true);
  });

  it("候选与参照高度重合时独特性较低", async () => {
    const referenceTexts = ["AI搜索改变信息获取方式", "AI搜索工具对比评测"];
    const result = await client.scoreUniqueness({
      candidateAngles: ["AI搜索改变信息获取"],
      referenceTexts
    });

    expect(result.scores[0]).toBeLessThan(85); // 重合度高 → 分数被压低
  });

  it("候选与参照完全不同时独特性较高", async () => {
    const referenceTexts = ["美食菜谱分享", "旅游景点推荐"];
    const result = await client.scoreUniqueness({
      candidateAngles: ["量子计算原理深度解析"],
      referenceTexts
    });

    expect(result.scores[0]).toBeGreaterThan(60);
  });

  it("多个候选角度返回对应数量的分数", async () => {
    const result = await client.scoreUniqueness({
      candidateAngles: ["角度1", "角度2", "角度3", "角度4", "角度5"],
      referenceTexts: ["参照"]
    });

    expect(result.scores).toHaveLength(5);
  });
});

describe("LocalDifferentiationClient - scoreCompetition", () => {
  const client = new LocalDifferentiationClient();

  it("空语料库返回 50 分（中性回退）", async () => {
    const result = await client.scoreCompetition({
      query: "任意角度",
      corpus: []
    });

    expect(result.score).toBe(50);
    expect(result.corpusSize).toBe(0);
    expect(result.source).toBe("fallback");
  });

  it("单条语料也能计算", async () => {
    const result = await client.scoreCompetition({
      query: "AI搜索",
      corpus: ["AI搜索改变信息获取"]
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.corpusSize).toBe(1);
  });

  it("query 关键词在语料中高频出现时竞争密度较高", async () => {
    const result = await client.scoreCompetition({
      query: "AI搜索改变",
      corpus: ["AI搜索改变信息获取", "AI搜索改变生活", "AI搜索改变工作", "无关内容"]
    });

    // 4 条语料中 3 条匹配 → 75
    expect(result.score).toBe(75);
  });

  it("query 关键词在语料中零匹配时竞争密度为 0", async () => {
    const result = await client.scoreCompetition({
      query: "量子计算",
      corpus: ["美食菜谱", "旅游攻略", "健身指南"]
    });

    expect(result.score).toBe(0);
  });

  it("大量语料（100 条）也能正常计算", async () => {
    const corpus = Array.from({ length: 100 }, (_, i) =>
      i % 3 === 0 ? "AI搜索相关内容" : `无关内容${i}`
    );
    const result = await client.scoreCompetition({
      query: "AI搜索",
      corpus
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.corpusSize).toBe(100);
  });

  it("特殊字符的 query 不会崩溃", async () => {
    const result = await client.scoreCompetition({
      query: "AI搜索！@#￥%……&*（）",
      corpus: ["AI搜索内容", "其他内容"]
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
