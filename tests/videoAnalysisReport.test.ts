import { describe, expect, it } from "vitest";
import { analyzeUploadedVideo } from "../src/application/useCases/analyzeUploadedVideo";
import { LocalDifferentiationClient } from "../src/infrastructure/differentiation/LocalDifferentiationClient";
import { LocalKnowledgeRepository } from "../src/infrastructure/knowledge/LocalKnowledgeRepository";

describe("video analysis report", () => {
  it("returns a structured P0 report for uploaded AI drama content", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI绉戞妧",
        hotspot: "AI drama revenge story",
        title: "The betrayed heroine returns in an AI drama",
        transcript:
          "The heroine is betrayed by her family in the first scene. She returns with a new identity, exposes the villain, and leaves a cliffhanger for the next episode.",
        commentSignals: "viewers ask for next episode and reversal",
        creatorPositioning: "AI drama creator"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: new LocalKnowledgeRepository(),
      referenceTexts: ["AI drama revenge reversal", "short drama cliffhanger"],
      videoObservation: {
        contentType: "ai_drama",
        scenes: [
          {
            start: 0,
            end: 5,
            summary: "Opening conflict frame.",
            signals: ["frame-001.jpg"]
          }
        ],
        visualTags: ["sampled-frames", "ai-drama"],
        aiDramaSignals: [
          {
            type: "conflict",
            label: "Visible conflict",
            evidence: "Opening frame and transcript show betrayal."
          }
        ],
        subtitleSignals: [],
        evidenceConfidence: "medium"
      }
    });

    expect(result.report.jobId).toMatch(/^job_/);
    expect(result.report.status).toBe("completed");
    expect(result.report.transcript.confidence).toBe("medium");
    expect(result.report.understanding.contentType).toBe("ai_drama");
    expect(result.report.understanding.scenes[0].signals).toContain("frame-001.jpg");
    expect(result.report.understanding.evidenceConfidence).toBe("medium");
    expect(result.report.knowledgeEvidence.length).toBeGreaterThan(0);
    expect(result.report.knowledgeEvidence[0].matchReasons.length).toBeGreaterThan(0);
    expect(result.report.evaluation.scores.scriptQuality).toBeGreaterThan(0);
    expect(result.report.evaluation.scores.emotionalRhythm).toBeGreaterThan(0);
    expect(result.report.evaluation.scores.differentiation).toBeGreaterThan(0);
    expect(result.report.evaluation.scores.aiDramaFit).toBeGreaterThan(0);
    expect(result.report.evaluation.scoreReasons.scriptQuality).toContain("文案结构");
    expect(result.report.evaluation.scoreReasons.emotionalRhythm).toContain("情绪");
    expect(result.report.evaluation.scoreReasons.differentiation).toContain("差异化");
    expect(result.report.evaluation.keywordRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "scriptQuality",
          label: "脚本优秀度",
          keywords: expect.arrayContaining(["身份反转"])
        }),
        expect.objectContaining({
          dimension: "sceneDesign",
          label: "分镜表现",
          keywords: expect.arrayContaining(["反应镜头"])
        }),
        expect.objectContaining({
          dimension: "aestheticExperience",
          label: "审美体验",
          keywords: expect.arrayContaining(["高对比字幕"])
        })
      ])
    );
    expect(result.report.evaluation.hitPatterns.length).toBeGreaterThan(0);
    expect(result.report.evaluation.suggestions.length).toBeGreaterThan(0);
    expect(result.report.generatedOutline.titleOptions.length).toBeGreaterThanOrEqual(2);
    expect(result.report.generatedOutline.endingHook).toContain("下一集");
    expect(result.report.generatedOutline.aiDramaOutline).toMatchObject({
      relationship: expect.stringContaining("主角"),
      conflict: expect.stringContaining("背叛"),
      reversal: expect.stringContaining("身份反转"),
      cliffhanger: expect.stringContaining("下一集")
    });
  });

  it("uses OCR subtitle evidence when scoring visual hooks and AI drama fit", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI绉戞妧",
        hotspot: "uploaded story",
        title: "A quiet opening",
        transcript: "A character walks into the room.",
        commentSignals: "",
        creatorPositioning: "AI drama creator"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: new LocalKnowledgeRepository(),
      videoObservation: {
        contentType: "ai_drama",
        scenes: [
          {
            start: 0,
            end: 5,
            summary: "Opening frame.",
            signals: ["frame-001.jpg"]
          }
        ],
        visualTags: ["sampled-frames", "subtitle-driven", "ai-drama"],
        aiDramaSignals: [
          {
            type: "reversal",
            label: "Identity reversal",
            evidence: "OCR subtitle reveals the hidden identity."
          },
          {
            type: "cliffhanger",
            label: "Next episode hook",
            evidence: "OCR subtitle promises the next episode."
          }
        ],
        subtitleSignals: [
          {
            frameIndex: 1,
            text: "她竟然是失踪多年的继承人，下一集揭晓真相",
            confidence: 0.96
          }
        ],
        evidenceConfidence: "high"
      }
    });

    expect(result.report.evaluation.scores.hookStrength).toBeGreaterThanOrEqual(82);
    expect(result.report.evaluation.scores.aestheticExperience).toBeGreaterThanOrEqual(74);
    expect(result.report.evaluation.scores.aiDramaFit).toBeGreaterThanOrEqual(76);
    expect(result.report.evaluation.hitPatterns).toContain("画面字幕识别到 1 条高置信内容");
    expect(result.report.evaluation.suggestions.some((item) => item.target === "subtitle")).toBe(true);
    expect(
      result.report.evaluation.keywordRecommendations.some((item) =>
        item.keywords.includes("首帧字幕钩子")
      )
    ).toBe(true);
  });
});
