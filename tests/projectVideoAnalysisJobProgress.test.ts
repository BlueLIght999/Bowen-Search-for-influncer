import { describe, expect, it } from "vitest";
import { projectVideoAnalysisJobProgress } from "../src/application/useCases/projectVideoAnalysisJobProgress";
import type { VideoAnalysisJobSnapshot } from "../src/domain/jobs/VideoAnalysisJob";

function job(status: VideoAnalysisJobSnapshot["status"]): VideoAnalysisJobSnapshot {
  return {
    id: "job_123",
    videoId: "video_123",
    status,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    history: [
      {
        status,
        occurredAt: "2026-07-10T00:00:00.000Z"
      }
    ]
  };
}

describe("projectVideoAnalysisJobProgress", () => {
  it.each([
    ["uploaded", 5],
    ["extracting_audio", 20],
    ["transcribing", 40],
    ["sampling_frames", 60],
    ["retrieving_knowledge", 75],
    ["evaluating", 90],
    ["completed", 100]
  ] as const)("maps %s to %i percent", (status, expectedPercent) => {
    expect(projectVideoAnalysisJobProgress(job(status))).toMatchObject({
      progressPercent: expectedPercent,
      currentStage: status,
      isTerminal: status === "completed"
    });
  });

  it.each([
    ["uploaded", 5],
    ["extracting_audio", 15],
    ["transcribing", 30],
    ["sampling_frames", 45],
    ["visually_understanding", 60],
    ["reasoning", 72],
    ["retrieving_knowledge", 82],
    ["evaluating", 92],
    ["completed", 100]
  ] as const)("maps version 2 %s to %i percent", (status, expectedPercent) => {
    expect(
      projectVideoAnalysisJobProgress({
        ...job(status),
        workflowVersion: 2
      })
    ).toMatchObject({
      progressPercent: expectedPercent,
      currentStage: status,
      isTerminal: status === "completed"
    });
  });

  it("keeps the failed stage and reports a terminal job", () => {
    const failedJob: VideoAnalysisJobSnapshot = {
      ...job("failed"),
      failure: {
        stage: "transcribing",
        code: "SOURCE_TRANSCRIPTION_UNAVAILABLE",
        message: "FunASR unavailable",
        occurredAt: "2026-07-10T00:00:01.000Z"
      }
    };

    expect(projectVideoAnalysisJobProgress(failedJob)).toMatchObject({
      progressPercent: 40,
      currentStage: "transcribing",
      isTerminal: true
    });
  });
});
