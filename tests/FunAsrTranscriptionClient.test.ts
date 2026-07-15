import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunAsrTranscriptionClient } from "../src/infrastructure/transcription/FunAsrTranscriptionClient";

describe("FunAsrTranscriptionClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("posts local audio files to the FunASR file transcription endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        source: "funasr",
        language: "zh",
        fullText: "这是一段上传视频的中文转写",
        segments: [{ start: 0, end: 2.5, text: "这是一段上传视频的中文转写" }]
      })
    });
    global.fetch = fetchMock;

    const client = new FunAsrTranscriptionClient({ endpoint: "http://test:8765", timeoutMs: 5000 });
    const result = await client.transcribeAudioFile({
      audioPath: "storage/audio/video_123.wav",
      title: "uploaded demo",
      fallbackText: "fallback transcript"
    });

    expect(result.source).toBe("funasr");
    expect(result.fullText).toBe("这是一段上传视频的中文转写");
    expect(result.segments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test:8765/transcribe-file",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioPath: "storage/audio/video_123.wav",
          title: "uploaded demo",
          fallbackText: "fallback transcript"
        }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("normalizes missing fullText from returned segments", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        source: "funasr",
        segments: [
          { start: 0, end: 1, text: "第一句" },
          { start: 1, end: 2, text: "第二句" }
        ]
      })
    });

    const client = new FunAsrTranscriptionClient({ endpoint: "http://test:8765" });
    const result = await client.transcribeAudioFile({
      audioPath: "storage/audio/video_123.wav"
    });

    expect(result.fullText).toBe("第一句\n第二句");
    expect(result.language).toBe("zh");
  });
});
