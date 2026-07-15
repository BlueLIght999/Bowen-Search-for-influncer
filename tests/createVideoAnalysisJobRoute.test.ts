import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalVideoStorage } from "../src/infrastructure/storage/LocalVideoStorage";
import { localBackgroundTaskScheduler } from "../src/infrastructure/jobs/LocalBackgroundTaskScheduler";

let tempRoot: string | undefined;

afterEach(async () => {
  await localBackgroundTaskScheduler.waitForIdle();
  vi.unstubAllEnvs();
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("POST /api/video-analysis-jobs", () => {
  it("accepts an existing asset and immediately returns an uploaded job", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-create-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await new LocalVideoStorage(tempRoot).saveVideo({
      id: "video_existing",
      fileName: "Existing Drama.mp4",
      data: Buffer.from("fake video")
    });
    const route = await import("../app/api/video-analysis-jobs/route");

    const response = await route.POST(
      new Request("http://localhost/api/video-analysis-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetId: "video_existing",
          title: "Existing Drama",
          transcript: "The heroine returns with a secret identity."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.asset.id).toBe("video_existing");
    expect(body.data.asset.fileName).toBe("Existing Drama.mp4");
    expect(body.data.job.id).toMatch(/^job_/);
    expect(body.data.job.status).toBe("uploaded");
    expect(body.data.analysis).toBeUndefined();
  });

  it("returns 404 without creating a job when the asset is missing", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-create-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    const route = await import("../app/api/video-analysis-jobs/route");

    const response = await route.POST(
      new Request("http://localhost/api/video-analysis-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: "video_missing" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "RESOURCE_VIDEO_ASSET_NOT_FOUND"
      }
    });
  });
});
