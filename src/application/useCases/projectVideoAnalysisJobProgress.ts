import type { AnalysisJobStatus } from "../../domain/types";
import type { VideoAnalysisJobSnapshot } from "../../domain/jobs/VideoAnalysisJob";

const PROGRESS_BY_STATUS_V1: Partial<Record<AnalysisJobStatus, number>> = {
  uploaded: 5,
  extracting_audio: 20,
  transcribing: 40,
  sampling_frames: 60,
  retrieving_knowledge: 75,
  evaluating: 90,
  completed: 100
};

const PROGRESS_BY_STATUS_V2: Partial<Record<AnalysisJobStatus, number>> = {
  uploaded: 5,
  extracting_audio: 15,
  transcribing: 30,
  sampling_frames: 45,
  visually_understanding: 60,
  reasoning: 72,
  retrieving_knowledge: 82,
  evaluating: 92,
  completed: 100
};

export class InvalidVideoAnalysisJobProgressProjectionError extends Error {
  constructor(readonly status: string) {
    super(`Cannot project video analysis job progress for status: ${status}`);
    this.name = "InvalidVideoAnalysisJobProgressProjectionError";
  }
}

export interface VideoAnalysisJobProgress {
  progressPercent: number;
  currentStage: Exclude<AnalysisJobStatus, "failed">;
  isTerminal: boolean;
}

export function projectVideoAnalysisJobProgress(
  job: VideoAnalysisJobSnapshot
): VideoAnalysisJobProgress {
  if (!isKnownJobStatus(job.status)) {
    throw new InvalidVideoAnalysisJobProgressProjectionError(String(job.status));
  }

  const currentStage =
    job.status === "failed"
      ? job.failure?.stage ?? inferLastActiveStage(job)
      : job.status;
  const progressByStatus =
    job.workflowVersion === 2
      ? PROGRESS_BY_STATUS_V2
      : PROGRESS_BY_STATUS_V1;

  const progressPercent = progressByStatus[currentStage];
  if (progressPercent === undefined) {
    throw new InvalidVideoAnalysisJobProgressProjectionError(String(currentStage));
  }

  return {
    progressPercent,
    currentStage,
    isTerminal: job.status === "completed" || job.status === "failed"
  };
}

function inferLastActiveStage(
  job: VideoAnalysisJobSnapshot
): Exclude<AnalysisJobStatus, "failed"> {
  const activeEntry = [...job.history]
    .reverse()
    .find((entry) => entry.status !== "failed");
  return activeEntry?.status === "failed" || !activeEntry
    ? "uploaded"
    : activeEntry.status;
}

function isKnownJobStatus(status: string): status is AnalysisJobStatus {
  return (
    status === "failed" ||
    status in PROGRESS_BY_STATUS_V1 ||
    status in PROGRESS_BY_STATUS_V2
  );
}
