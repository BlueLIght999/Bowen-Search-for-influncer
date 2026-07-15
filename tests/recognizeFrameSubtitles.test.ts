import { describe, expect, it, vi } from "vitest";
import type { OcrPort } from "../src/application/ports/OcrPort";
import { recognizeFrameSubtitles } from "../src/application/useCases/recognizeFrameSubtitles";

describe("recognizeFrameSubtitles", () => {
  it("skips OCR without calling the service when no frames were sampled", async () => {
    const ocr: OcrPort = {
      recognizeFrames: vi.fn()
    };

    const result = await recognizeFrameSubtitles({
      frames: [],
      ocr
    });

    expect(result).toEqual({
      status: "skipped",
      source: "fallback",
      signals: [],
      reason: "No sampled frames are available for OCR."
    });
    expect(ocr.recognizeFrames).not.toHaveBeenCalled();
  });

  it("normalizes OCR signals and removes duplicate subtitle text", async () => {
    const ocr: OcrPort = {
      recognizeFrames: vi.fn().mockResolvedValue([
        { frameIndex: 1, text: " 她竟然是继承人 ", confidence: 1.4 },
        { frameIndex: 2, text: "她竟然是继承人", confidence: 0.91 },
        { frameIndex: 3, text: "下一集揭晓真相", confidence: -0.2 },
        { frameIndex: 4, text: "   ", confidence: 0.8 }
      ])
    };

    const result = await recognizeFrameSubtitles({
      frames: [
        { index: 1, timestampSeconds: 0, path: "frame-001.jpg" },
        { index: 2, timestampSeconds: 5, path: "frame-002.jpg" },
        { index: 3, timestampSeconds: 10, path: "frame-003.jpg" }
      ],
      ocr
    });

    expect(result.status).toBe("completed");
    expect(result.source).toBe("paddleocr");
    expect(result.signals).toEqual([
      { frameIndex: 1, text: "她竟然是继承人", confidence: 1 },
      { frameIndex: 3, text: "下一集揭晓真相", confidence: 0 }
    ]);
  });

  it("returns a failed fallback result when the OCR service is unavailable", async () => {
    const ocr: OcrPort = {
      recognizeFrames: vi.fn().mockRejectedValue(new Error("service offline"))
    };

    const result = await recognizeFrameSubtitles({
      frames: [{ index: 1, timestampSeconds: 0, path: "frame-001.jpg" }],
      ocr
    });

    expect(result.status).toBe("failed");
    expect(result.source).toBe("fallback");
    expect(result.signals).toEqual([]);
    expect(result.reason).toContain("service offline");
  });
});
