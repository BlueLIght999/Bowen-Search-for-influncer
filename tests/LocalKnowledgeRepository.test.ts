import { describe, expect, it } from "vitest";
import { LocalKnowledgeRepository } from "../src/infrastructure/knowledge/LocalKnowledgeRepository";

describe("LocalKnowledgeRepository", () => {
  it("returns scored keyword evidence with human-readable reasons", async () => {
    const repository = new LocalKnowledgeRepository();

    const evidence = await repository.retrieve({
      category: "AI科技",
      hotspot: "AI搜索真假判断",
      creatorPositioning: "AI工具评测者",
      sampleText: "验证AI搜索答案",
      commentSignals: "",
      modelSignals: []
    });

    const verification = evidence.find((entry) => entry.item.id === "ai-verification");
    expect(verification).toBeDefined();
    expect(verification?.matchReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("category"),
        expect.stringContaining("keyword")
      ])
    );
  });

  it("passes model signals into the local keyword fallback", async () => {
    const repository = new LocalKnowledgeRepository();

    const evidence = await repository.retrieve({
      category: "知识科普",
      hotspot: "上传视频",
      creatorPositioning: "AI漫剧创作者",
      sampleText: "普通文稿",
      commentSignals: "",
      modelSignals: ["style drift"]
    });

    const continuity = evidence.find(
      (entry) => entry.item.id === "visual-style-continuity"
    );
    expect(continuity?.matchReasons).toContain("model-signal: style drift");
  });
});
