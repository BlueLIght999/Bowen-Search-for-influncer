import { describe, expect, it } from "vitest";
import type {
  ModelRunRecord,
  ModelRunRepositoryPort
} from "../src/application/ports/ModelRunRepositoryPort";
import { listModelRunsForJob } from "../src/application/useCases/listModelRunsForJob";

const baseRun: ModelRunRecord = {
  id: "run_slice_001",
  traceId: "trace_123",
  jobId: "job_123",
  stage: "visually_understanding",
  sliceId: "slice_001",
  provider: "fake",
  model: "fake-vision-v1",
  promptVersion: "fake-slice-v1",
  schemaVersion: "multimodal-slice-v1",
  inputHash: "hash_123",
  cacheKey: "modelrun_123",
  startedAt: "2026-07-11T00:00:00.000Z",
  latencyMs: 12,
  retryCount: 0,
  status: "completed",
  partial: false,
  cache: {
    status: "hit",
    savedModelCall: true,
    cachedAt: "2026-07-11T00:00:00.000Z"
  },
  selection: {
    policyMode: "balanced",
    providerProfileId: "fake_frame_text",
    route: "cloud_frame_text",
    effectiveFrameCount: 2,
    effectiveVideoSeconds: 45,
    estimatedCost: 1.25,
    allowCloudUpload: true,
    reason: "Selected cloud_frame_text for balanced quality, cost, and input-size policy."
  },
  usage: {
    inputTokens: 120,
    outputTokens: 32,
    imageCount: 2,
    frameCount: 2
  }
};

describe("listModelRunsForJob", () => {
  it("returns model runs with an audit summary", async () => {
    const repository = createRepository([
      baseRun,
      {
        ...baseRun,
        id: "run_reasoning_video",
        stage: "reasoning",
        sliceId: undefined,
        model: "fake-temporal-reasoner-v1",
        promptVersion: "fake-reasoning-v1",
        schemaVersion: "multimodal-video-v1",
        cacheKey: "modelrun_456",
        latencyMs: 24,
        partial: true,
        cache: {
          status: "miss",
          savedModelCall: false
        },
        selection: {
          policyMode: "balanced",
          providerProfileId: "fake_temporal_reasoning",
          route: "cloud_frame_text",
          effectiveFrameCount: 2,
          effectiveVideoSeconds: 45,
          estimatedCost: 0.75,
          allowCloudUpload: true,
          reason: "Selected cloud_frame_text for balanced quality, cost, and input-size policy."
        },
        usage: {
          inputTokens: 240,
          outputTokens: 96
        }
      }
    ]);

    await expect(
      listModelRunsForJob({
        jobId: "job_123",
        repository
      })
    ).resolves.toEqual({
      jobId: "job_123",
      modelRuns: [
        baseRun,
        {
          ...baseRun,
          id: "run_reasoning_video",
          stage: "reasoning",
          sliceId: undefined,
          model: "fake-temporal-reasoner-v1",
          promptVersion: "fake-reasoning-v1",
          schemaVersion: "multimodal-video-v1",
          cacheKey: "modelrun_456",
          latencyMs: 24,
          partial: true,
          cache: {
            status: "miss",
            savedModelCall: false
          },
          selection: {
            policyMode: "balanced",
            providerProfileId: "fake_temporal_reasoning",
            route: "cloud_frame_text",
            effectiveFrameCount: 2,
            effectiveVideoSeconds: 45,
            estimatedCost: 0.75,
            allowCloudUpload: true,
            reason: "Selected cloud_frame_text for balanced quality, cost, and input-size policy."
          },
          usage: {
            inputTokens: 240,
            outputTokens: 96
          }
        }
      ],
      summary: {
        total: 2,
        completed: 2,
        failed: 0,
        partial: 1,
        stages: {
          visually_understanding: 1,
          reasoning: 1,
          evaluation: 0
        },
        cacheKeys: ["modelrun_123", "modelrun_456"],
        cache: {
          hits: 1,
          misses: 1,
          readFailures: 0,
          writeFailures: 0,
          savedModelCalls: 1,
          estimatedSkippedModelCalls: 1
        },
        usage: {
          inputTokens: 360,
          outputTokens: 128,
          imageCount: 2,
          frameCount: 2,
          runsWithUsage: 2,
          runsMissingUsage: 0
        },
        selection: {
          runsWithSelection: 2,
          runsMissingSelection: 0,
          estimatedCost: 2,
          policyModes: {
            quality: 0,
            balanced: 2,
            local: 0
          },
          routes: {
            cloud_direct_video: 0,
            cloud_frame_text: 2,
            local_vision_language: 0
          },
          providerProfiles: {
            fake_frame_text: 1,
            fake_temporal_reasoning: 1
          },
          cloudUploadRequired: 0,
          cloudUploadAllowed: 2,
          byStage: {
            visually_understanding: {
              runsWithSelection: 1,
              runsMissingSelection: 0,
              estimatedCost: 1.25,
              policyModes: {
                quality: 0,
                balanced: 1,
                local: 0
              },
              routes: {
                cloud_direct_video: 0,
                cloud_frame_text: 1,
                local_vision_language: 0
              },
              providerProfiles: {
                fake_frame_text: 1
              },
              cloudUploadRequired: 0,
              cloudUploadAllowed: 1
            },
            reasoning: {
              runsWithSelection: 1,
              runsMissingSelection: 0,
              estimatedCost: 0.75,
              policyModes: {
                quality: 0,
                balanced: 1,
                local: 0
              },
              routes: {
                cloud_direct_video: 0,
                cloud_frame_text: 1,
                local_vision_language: 0
              },
              providerProfiles: {
                fake_temporal_reasoning: 1
              },
              cloudUploadRequired: 0,
              cloudUploadAllowed: 1
            },
            evaluation: {
              runsWithSelection: 0,
              runsMissingSelection: 0,
              estimatedCost: 0,
              policyModes: {
                quality: 0,
                balanced: 0,
                local: 0
              },
              routes: {
                cloud_direct_video: 0,
                cloud_frame_text: 0,
                local_vision_language: 0
              },
              providerProfiles: {},
              cloudUploadRequired: 0,
              cloudUploadAllowed: 0
            }
          }
        }
      }
    });
  });

  it("keeps repository failures visible to the caller", async () => {
    const repository: ModelRunRepositoryPort = {
      async save() {
        throw new Error("not used");
      },
      async findByJobId() {
        throw new Error("model run store corrupted");
      }
    };

    await expect(
      listModelRunsForJob({
        jobId: "job_123",
        repository
      })
    ).rejects.toThrow("model run store corrupted");
  });
});

function createRepository(runs: ModelRunRecord[]): ModelRunRepositoryPort {
  return {
    async save() {
      throw new Error("not used");
    },
    async findByJobId(jobId) {
      return runs.filter((run) => run.jobId === jobId);
    }
  };
}
