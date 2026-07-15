import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelRunRecord } from "../src/application/ports/ModelRunRepositoryPort";
import { LocalJsonModelRunRepository } from "../src/infrastructure/modelRuns/LocalJsonModelRunRepository";

let tempRoot: string | undefined;

afterEach(async () => {
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
  cacheKey: "cache_123",
  startedAt: "2026-07-11T00:00:00.000Z",
  latencyMs: 12,
  retryCount: 0,
  status: "completed",
  partial: false,
  selection: {
    policyMode: "balanced",
    providerProfileId: "fake_frame_text",
    route: "cloud_frame_text",
    effectiveFrameCount: 1,
    effectiveVideoSeconds: 45,
    estimatedCost: 0,
    allowCloudUpload: true,
    reason: "Selected cloud_frame_text for balanced quality, cost, and input-size policy."
  }
};

describe("LocalJsonModelRunRepository", () => {
  it("persists and restores model runs by job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-"));
    const repository = new LocalJsonModelRunRepository(tempRoot);

    await repository.save(run);
    await repository.save({
      ...run,
      id: "run_reasoning",
      stage: "reasoning",
      sliceId: undefined,
      model: "fake-temporal-reasoner-v1",
      promptVersion: "fake-reasoning-v1",
      schemaVersion: "multimodal-video-v1"
    });

    await expect(repository.findByJobId("job_123")).resolves.toEqual([
      run,
      {
        ...run,
        id: "run_reasoning",
        stage: "reasoning",
        sliceId: undefined,
        model: "fake-temporal-reasoner-v1",
        promptVersion: "fake-reasoning-v1",
        schemaVersion: "multimodal-video-v1"
      }
    ]);
  });

  it("returns an empty list for a job without model runs", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-"));
    const repository = new LocalJsonModelRunRepository(tempRoot);

    await expect(repository.findByJobId("missing_job")).resolves.toEqual([]);
  });

  it("rejects unsafe job ids and malformed run records", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-model-runs-"));
    const repository = new LocalJsonModelRunRepository(tempRoot);

    await expect(
      repository.save({
        ...run,
        jobId: "job/123"
      })
    ).rejects.toThrow("Job id can only contain letters, numbers, underscores, and hyphens.");

    await expect(
      repository.save({
        ...run,
        latencyMs: -1
      })
    ).rejects.toThrow("Model run latency must be a non-negative finite number.");

    await expect(
      repository.save({
        ...run,
        selection: {
          ...run.selection,
          effectiveFrameCount: -1
        }
      })
    ).rejects.toThrow("Model run selection effective frame count must be a non-negative integer.");
  });
});
