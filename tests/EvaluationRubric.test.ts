import { describe, expect, it } from "vitest";
import {
  BOWEN_CONTENT_EVALUATION_RUBRIC,
  createEvaluationRubricSummary
} from "../src/domain/evaluation/EvaluationRubric";

describe("EvaluationRubric", () => {
  it("defines a stable versioned rubric for content evaluation", () => {
    expect(BOWEN_CONTENT_EVALUATION_RUBRIC.version).toBe("bowen-content-evaluation-v1");
    expect(BOWEN_CONTENT_EVALUATION_RUBRIC.dimensions.map((item) => item.key)).toEqual([
      "scriptQuality",
      "hookStrength",
      "sceneDesign",
      "aestheticExperience",
      "emotionalRhythm",
      "differentiation",
      "viralPotential",
      "aiDramaFit"
    ]);
  });

  it("creates a compact report summary with a stable checksum", () => {
    const summary = createEvaluationRubricSummary();

    expect(summary).toEqual({
      version: "bowen-content-evaluation-v1",
      checksum: "e72db704602f",
      dimensions: [
        "scriptQuality",
        "hookStrength",
        "sceneDesign",
        "aestheticExperience",
        "emotionalRhythm",
        "differentiation",
        "viralPotential",
        "aiDramaFit"
      ]
    });
  });
});
