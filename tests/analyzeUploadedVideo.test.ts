import { describe, expect, it } from "vitest";
import { analyzeUploadedVideo } from "../src/application/useCases/analyzeUploadedVideo";
import { LocalDifferentiationClient } from "../src/infrastructure/differentiation/LocalDifferentiationClient";
import type { DifferentiationPort } from "../src/application/ports/DifferentiationPort";

/**
 * analyzeUploadedVideo 用例边界测试
 *
 * 覆盖：
 * - 标准输入
 * - 空文案（仅有标题）
 * - 空标题（仅有文案）
 * - 超长文本
 * - 未知品类（默认回退）
 * - 空 referenceTexts
 * - 大量 referenceTexts
 * - differentiator 失败回退
 */

describe("analyzeUploadedVideo - 标准输入", () => {
  it("返回完整分析结果，包含 3 个方向、样本拆解和知识库", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索正在改变信息获取",
        transcript: "你以为搜索是在找答案，其实是在外包判断。对比传统搜索和AI搜索。",
        commentSignals: "普通人怎么判断AI答案真假？",
        creatorPositioning: "面向职场新人"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: ["AI搜索改变信息获取", "普通人如何用AI工具"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis.hookPattern).toContain("反常识");
    expect(result.analysis.copyLogic).toHaveLength(4);
    expect(result.knowledgeUsed.length).toBeGreaterThanOrEqual(1);
    expect(result.reviewPrompt).toContain("收藏率");
    expect(result.summary).toContain("AI科技");
  });
});

describe("analyzeUploadedVideo - 边界输入", () => {
  it("仅有标题、无文案时仍能分析", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "知识科普",
        hotspot: "黑洞",
        title: "黑洞里面到底是什么",
        transcript: "",
        commentSignals: "",
        creatorPositioning: "科普创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: []
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis).toBeDefined();
  });

  it("仅有文案、无标题时仍能分析", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "时评热点",
        hotspot: "社会事件",
        title: "",
        transcript: "这是一段没有标题的视频文案，讲述了一个社会热点事件的来龙去脉。",
        commentSignals: "",
        creatorPositioning: "时评创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: ["相关热点1"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.summary).toContain("时评热点");
  });

  it("超长文案（5000 字）不会崩溃", async () => {
    const longText = "这是一段很长的视频文案。".repeat(500); // ~5000 字
    const result = await analyzeUploadedVideo({
      input: {
        category: "商业分析",
        hotspot: "商业模式",
        title: "商业模式深度分析",
        transcript: longText,
        commentSignals: "这个模式怎么赚钱？",
        creatorPositioning: "商业分析师"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: ["商业分析1", "商业分析2"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis.copyLogic).toHaveLength(4);
  });

  it("空 referenceTexts 时仍能计算评分（回退值）", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "教育观察",
        hotspot: "教育改革",
        title: "教育改革新方向",
        transcript: "教育改革正在改变学习方式。",
        commentSignals: "",
        creatorPositioning: "教育观察者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: []
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.directions.every((d) => d.competitionScore >= 0)).toBe(true);
  });

  it("大量 referenceTexts（100 条）时仍能正常工作", async () => {
    const largeRefPool = Array.from({ length: 100 }, (_, i) => `参照视频标题${i}`);
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI工具",
        title: "AI工具评测",
        transcript: "这期视频评测了三款AI工具。",
        commentSignals: "",
        creatorPositioning: "AI工具评测者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: largeRefPool
    });

    expect(result.directions).toHaveLength(3);
  });
});

describe("analyzeUploadedVideo - differentiator 失败回退", () => {
  it("differentiator 全部抛错时，用例仍返回结果（引擎内部回退）", async () => {
    const failingDifferentiator: DifferentiationPort = {
      scoreUniqueness: async () => {
        throw new Error("service down");
      },
      scoreCompetition: async () => {
        throw new Error("service down");
      }
    };

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索分析",
        transcript: "AI搜索正在改变信息获取方式。",
        commentSignals: "",
        creatorPositioning: "面向职场新人"
      },
      differentiator: failingDifferentiator,
      referenceTexts: ["参照1"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.differentiationMeta.source).toBe("fallback");
  });
});

describe("analyzeUploadedVideo - 品类与知识库", () => {
  it("AI科技品类召回 ai-verification 知识", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索",
        transcript: "AI搜索工具正在改变信息获取。",
        commentSignals: "AI工具真假怎么判断",
        creatorPositioning: "面向职场新人"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: []
    });

    expect(result.knowledgeUsed.some((item) => item.id === "ai-verification")).toBe(true);
  });

  it("通用知识（对立翻转）在任何品类下都能召回", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "职场成长",
        hotspot: "职场晋升",
        title: "职场晋升指南",
        transcript: "职场晋升不只是努力工作。",
        commentSignals: "",
        creatorPositioning: "职场博主"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: []
    });

    expect(result.knowledgeUsed.some((item) => item.id === "opposite-turn")).toBe(true);
  });
});
