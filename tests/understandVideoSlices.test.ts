import { describe, expect, it, vi } from "vitest";
import type {
  MultimodalSliceUnderstandingRequest,
  MultimodalUnderstandingPort
} from "../src/application/ports/MultimodalUnderstandingPort";
import type {
  CachedSliceUnderstanding,
  SliceUnderstandingCachePort
} from "../src/application/ports/SliceUnderstandingCachePort";
import { buildVideoEvidenceBundle } from "../src/application/useCases/buildVideoEvidenceBundle";
import { understandVideoSlices } from "../src/application/useCases/understandVideoSlices";
import type { SliceVisualObservation } from "../src/domain/multimodalIntelligence/MultimodalUnderstanding";
import { FakeMultimodalUnderstandingClient } from "../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";

describe("understandVideoSlices", () => {
  it("calls the multimodal port once per timeline slice without leaking frame paths", async () => {
    const evidence = createEvidenceFixture();
    const calls: MultimodalSliceUnderstandingRequest[] = [];
    const multimodal: MultimodalUnderstandingPort = {
      understandSlice: vi.fn(async (request) => {
        calls.push(request);
        return {
          status: "completed",
          observation: createObservation(request),
          execution: {
            provider: "test",
            model: "fake-vision",
            promptVersion: "test",
            schemaVersion: "test",
            latencyMs: 12,
            status: "completed",
            partial: false
          }
        };
      })
    };

    const result = await understandVideoSlices({
      evidenceBundle: evidence.bundle,
      frameAssets: evidence.frameAssets,
      multimodal
    });

    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(evidence.bundle.timelineSlices.length);
    expect(calls[0].frameAssets).toEqual([
      expect.objectContaining({
        id: "frame_1",
        path: "storage/frames/frame-001.jpg"
      })
    ]);
    expect(result.observations).toHaveLength(2);
    expect(result.coverage.coverageRatio).toBe(1);
    expect(JSON.stringify(result.observations)).not.toContain("storage/frames");
  });

  it("keeps successful slice observations when one slice fails", async () => {
    const evidence = createEvidenceFixture();
    const multimodal: MultimodalUnderstandingPort = {
      understandSlice: vi.fn(async (request) => {
        if (request.slice.id === "slice_2") {
          return {
            status: "failed",
            reason: "model timeout",
            retryable: true
          };
        }

        return {
          status: "completed",
          observation: createObservation(request),
          execution: {
            provider: "test",
            model: "fake-vision",
            promptVersion: "test",
            schemaVersion: "test",
            latencyMs: 12,
            status: "completed",
            partial: false
          }
        };
      })
    };

    const result = await understandVideoSlices({
      evidenceBundle: evidence.bundle,
      frameAssets: evidence.frameAssets,
      multimodal
    });

    expect(result.status).toBe("partial");
    expect(result.observations.map((observation) => observation.sliceId)).toEqual([
      "slice_1"
    ]);
    expect(result.failures).toEqual([
      {
        sliceId: "slice_2",
        code: "SOURCE_MULTIMODAL_MODEL_UNAVAILABLE",
        reason: "model timeout",
        retryable: true
      }
    ]);
    expect(result.coverage.coveredDurationMs).toBe(20_000);
    expect(result.coverage.coverageRatio).toBeCloseTo(2 / 3);
  });

  it("rejects model observations that do not cite evidence", async () => {
    const evidence = createEvidenceFixture();
    const multimodal: MultimodalUnderstandingPort = {
      understandSlice: vi.fn(async (request) => ({
        status: "completed",
        observation: {
          ...createObservation(request),
          claims: [
            {
              id: "claim_without_evidence",
              type: "observation",
              statement: "Unsupported visual claim",
              confidence: 0.9,
              evidenceRefs: [],
              knowledgeIds: []
            }
          ]
        } as SliceVisualObservation,
        execution: {
          provider: "test",
          model: "fake-vision",
          promptVersion: "test",
          schemaVersion: "test",
          latencyMs: 12,
          status: "completed",
          partial: false
        }
      }))
    };

    const result = await understandVideoSlices({
      evidenceBundle: evidence.bundle,
      frameAssets: evidence.frameAssets,
      multimodal
    });

    expect(result.status).toBe("failed");
    expect(result.observations).toEqual([]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toMatchObject({
      code: "ANALYSIS_MULTIMODAL_OUTPUT_INVALID"
    });
  });

  it("runs a deterministic fake adapter for local demonstrations", async () => {
    const evidence = createEvidenceFixture();

    const result = await understandVideoSlices({
      evidenceBundle: evidence.bundle,
      frameAssets: evidence.frameAssets,
      multimodal: new FakeMultimodalUnderstandingClient()
    });

    expect(result.status).toBe("completed");
    expect(result.executions.every((execution) => execution.provider === "fake")).toBe(true);
    expect(result.observations[0]).toMatchObject({
      sliceId: "slice_1",
      subtitleLegibility: "clear",
      confidence: 0.72
    });
    expect(result.observations[0].claims[0]).toMatchObject({
      type: "observation",
      evidenceRefs: [
        expect.objectContaining({
          transcriptSegmentIds: expect.arrayContaining(["transcript_1"])
        })
      ]
    });
  });

  it("reuses cached slice observations and skips duplicate model calls", async () => {
    const evidence = createEvidenceFixture();
    const cachedObservation = createObservationForSlice(
      evidence.bundle.timelineSlices[0]
    );
    let cacheReads = 0;
    const cache: SliceUnderstandingCachePort = {
      findByCacheKey: vi.fn(async (cacheKey) => {
        cacheReads += 1;
        if (cacheReads > 1) {
          return null;
        }
        return {
          cacheKey,
          inputHash: "cached_input_hash",
          observation: cachedObservation,
          execution: {
            provider: "test",
            model: "fake-vision",
            promptVersion: "test",
            schemaVersion: "test",
            latencyMs: 3,
            status: "completed",
            partial: false
          },
          cachedAt: "2026-07-11T00:00:00.000Z"
        } satisfies CachedSliceUnderstanding;
      }),
      save: vi.fn(async () => undefined)
    };
    const calls: string[] = [];
    const multimodal: MultimodalUnderstandingPort = {
      getSliceModelProfile() {
        return {
          provider: "test",
          model: "fake-vision",
          promptVersion: "test",
          schemaVersion: "test"
        };
      },
      understandSlice: vi.fn(async (request) => {
        calls.push(request.slice.id);
        return {
          status: "completed",
          observation: createObservation(request),
          execution: {
            provider: "test",
            model: "fake-vision",
            promptVersion: "test",
            schemaVersion: "test",
            latencyMs: 12,
            status: "completed",
            partial: false
          }
        };
      })
    };

    const result = await understandVideoSlices({
      evidenceBundle: evidence.bundle,
      frameAssets: evidence.frameAssets,
      multimodal,
      cache,
      now: () => "2026-07-11T00:00:01.000Z"
    });

    expect(result.status).toBe("completed");
    expect(calls).toEqual(["slice_2"]);
    expect(result.observations.map((observation) => observation.sliceId)).toEqual([
      "slice_1",
      "slice_2"
    ]);
    expect(result.cacheStats).toEqual({
      hits: 1,
      misses: 1,
      writes: 1,
      readFailures: 0,
      writeFailures: 0
    });
    expect(result.cacheOutcomes).toEqual([
      expect.objectContaining({
        sliceId: "slice_1",
        status: "hit",
        cacheKey: expect.stringMatching(/^modelrun_/),
        savedModelCall: true,
        cachedAt: "2026-07-11T00:00:00.000Z"
      }),
      expect.objectContaining({
        sliceId: "slice_2",
        status: "miss",
        cacheKey: expect.stringMatching(/^modelrun_/),
        savedModelCall: false
      })
    ]);
    expect(cache.save).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: expect.stringMatching(/^modelrun_/),
        inputHash: expect.any(String),
        cachedAt: "2026-07-11T00:00:01.000Z"
      })
    );
  });
});

function createEvidenceFixture() {
  return buildVideoEvidenceBundle({
    jobId: "job_123",
    videoId: "video_123",
    durationSeconds: 30,
    transcription: {
      source: "funasr",
      language: "zh",
      duration: 30,
      fullText: "Opening conflict. Reversal ending.",
      segments: [
        { start: 0, end: 10, text: "Opening conflict." },
        { start: 10, end: 30, text: "Reversal ending." }
      ]
    },
    frames: [
      {
        index: 1,
        timestampSeconds: 0,
        path: "storage/frames/frame-001.jpg"
      },
      {
        index: 2,
        timestampSeconds: 25,
        path: "storage/frames/frame-002.jpg"
      }
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
          text: "Hero returns",
          confidence: 0.9
        }
      ]
    }
  });
}

function createObservation(
  request: MultimodalSliceUnderstandingRequest
): SliceVisualObservation {
  return createObservationForSlice(request.slice);
}

function createObservationForSlice(
  slice: MultimodalSliceUnderstandingRequest["slice"]
): SliceVisualObservation {
  return {
    id: `observation_${slice.id}`,
    sliceId: slice.id,
    startMs: slice.startMs,
    endMs: slice.endMs,
    summary: `Observed ${slice.id}`,
    visibleSubjects: ["main character"],
    actions: ["conflict setup"],
    shotTypes: ["medium shot"],
    subtitleLegibility: slice.ocrEvidenceIds.length > 0 ? "clear" : "not_observed",
    aiDramaSignals: ["conflict"],
    confidence: 0.8,
    claims: [
      {
        id: `claim_${slice.id}`,
        type: "observation",
        statement: `Evidence-backed observation for ${slice.id}`,
        confidence: 0.8,
        evidenceRefs: [
          {
            startMs: slice.startMs,
            endMs: slice.endMs,
            frameIds: slice.frameIds,
            transcriptSegmentIds: slice.transcriptSegmentIds,
            ocrEvidenceIds: slice.ocrEvidenceIds
          }
        ],
        knowledgeIds: []
      }
    ]
  };
}
