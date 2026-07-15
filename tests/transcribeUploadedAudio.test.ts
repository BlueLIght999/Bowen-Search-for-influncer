import { describe, expect, it } from "vitest";
import type { AudioFileTranscriptionPort } from "../src/application/ports/TranscriptionPort";
import { transcribeUploadedAudio } from "../src/application/useCases/transcribeUploadedAudio";

describe("transcribeUploadedAudio", () => {
  it("returns FunASR transcription when the service succeeds", async () => {
    const transcriber: AudioFileTranscriptionPort = {
      transcribeAudioFile: async () => ({
        source: "funasr",
        language: "zh",
        fullText: "真实中文转写",
        segments: [{ start: 0, end: 1, text: "真实中文转写" }]
      })
    };

    const result = await transcribeUploadedAudio({
      audioPath: "storage/audio/video_123.wav",
      title: "demo",
      fallbackText: "fallback",
      transcriber
    });

    expect(result.source).toBe("funasr");
    expect(result.fullText).toBe("真实中文转写");
  });

  it("falls back to provided text when FunASR fails", async () => {
    const transcriber: AudioFileTranscriptionPort = {
      transcribeAudioFile: async () => {
        throw new Error("service unavailable");
      }
    };

    const result = await transcribeUploadedAudio({
      audioPath: "storage/audio/video_123.wav",
      title: "demo",
      fallbackText: "上传时填写的文稿",
      transcriber
    });

    expect(result.source).toBe("fallback");
    expect(result.fullText).toContain("上传时填写的文稿");
    expect(result.segments[0].text).toContain("上传时填写的文稿");
  });
});
