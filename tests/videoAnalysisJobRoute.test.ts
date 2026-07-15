import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoAnalysisJobAggregate } from "../src/domain/jobs/VideoAnalysisJob";
import { LocalJsonJobRepository } from "../src/infrastructure/jobs/LocalJsonJobRepository";

let tempRoot: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("GET /api/video-analysis-jobs/:jobId", () => {
  it("returns a persisted analysis job", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    const repository = new LocalJsonJobRepository(tempRoot);
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });
    await repository.save(job.toSnapshot());

    const route = await import("../app/api/video-analysis-jobs/[jobId]/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        id: "job_123",
        videoId: "video_123",
        status: "uploaded",
        progressPercent: 5,
        currentStage: "uploaded",
        isTerminal: false
      }
    });
  });

  it("returns a structured 404 response for a missing job", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/missing"),
      { params: Promise.resolve({ jobId: "missing" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RESOURCE_VIDEO_ANALYSIS_JOB_NOT_FOUND");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 400 response for an invalid job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/!!!"),
      { params: Promise.resolve({ jobId: "!!!" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 500 response when a persisted job snapshot has an invalid status", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-job-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await mkdir(join(tempRoot, "jobs"), { recursive: true });
    await writeFile(
      join(tempRoot, "jobs", "job_corrupt.json"),
      JSON.stringify({
        id: "job_corrupt",
        videoId: "video_123",
        status: "unknown_status",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
        history: [
          {
            status: "unknown_status",
            occurredAt: "2026-07-10T00:00:00.000Z"
          }
        ]
      }),
      "utf8"
    );

    const route = await import("../app/api/video-analysis-jobs/[jobId]/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_corrupt"),
      { params: Promise.resolve({ jobId: "job_corrupt" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED");
    expect(body.traceId).toMatch(/^trace_/);

    const [logLine] = (await readFile(join(tempRoot, "logs", "errors.jsonl"), "utf8"))
      .trim()
      .split("\n");
    expect(JSON.parse(logLine)).toMatchObject({
      traceId: body.traceId,
      jobId: "job_corrupt",
      code: "SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED",
      stage: "querying_job",
      detail: {
        name: "InvalidJobSnapshotError"
      }
    });
  });
});
