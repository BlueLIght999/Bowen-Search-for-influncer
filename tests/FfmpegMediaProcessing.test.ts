import { describe, expect, it } from "vitest";
import { FfmpegAudioExtractor, FfmpegFrameSampler } from "../src/infrastructure/media/FfmpegMediaProcessing";

describe("FfmpegAudioExtractor", () => {
  it("builds an ffmpeg command that extracts mono wav audio", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const extractor = new FfmpegAudioExtractor({
      run: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0, stderr: "" };
      }
    });

    const result = await extractor.extractAudio({
      videoPath: "storage/uploads/demo.mp4",
      outputPath: "storage/audio/demo.wav"
    });

    expect(result.status).toBe("completed");
    expect(result.audioPath).toBe("storage/audio/demo.wav");
    expect(calls[0].command).toBe("ffmpeg");
    expect(calls[0].args).toEqual([
      "-y",
      "-i",
      "storage/uploads/demo.mp4",
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "storage/audio/demo.wav"
    ]);
  });

  it("returns a fallback result when ffmpeg fails", async () => {
    const extractor = new FfmpegAudioExtractor({
      run: async () => ({ exitCode: 1, stderr: "ffmpeg not found" })
    });

    const result = await extractor.extractAudio({
      videoPath: "storage/uploads/demo.mp4",
      outputPath: "storage/audio/demo.wav"
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("ffmpeg not found");
  });
});

describe("FfmpegFrameSampler", () => {
  it("builds an ffmpeg command that samples frames by interval", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const sampler = new FfmpegFrameSampler({
      run: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0, stderr: "" };
      }
    });

    const result = await sampler.sampleFrames({
      videoPath: "storage/uploads/demo.mp4",
      outputPattern: "storage/frames/demo/frame-%03d.jpg",
      everySeconds: 5
    });

    expect(result.status).toBe("completed");
    expect(result.outputPattern).toBe("storage/frames/demo/frame-%03d.jpg");
    expect(calls[0].command).toBe("ffmpeg");
    expect(calls[0].args).toEqual([
      "-y",
      "-i",
      "storage/uploads/demo.mp4",
      "-vf",
      "fps=1/5",
      "-q:v",
      "2",
      "storage/frames/demo/frame-%03d.jpg"
    ]);
  });
});
