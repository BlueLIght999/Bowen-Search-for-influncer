import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRunRecord } from "../src/application/ports/ModelRunRepositoryPort";
import { LocalJsonModelRunRepository } from "../src/infrastructure/modelRuns/LocalJsonModelRunRepository";

let tempRoot: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

const run: ModelRunRecord = {
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

describe("GET /api/video-analysis-jobs/:jobId/model-runs", () => {
  it("returns persisted model runs for a job", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    const repository = new LocalJsonModelRunRepository(tempRoot);
    await repository.save(run);
    await repository.save({
      ...run,
      id: "run_reasoning_video",
      stage: "reasoning",
      sliceId: undefined,
      model: "fake-temporal-reasoner-v1",
      promptVersion: "fake-reasoning-v1",
      schemaVersion: "multimodal-video-v1",
      cacheKey: "modelrun_456",
      startedAt: "2026-07-11T00:00:01.000Z",
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
    });

    const route = await import("../app/api/video-analysis-jobs/[jobId]/model-runs/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/model-runs"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      jobId: "job_123",
      summary: {
        total: 2,
        completed: 2,
        failed: 0,
        partial: 1,
        cache: {
          hits: 1,
          misses: 1,
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
            balanced: 2
          },
          routes: {
            cloud_frame_text: 2
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
              estimatedCost: 1.25,
              providerProfiles: {
                fake_frame_text: 1
              }
            },
            reasoning: {
              runsWithSelection: 1,
              estimatedCost: 0.75,
              providerProfiles: {
                fake_temporal_reasoning: 1
              }
            },
            evaluation: {
              runsWithSelection: 0,
              estimatedCost: 0,
              providerProfiles: {}
            }
          }
        }
      }
    });
    expect(body.data.modelRuns).toHaveLength(2);
    expect(body.data.modelRuns[0]).toMatchObject({
      id: "run_slice_001",
      cacheKey: "modelrun_123"
    });
  });

  it("returns an empty successful list when no model runs have been persisted", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/model-runs/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_missing/model-runs"),
      { params: Promise.resolve({ jobId: "job_missing" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      jobId: "job_missing",
      modelRuns: [],
      summary: {
        total: 0,
        completed: 0,
        failed: 0,
        partial: 0,
        cache: {
          hits: 0,
          misses: 0,
          savedModelCalls: 0,
          estimatedSkippedModelCalls: 0
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          imageCount: 0,
          frameCount: 0,
          runsWithUsage: 0,
          runsMissingUsage: 0
        },
        selection: {
          runsWithSelection: 0,
          runsMissingSelection: 0,
          estimatedCost: 0,
          cloudUploadRequired: 0,
          cloudUploadAllowed: 0,
          byStage: {
            visually_understanding: {
              runsWithSelection: 0,
              runsMissingSelection: 0
            },
            reasoning: {
              runsWithSelection: 0,
              runsMissingSelection: 0
            },
            evaluation: {
              runsWithSelection: 0,
              runsMissingSelection: 0
            }
          }
        }
      }
    });
  });

  it("returns a structured 400 response for an invalid job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/model-runs/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/!!!/model-runs"),
      { params: Promise.resolve({ jobId: "!!!" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 500 and logs when a persisted model run is corrupted", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await mkdir(join(tempRoot, "model-runs", "job_123"), { recursive: true });
    await writeFile(
      join(tempRoot, "model-runs", "job_123", "run_bad.json"),
      JSON.stringify({
        ...run,
        cacheKey: ""
      }),
      "utf8"
    );

    const route = await import("../app/api/video-analysis-jobs/[jobId]/model-runs/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/model-runs"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SYSTEM_MODEL_RUN_QUERY_FAILED");
    expect(body.traceId).toMatch(/^trace_/);

    const [logLine] = (await readFile(join(tempRoot, "logs", "errors.jsonl"), "utf8"))
      .trim()
      .split("\n");
    expect(JSON.parse(logLine)).toMatchObject({
      traceId: body.traceId,
      jobId: "job_123",
      code: "SYSTEM_MODEL_RUN_QUERY_FAILED",
      stage: "querying_model_runs",
      detail: {
        name: "Error"
      }
    });
  });
});
