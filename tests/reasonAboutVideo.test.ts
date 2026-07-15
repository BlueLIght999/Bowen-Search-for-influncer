import { describe, expect, it, vi } from "vitest";
import type {
  ContentReasoningPort,
  ContentReasoningRequest
} from "../src/application/ports/ContentReasoningPort";
import { buildVideoEvidenceBundle } from "../src/application/useCases/buildVideoEvidenceBundle";
import { reasonAboutVideo } from "../src/application/useCases/reasonAboutVideo";
import { understandVideoSlices } from "../src/application/useCases/understandVideoSlices";
import type {
  MultimodalUnderstanding,
  MultimodalVideoContentType
} from "../src/domain/multimodalIntelligence/MultimodalUnderstanding";
import type { ReasoningClaim } from "../src/domain/multimodalIntelligence/VideoEvidence";
import { FakeContentReasoningClient } from "../src/infrastructure/multimodal/FakeContentReasoningClient";
import { FakeMultimodalUnderstandingClient } from "../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";

describe("reasonAboutVideo", () => {
  it("turns slice observations into a validated video-level understanding", async () => {
    const input = await createReasoningFixture();
    const calls: ContentReasoningRequest[] = [];
    const reasoner: ContentReasoningPort = {
      reason: vi.fn(async (request) => {
        calls.push(request);
        return {
          status: "completed",
          understanding: createUnderstanding(request)
        };
      })
    };

    const result = await reasonAboutVideo({
      ...input,
      reasoner
    });

    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(1);
    expect(calls[0].sliceObservations).toHaveLength(2);
    expect(result.understanding).toMatchObject({
      jobId: "job_123",
      videoId: "video_123",
      contentType: "ai_drama",
      execution: {
        provider: "test"
      }
    });
    expect(result.understanding?.narrative.hook?.evidenceRefs[0]).toMatchObject({
      transcriptSegmentIds: expect.arrayContaining(["transcript_1"])
    });
  });

  it("rejects reasoning output that does not cite evidence", async () => {
    const input = await createReasoningFixture();
    const reasoner: ContentReasoningPort = {
      reason: vi.fn(async (request) => ({
        status: "completed",
        understanding: {
          ...createUnderstanding(request),
          narrative: {
            premise: {
              ...createClaim("unsupported_premise", request),
              evidenceRefs: []
            }
          }
        } as MultimodalUnderstanding
      }))
    };

    const result = await reasonAboutVideo({
      ...input,
      reasoner
    });

    expect(result).toMatchObject({
      status: "failed",
      code: "ANALYSIS_MULTIMODAL_OUTPUT_INVALID"
    });
  });

  it("returns an evidence-insufficient failure when no slice observations are available", async () => {
    const input = await createReasoningFixture();

    const result = await reasonAboutVideo({
      evidenceBundle: input.evidenceBundle,
      sliceObservations: [],
      coverage: {
        coveredRanges: [],
        coveredDurationMs: 0,
        coverageRatio: 0
      },
      reasoner: new FakeContentReasoningClient()
    });

    expect(result).toEqual({
      status: "failed",
      code: "ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT",
      reason: "Video reasoning requires at least one validated slice observation."
    });
  });

  it("runs a deterministic fake reasoning adapter with AI drama fields", async () => {
    const input = await createReasoningFixture();

    const result = await reasonAboutVideo({
      ...input,
      reasoner: new FakeContentReasoningClient()
    });

    expect(result.status).toBe("completed");
    expect(result.understanding?.execution.provider).toBe("fake");
    expect(result.understanding?.aiDrama).toMatchObject({
      conflict: expect.any(Array),
      reversals: expect.any(Array),
      seriesPotential: expect.objectContaining({
        type: "inference"
      })
    });
  });
});

async function createReasoningFixture() {
  const evidence = buildVideoEvidenceBundle({
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
  const sliceUnderstanding = await understandVideoSlices({
    evidenceBundle: evidence.bundle,
    frameAssets: evidence.frameAssets,
    multimodal: new FakeMultimodalUnderstandingClient()
  });

  return {
    evidenceBundle: evidence.bundle,
    sliceObservations: sliceUnderstanding.observations,
    coverage: sliceUnderstanding.coverage
  };
}

function createUnderstanding(
  request: ContentReasoningRequest,
  contentType: MultimodalVideoContentType = "ai_drama"
): MultimodalUnderstanding {
  const hook = createClaim("hook", request);
  const conflict = createClaim("conflict", request);

  return {
    jobId: request.evidenceBundle.jobId,
    videoId: request.evidenceBundle.videoId,
    contentType,
    scenes: request.sliceObservations,
    narrative: {
      premise: createClaim("premise", request),
      hook,
      conflict,
      reversal: createClaim("reversal", request),
      ending: createClaim("ending", request)
    },
    visualCraft: {
      composition: [],
      shotVariety: [createClaim("shot_variety", request)],
      continuity: [],
      subtitleLegibility: [createClaim("subtitle_legibility", request)],
      styleConsistency: [],
      pacing: [createClaim("pacing", request)]
    },
    aiDrama: {
      conflict: [conflict],
      reversals: [createClaim("ai_reversal", request)],
      styleDrift: [],
      cliffhanger: createClaim("cliffhanger", request),
      seriesPotential: createClaim("series_potential", request)
    },
    evidenceCoverage: request.coverage,
    execution: {
      provider: "test",
      model: "fake-reasoner",
      promptVersion: "test",
      schemaVersion: "test",
      latencyMs: 20,
      status: "completed",
      partial: false
    }
  };
}

function createClaim(
  id: string,
  request: ContentReasoningRequest,
  type: ReasoningClaim["type"] = "inference"
): ReasoningClaim {
  const firstObservation = request.sliceObservations[0];
  const firstReference = firstObservation.claims[0].evidenceRefs[0];

  return {
    id,
    type,
    statement: `Reasoned ${id}`,
    confidence: 0.78,
    evidenceRefs: [firstReference],
    knowledgeIds: []
  };
}
