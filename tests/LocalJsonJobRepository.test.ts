import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VideoAnalysisJobAggregate } from "../src/domain/jobs/VideoAnalysisJob";
import { LocalJsonJobRepository } from "../src/infrastructure/jobs/LocalJsonJobRepository";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("LocalJsonJobRepository", () => {
  it("persists and restores the complete job history", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-jobs-"));
    const repository = new LocalJsonJobRepository(tempRoot);
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });
    job.advance("extracting_audio", "2026-07-10T00:00:01.000Z");

    await repository.save(job.toSnapshot());
    const restored = await repository.findById("job_123");

    expect(restored).toEqual(job.toSnapshot());
  });

  it("returns null when a job does not exist", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-jobs-"));
    const repository = new LocalJsonJobRepository(tempRoot);

    await expect(repository.findById("missing")).resolves.toBeNull();
  });

  it("rejects unsafe job ids instead of silently sanitizing them", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-jobs-"));
    const repository = new LocalJsonJobRepository(tempRoot);
    const job = VideoAnalysisJobAggregate.create({
      id: "job/123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    await expect(repository.save(job.toSnapshot())).rejects.toThrow(
      "Job id can only contain letters, numbers, underscores, and hyphens."
    );
    await expect(repository.findById("job/123")).rejects.toThrow(
      "Job id can only contain letters, numbers, underscores, and hyphens."
    );
  });

  it("rejects persisted job snapshots with an unknown status", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-jobs-"));
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
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          }
        ]
      }),
      "utf8"
    );
    const repository = new LocalJsonJobRepository(tempRoot);

    await expect(repository.findById("job_corrupt")).rejects.toThrow(
      "Invalid video analysis job snapshot status: unknown_status"
    );
  });

  it("rejects saving job snapshots with an unknown status", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-jobs-"));
    const repository = new LocalJsonJobRepository(tempRoot);

    await expect(
      repository.save({
        id: "job_corrupt",
        videoId: "video_123",
        status: "unknown_status",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          }
        ]
      } as never)
    ).rejects.toThrow("Invalid video analysis job snapshot status: unknown_status");
  });
});
