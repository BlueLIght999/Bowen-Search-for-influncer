import { randomUUID } from "node:crypto";
import type { BackgroundTaskSchedulerPort } from "../ports/BackgroundTaskSchedulerPort";
import type { JobRepositoryPort } from "../ports/JobRepositoryPort";
import type { VideoStoragePort } from "../ports/VideoStoragePort";
import type {
  RunVideoAnalysisJobRequest,
} from "./runVideoAnalysisJob";
import type { Category } from "../../domain/types";
import {
  VideoAnalysisJobAggregate,
  type VideoAnalysisJobSnapshot
} from "../../domain/jobs/VideoAnalysisJob";

export interface CreateVideoAnalysisJobRequest {
  assetId: string;
  category: Category;
  hotspot: string;
  title: string;
  fallbackTranscript: string;
  commentSignals: string;
  creatorPositioning: string;
  referenceTexts: string[];
}

export type RunExistingVideoAnalysisJob = (options: {
  request: RunVideoAnalysisJobRequest;
  initialJob: VideoAnalysisJobSnapshot;
  traceId: string;
}) => Promise<unknown>;

export interface CreateVideoAnalysisJobResult {
  asset: {
    id: string;
    fileName: string;
    storagePath: string;
  };
  job: VideoAnalysisJobSnapshot;
}

export class VideoAssetNotFoundError extends Error {
  constructor(readonly assetId: string) {
    super(`Video asset not found: ${assetId}`);
    this.name = "VideoAssetNotFoundError";
  }
}

export async function createVideoAnalysisJob({
  request,
  traceId,
  storage,
  jobRepository,
  scheduler,
  runJob,
  createId = (prefix) => `${prefix}_${randomUUID()}`,
  now = () => new Date().toISOString()
}: {
  request: CreateVideoAnalysisJobRequest;
  traceId: string;
  storage: VideoStoragePort;
  jobRepository: JobRepositoryPort;
  scheduler: BackgroundTaskSchedulerPort;
  runJob: RunExistingVideoAnalysisJob;
  createId?: (prefix: "job") => string;
  now?: () => string;
}): Promise<CreateVideoAnalysisJobResult> {
  const storedAsset = await storage.findVideoById(request.assetId);
  if (!storedAsset) {
    throw new VideoAssetNotFoundError(request.assetId);
  }

  const jobId = createId("job");
  const job = VideoAnalysisJobAggregate.create({
    id: jobId,
    videoId: request.assetId,
    createdAt: now()
  });
  const initialJob = job.toSnapshot();
  await jobRepository.save(initialJob);

  try {
    scheduler.schedule({
      id: jobId,
      async execute() {
        await runJob({
          request: {
            ...request,
            jobId,
            fileName: storedAsset.fileName,
            storedAsset
          },
          initialJob,
          traceId
        });
      }
    });
  } catch (error: unknown) {
    const failedJob = VideoAnalysisJobAggregate.restore(initialJob);
    failedJob.fail(
      {
        code: "SYSTEM_VIDEO_ANALYSIS_SCHEDULING_FAILED",
        message: normalizeSchedulingErrorMessage(error)
      },
      now()
    );
    await persistFailedSchedulingJobSafely(jobRepository, failedJob.toSnapshot());
    throw error;
  }

  return {
    asset: storedAsset,
    job: initialJob
  };
}

async function persistFailedSchedulingJobSafely(
  repository: JobRepositoryPort,
  job: VideoAnalysisJobSnapshot
): Promise<void> {
  try {
    await repository.save(job);
  } catch (error) {
    console.error("Failed to persist failed video analysis scheduling job.", {
      job,
      persistenceError:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error
    });
  }
}

function normalizeSchedulingErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown video analysis scheduling failure.";
  }
}
