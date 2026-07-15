import { describe, expect, it } from "vitest";
import { retrieveKnowledge, retrieveKnowledgeEvidence } from "../src/engine/retrieveKnowledge";
import { bowenStrategies } from "../src/knowledge/bowenStrategies";

describe("retrieveKnowledgeEvidence", () => {
  it("returns matched knowledge with score and human-readable reasons", () => {
    const evidence = retrieveKnowledgeEvidence({
      category: "AI科技",
      hotspot: "AI搜索工具真假判断",
      creatorPositioning: "面向普通人的AI工具评测",
      sampleText: "如何验证AI搜索答案真假并避免工具误导",
      commentSignals: "普通人怎么看真假"
    }, bowenStrategies);

    const aiVerification = evidence.find((item) => item.item.id === "ai-verification");

    expect(aiVerification).toBeDefined();
    expect(aiVerification?.score).toBeGreaterThan(3);
    expect(aiVerification?.matchReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("category"),
        expect.stringContaining("keyword")
      ])
    );
  });

  it("preserves the existing retrieveKnowledge item-only API", () => {
    const input = {
      category: "AI科技" as const,
      hotspot: "AI工具",
      creatorPositioning: "AI创作者",
      sampleText: "AI工具真假判断",
      commentSignals: ""
    };

    const evidence = retrieveKnowledgeEvidence(input, bowenStrategies);
    const items = retrieveKnowledge(input, bowenStrategies);

    expect(items).toEqual(evidence.map((entry) => entry.item));
  });

  it("uses model-derived narrative and visual signals to retrieve AI drama guidance", () => {
    const evidence = retrieveKnowledgeEvidence({
      category: "知识科普",
      hotspot: "上传视频分析",
      creatorPositioning: "AI漫剧创作者",
      sampleText: "常规口播内容，没有明显剧情关键词。",
      commentSignals: "",
      modelSignals: [
        "identity reversal",
        "cliffhanger",
        "subtitle legibility",
        "style drift"
      ]
    }, bowenStrategies);

    const aiDrama = evidence.find((item) => item.item.id === "ai-drama-reversal");
    const subtitle = evidence.find((item) => item.item.id === "subtitle-readability");

    expect(aiDrama).toBeDefined();
    expect(aiDrama?.matchReasons).toEqual(
      expect.arrayContaining([
        "model-signal: identity reversal",
        "model-signal: cliffhanger"
      ])
    );
    expect(subtitle?.matchReasons).toContain("model-signal: subtitle legibility");
  });
});
