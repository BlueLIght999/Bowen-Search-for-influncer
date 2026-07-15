import { describe, expect, it } from "vitest";
import { buildVideoEvidenceBundle } from "../src/application/useCases/buildVideoEvidenceBundle";

describe("buildVideoEvidenceBundle", () => {
  it("aligns transcription, sampled frames, and OCR into timeline slices", () => {
    const result = buildVideoEvidenceBundle({
      jobId: "job_123",
      videoId: "video_123",
      durationSeconds: 45,
      transcription: {
        source: "funasr",
        language: "zh",
        duration: 45,
        fullText: "开场冲突。身份反转。",
        segments: [
          { start: 0, end: 8, text: "开场冲突。" },
          { start: 8, end: 20, text: "身份反转。" }
        ]
      },
      frames: [
        { index: 1, timestampSeconds: 0, path: "storage/frames/frame-001.jpg" },
        { index: 2, timestampSeconds: 12, path: "storage/frames/frame-002.jpg" },
        { index: 3, timestampSeconds: 32, path: "storage/frames/frame-003.jpg" }
      ],
      frameSampling: {
        status: "completed",
        everySeconds: 5
      },
      ocr: {
        status: "completed",
        source: "paddleocr",
        signals: [
          {
            frameIndex: 1,
            text: "她竟然回来了",
            confidence: 0.95
          }
        ]
      }
    });

    expect(result.bundle.coverage.coverageRatio).toBe(1);
    expect(result.bundle.timelineSlices).toHaveLength(3);
    expect(result.bundle.ocrEvidence[0]).toMatchObject({
      frameId: "frame_1",
      timestampMs: 0,
      text: "她竟然回来了"
    });
    expect(result.frameAssets).toEqual([
      {
        id: "frame_1",
        frameIndex: 1,
        timestampMs: 0,
        path: "storage/frames/frame-001.jpg"
      },
      {
        id: "frame_2",
        frameIndex: 2,
        timestampMs: 12_000,
        path: "storage/frames/frame-002.jpg"
      },
      {
        id: "frame_3",
        frameIndex: 3,
        timestampMs: 32_000,
        path: "storage/frames/frame-003.jpg"
      }
    ]);
    expect(JSON.stringify(result.bundle)).not.toContain("storage/frames");
  });

  it("expands a zero-length fallback transcript across the video duration", () => {
    const result = buildVideoEvidenceBundle({
      jobId: "job_123",
      videoId: "video_123",
      durationSeconds: 20,
      transcription: {
        source: "fallback",
        language: "zh",
        fullText: "用户提供的文稿",
        segments: [{ start: 0, end: 0, text: "用户提供的文稿" }]
      },
      frames: [],
      frameSampling: {
        status: "failed",
        everySeconds: 5,
        reason: "ffmpeg unavailable"
      },
      ocr: {
        status: "skipped",
        source: "fallback",
        signals: [],
        reason: "No sampled frames are available for OCR."
      }
    });

    expect(result.bundle.transcriptSegments[0]).toMatchObject({
      startMs: 0,
      endMs: 20_000,
      text: "用户提供的文稿"
    });
    expect(result.bundle.modalities).toEqual({
      transcript: {
        status: "available",
        reason: "Fallback transcript was used."
      },
      frames: {
        status: "failed",
        reason: "ffmpeg unavailable"
      },
      ocr: {
        status: "missing",
        reason: "No sampled frames are available for OCR."
      }
    });
  });

  it("rejects OCR signals that reference frames outside the sampled set", () => {
    expect(() =>
      buildVideoEvidenceBundle({
        jobId: "job_123",
        videoId: "video_123",
        durationSeconds: 20,
        transcription: {
          source: "funasr",
          fullText: "文稿",
          segments: [{ start: 0, end: 5, text: "文稿" }]
        },
        frames: [
          { index: 1, timestampSeconds: 0, path: "frame-001.jpg" }
        ],
        frameSampling: {
          status: "completed",
          everySeconds: 5
        },
        ocr: {
          status: "completed",
          source: "paddleocr",
          signals: [
            { frameIndex: 2, text: "不存在的帧", confidence: 0.8 }
          ]
        }
      })
    ).toThrow("OCR signal references an unknown sampled frame: 2");
  });

  it("uses bounded 20-second slices and marks the final slice as ending", () => {
    const result = buildVideoEvidenceBundle({
      jobId: "job_123",
      videoId: "video_123",
      durationSeconds: 55,
      transcription: {
        source: "funasr",
        fullText: "完整文稿",
        segments: [{ start: 0, end: 55, text: "完整文稿" }]
      },
      frames: [
        { index: 1, timestampSeconds: 0, path: "frame-001.jpg" },
        { index: 2, timestampSeconds: 25, path: "frame-002.jpg" },
        { index: 3, timestampSeconds: 50, path: "frame-003.jpg" }
      ],
      frameSampling: {
        status: "completed",
        everySeconds: 5
      },
      ocr: {
        status: "completed",
        source: "paddleocr",
        signals: []
      }
    });

    expect(
      result.bundle.timelineSlices.map((slice) => ({
        startMs: slice.startMs,
        endMs: slice.endMs,
        samplingReason: slice.samplingReason
      }))
    ).toEqual([
      { startMs: 0, endMs: 20_000, samplingReason: "opening" },
      { startMs: 20_000, endMs: 40_000, samplingReason: "interval" },
      { startMs: 40_000, endMs: 55_000, samplingReason: "ending" }
    ]);
  });
});
