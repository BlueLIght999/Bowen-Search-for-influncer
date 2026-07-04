import { describe, expect, it } from "vitest";
import { defaultInput } from "../src/domain/sampleInputs";
import { analyzeSample } from "../src/engine/analyzeSample";
import { generatePlan } from "../src/engine/generatePlan";
import { retrieveKnowledge } from "../src/engine/retrieveKnowledge";

describe("default MVP input", () => {
  it("contains enough information for a demo run", () => {
    expect(defaultInput.hotspot.length).toBeGreaterThan(5);
    expect(defaultInput.sampleText).toContain("标题");
    expect(defaultInput.commentSignals).toContain("评论");
  });
});

describe("sample analyzer", () => {
  it("extracts a useful sample analysis", () => {
    const analysis = analyzeSample(defaultInput);

    expect(analysis.hookPattern).toContain("反常识");
    expect(analysis.copyLogic).toHaveLength(4);
    expect(analysis.sceneStyle.length).toBeGreaterThan(5);
    expect(analysis.collectibleMoment).toContain("收藏");
  });
});

describe("knowledge retrieval", () => {
  it("retrieves category and universal knowledge", () => {
    const items = retrieveKnowledge(defaultInput);

    expect(items.some((item) => item.id === "ai-verification")).toBe(true);
    expect(items.some((item) => item.category === "通用")).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("plan generator", () => {
  it("generates three differentiated shootable directions", () => {
    const plan = generatePlan(defaultInput);

    expect(plan.directions).toHaveLength(3);
    expect(plan.directions[0].outline.length).toBeGreaterThanOrEqual(4);
    expect(plan.directions[0].uniquenessScore).toBeGreaterThan(60);
    expect(plan.reviewPrompt).toContain("收藏率");
  });
});
