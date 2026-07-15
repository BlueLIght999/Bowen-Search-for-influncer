import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CachedSliceUnderstanding } from "../src/application/ports/SliceUnderstandingCachePort";
import { LocalJsonSliceUnderstandingCache } from "../src/infrastructure/modelRuns/LocalJsonSliceUnderstandingCache";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

const cached: CachedSliceUnderstanding = {
  cacheKey: "modelrun_123",
  inputHash: "hash_123",
  observation: {
    id: "observation_slice_1",
    sliceId: "slice_1",
    startMs: 0,
    endMs: 10_000,
    summary: "Cached observation",
    visibleSubjects: ["main character"],
    actions: ["conflict setup"],
    shotTypes: ["medium shot"],
    subtitleLegibility: "clear",
    aiDramaSignals: ["conflict"],
    confidence: 0.8,
    claims: [
      {
        id: "claim_slice_1",
        type: "observation",
        statement: "Evidence-backed observation",
        confidence: 0.8,
        evidenceRefs: [
          {
            startMs: 0,
            endMs: 10_000,
            frameIds: ["frame_1"],
            transcriptSegmentIds: ["transcript_1"],
            ocrEvidenceIds: ["ocr_1"]
          }
        ],
        knowledgeIds: []
      }
    ]
  },
  execution: {
    provider: "fake",
    model: "fake-frame-text-v1",
    promptVersion: "fake-slice-v1",
    schemaVersion: "multimodal-slice-v1",
    latencyMs: 8,
    status: "completed",
    partial: false
  },
  cachedAt: "2026-07-11T00:00:00.000Z"
};

describe("LocalJsonSliceUnderstandingCache", () => {
  it("persists and restores cached slice understanding records", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-slice-cache-"));
    const cache = new LocalJsonSliceUnderstandingCache(tempRoot);

    await cache.save(cached);

    await expect(cache.findByCacheKey("modelrun_123")).resolves.toEqual(cached);
  });

  it("returns null for a missing cache key", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-slice-cache-"));
    const cache = new LocalJsonSliceUnderstandingCache(tempRoot);

    await expect(cache.findByCacheKey("modelrun_missing")).resolves.toBeNull();
  });

  it("rejects unsafe cache keys and malformed records", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-slice-cache-"));
    const cache = new LocalJsonSliceUnderstandingCache(tempRoot);

    await expect(
      cache.save({
        ...cached,
        cacheKey: "../bad"
      })
    ).rejects.toThrow("Slice cache key can only contain letters, numbers, underscores, and hyphens.");

    await expect(
      cache.save({
        ...cached,
        cachedAt: "not-a-date"
      })
    ).rejects.toThrow("Slice cache timestamp must be a valid ISO string.");
  });
});
