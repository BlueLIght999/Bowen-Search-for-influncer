import { describe, expect, it } from "vitest";
import { understandUploadedVideo } from "../src/application/useCases/understandUploadedVideo";

describe("understandUploadedVideo", () => {
  it("detects AI drama signals and derives scenes from sampled frames", () => {
    const observation = understandUploadedVideo({
      transcript:
        "The heroine is betrayed by her family, returns with a hidden identity, and exposes the villain before the next episode.",
      frames: [
        { index: 1, timestampSeconds: 0, path: "frame-001.jpg" },
        { index: 2, timestampSeconds: 5, path: "frame-002.jpg" },
        { index: 3, timestampSeconds: 10, path: "frame-003.jpg" }
      ],
      ocrTexts: []
    });

    expect(observation.contentType).toBe("ai_drama");
    expect(observation.scenes).toHaveLength(3);
    expect(observation.scenes[1].start).toBe(5);
    expect(observation.scenes[1].end).toBe(10);
    expect(observation.aiDramaSignals.map((signal) => signal.type)).toEqual(
      expect.arrayContaining(["conflict", "reversal", "cliffhanger"])
    );
    expect(observation.evidenceConfidence).toBe("medium");
  });

  it("adds subtitle signals and higher confidence when OCR text is available", () => {
    const observation = understandUploadedVideo({
      transcript: "A character reveals the truth.",
      frames: [{ index: 1, timestampSeconds: 0, path: "frame-001.jpg" }],
      ocrTexts: [
        {
          frameIndex: 1,
          text: "她竟然是失踪多年的继承人",
          confidence: 0.94
        }
      ]
    });

    expect(observation.subtitleSignals).toEqual([
      {
        frameIndex: 1,
        text: "她竟然是失踪多年的继承人",
        confidence: 0.94
      }
    ]);
    expect(observation.visualTags).toContain("subtitle-driven");
    expect(observation.evidenceConfidence).toBe("high");
  });

  it("returns a transcript-only fallback observation without frames", () => {
    const observation = understandUploadedVideo({
      transcript: "A presenter compares two AI tools.",
      frames: [],
      ocrTexts: []
    });

    expect(observation.contentType).toBe("talking_head");
    expect(observation.scenes).toHaveLength(1);
    expect(observation.visualTags).toContain("transcript-only");
    expect(observation.evidenceConfidence).toBe("low");
  });
});
