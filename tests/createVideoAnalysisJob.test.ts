import { describe, expect, it, vi } from "vitest";
import type { Category } from "../src/domain/types";
import type { BackgroundTaskSchedulerPort } from "../src/application/ports/BackgroundTaskSchedulerPort";
import type { JobRepositoryPort } from "../src/application/ports/JobRepositoryPort";
import type { VideoStoragePort } from "../src/application/ports/VideoStoragePort";
import {
  createVideoAnalysisJob,
  type CreateVideoAnalysisJobRequest
} from "../src/application/useCases/createVideoAnalysisJob";

const request: CreateVideoAnalysisJobRequest = {
  assetId: "video_123",
  category: "AI科技" as Category,
  hotspot: "AI drama",
  title: "A new episode",
  fallbackTranscript: "The heroine returns.",
  commentSignals: "",
  creatorPositioning: "AI drama creators",
  referenceTexts: []
};

function createDependencies() {
  const storedAsset = {
    id: "video_123",
    fileName: "demo.mp4",
    storagePath: "storage/uploads/video_123-demo.mp4"
  };
  const storage: VideoStoragePort = {
    saveVideo: vi.fn(),
    findVideoById: vi.fn(async () => storedAsset)
  };
  const jobRepository: JobRepositoryPort = {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async () => null)
  };
  let scheduledTask: (() => Promise<void>) | undefined;
  const scheduler: BackgroundTaskSchedulerPort = {
    schedule: vi.fn((task) => {
      scheduledTask = task.execute;
    })
  };
  const runJob = vi.fn(async () => undefined);

  return {
    storedAsset,
    storage,
    jobRepository,
    scheduler,
    runJob,
    getScheduledTask: () => scheduledTask
  };
}

describe("createVideoAnalysisJob", () => {
  it("persists an uploaded job and returns before background analysis runs", async () => {
    const dependencies = createDependencies();

    const result = await createVideoAnalysisJob({
      request,
      traceId: "trace_123",
      createId: (prefix) => `${prefix}_generated`,
      now: () => "2026-07-10T00:00:00.000Z",
      ...dependencies
    });

    expect(result).toMatchObject({
      asset: dependencies.storedAsset,
      job: {
        id: "job_generated",
        videoId: "video_123",
        workflowVersion: 2,
        status: "uploaded"
      }
    });
    expect(dependencies.jobRepository.save).toHaveBeenCalledWith(result.job);
    expect(dependencies.scheduler.schedule).toHaveBeenCalledWith({
      id: "job_generated",
      execute: expect.any(Function)
    });
    expect(dependencies.runJob).not.toHaveBeenCalled();

    await dependencies.getScheduledTask()?.();

    expect(dependencies.runJob).toHaveBeenCalledWith({
      request: {
        ...request,
        jobId: "job_generated",
        fileName: "demo.mp4",
        storedAsset: dependencies.storedAsset
      },
      initialJob: result.job,
      traceId: "trace_123"
    });
  });

  it("rejects a missing video asset before persisting or scheduling a job", async () => {
    const dependencies = createDependencies();
    dependencies.storage.findVideoById = vi.fn(async () => null);

    await expect(
      createVideoAnalysisJob({
        request,
        traceId: "trace_123",
        createId: (prefix) => `${prefix}_generated`,
        now: () => "2026-07-10T00:00:00.000Z",
        ...dependencies
      })
    ).rejects.toThrow("Video asset not found");
    expect(dependencies.jobRepository.save).not.toHaveBeenCalled();
    expect(dependencies.scheduler.schedule).not.toHaveBeenCalled();
  });

  it("marks the uploaded job as failed when scheduling cannot start", async () => {
    const dependencies = createDependencies();
    const schedulingError = new Error("scheduler unavailable");
    dependencies.scheduler.schedule = vi.fn(() => {
      throw schedulingError;
    });

    await expect(
      createVideoAnalysisJob({
        request,
        traceId: "trace_123",
        createId: (prefix) => `${prefix}_generated`,
        now: vi
          .fn()
          .mockReturnValueOnce("2026-07-10T00:00:00.000Z")
          .mockReturnValueOnce("2026-07-10T00:00:01.000Z"),
        ...dependencies
      })
    ).rejects.toThrow(schedulingError);

    expect(dependencies.jobRepository.save).toHaveBeenCalledTimes(2);
    expect(dependencies.jobRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "job_generated",
        status: "uploaded"
      })
    );
    expect(dependencies.jobRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "job_generated",
        status: "failed",
        failure: {
          stage: "uploaded",
          code: "SYSTEM_VIDEO_ANALYSIS_SCHEDULING_FAILED",
          message: "scheduler unavailable",
          occurredAt: "2026-07-10T00:00:01.000Z"
        }
      })
    );
    expect(dependencies.runJob).not.toHaveBeenCalled();
  });

  it("preserves the scheduling error when persisting the failed scheduling snapshot is unavailable", async () => {
    const dependencies = createDependencies();
    const schedulingError = new Error("scheduler unavailable");
    dependencies.scheduler.schedule = vi.fn(() => {
      throw schedulingError;
    });
    dependencies.jobRepository.save = vi.fn(async (job) => {
      if (job.status === "failed") {
        throw new Error("job store is read-only");
      }
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        createVideoAnalysisJob({
          request,
          traceId: "trace_123",
          createId: (prefix) => `${prefix}_generated`,
          now: vi
            .fn()
            .mockReturnValueOnce("2026-07-10T00:00:00.000Z")
            .mockReturnValueOnce("2026-07-10T00:00:01.000Z"),
          ...dependencies
        })
      ).rejects.toThrow(schedulingError);

      expect(dependencies.jobRepository.save).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist failed video analysis scheduling job.",
        expect.objectContaining({
          job: expect.objectContaining({
            id: "job_generated",
            status: "failed"
          }),
          persistenceError: expect.objectContaining({
            message: "job store is read-only"
          })
        })
      );
      expect(dependencies.runJob).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
