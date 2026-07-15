import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddleOcrClient } from "../src/infrastructure/ocr/PaddleOcrClient";

describe("PaddleOcrClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts sampled frame paths and normalizes the PaddleOCR response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        signals: [
          { frameIndex: 1, text: "身份反转", confidence: 0.96 },
          { frameIndex: 2, text: "下一集见", confidence: 0.88 }
        ]
      })
    });
    global.fetch = fetchMock;

    const client = new PaddleOcrClient({
      endpoint: "http://test:8770/",
      timeoutMs: 5000
    });
    const result = await client.recognizeFrames([
      { index: 1, timestampSeconds: 0, path: "storage/frames/video/frame-001.jpg" },
      { index: 2, timestampSeconds: 5, path: "storage/frames/video/frame-002.jpg" }
    ]);

    expect(result).toEqual([
      { frameIndex: 1, text: "身份反转", confidence: 0.96 },
      { frameIndex: 2, text: "下一集见", confidence: 0.88 }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test:8770/recognize-frames",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: [
            { index: 1, timestampSeconds: 0, path: "storage/frames/video/frame-001.jpg" },
            { index: 2, timestampSeconds: 5, path: "storage/frames/video/frame-002.jpg" }
          ]
        }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("rejects malformed OCR responses instead of leaking invalid signals", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signals: "invalid" })
    });

    const client = new PaddleOcrClient({ endpoint: "http://test:8770" });

    await expect(
      client.recognizeFrames([
        { index: 1, timestampSeconds: 0, path: "frame-001.jpg" }
      ])
    ).rejects.toThrow("Invalid PaddleOCR response");
  });
});
