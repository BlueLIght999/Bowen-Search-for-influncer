import { describe, expect, it } from "vitest";
import {
  InvalidJobSnapshotError,
  InvalidJobTransitionError,
  VideoAnalysisJobAggregate
} from "../src/domain/jobs/VideoAnalysisJob";

describe("VideoAnalysisJobAggregate", () => {
  it("creates version 2 jobs and advances through multimodal analysis stages", () => {
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    job.advance("extracting_audio", "2026-07-10T00:00:01.000Z");
    job.advance("transcribing", "2026-07-10T00:00:02.000Z");
    job.advance("sampling_frames", "2026-07-10T00:00:03.000Z");
    job.advance("visually_understanding", "2026-07-10T00:00:04.000Z");
    job.advance("reasoning", "2026-07-10T00:00:05.000Z");
    job.advance("retrieving_knowledge", "2026-07-10T00:00:06.000Z");
    job.advance("evaluating", "2026-07-10T00:00:07.000Z");
    job.advance("completed", "2026-07-10T00:00:08.000Z");

    expect(job.toSnapshot()).toMatchObject({
      id: "job_123",
      videoId: "video_123",
      workflowVersion: 2,
      status: "completed",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:08.000Z",
      failure: undefined
    });
    expect(job.toSnapshot().history.map((entry) => entry.status)).toEqual([
      "uploaded",
      "extracting_audio",
      "transcribing",
      "sampling_frames",
      "visually_understanding",
      "reasoning",
      "retrieving_knowledge",
      "evaluating",
      "completed"
    ]);
  });

  it("restores snapshots without a workflow version as legacy version 1 jobs", () => {
    const legacyJob = VideoAnalysisJobAggregate.restore({
      id: "job_legacy",
      videoId: "video_123",
      status: "sampling_frames",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:03.000Z",
      history: [
        { status: "uploaded", occurredAt: "2026-07-10T00:00:00.000Z" },
        { status: "extracting_audio", occurredAt: "2026-07-10T00:00:01.000Z" },
        { status: "transcribing", occurredAt: "2026-07-10T00:00:02.000Z" },
        { status: "sampling_frames", occurredAt: "2026-07-10T00:00:03.000Z" }
      ]
    });

    legacyJob.advance("retrieving_knowledge", "2026-07-10T00:00:04.000Z");

    expect(legacyJob.toSnapshot().workflowVersion).toBeUndefined();
    expect(legacyJob.toSnapshot().status).toBe("retrieving_knowledge");
    expect(() =>
      legacyJob.advance("reasoning", "2026-07-10T00:00:05.000Z")
    ).toThrow(InvalidJobTransitionError);
  });

  it("rejects version 2 jobs that skip visual understanding and reasoning", () => {
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    job.advance("extracting_audio", "2026-07-10T00:00:01.000Z");
    job.advance("transcribing", "2026-07-10T00:00:02.000Z");
    job.advance("sampling_frames", "2026-07-10T00:00:03.000Z");

    expect(() =>
      job.advance("retrieving_knowledge", "2026-07-10T00:00:04.000Z")
    ).toThrow(InvalidJobTransitionError);
  });

  it("rejects skipped stages and changes after completion", () => {
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    expect(() =>
      job.advance("sampling_frames", "2026-07-10T00:00:01.000Z")
    ).toThrow(InvalidJobTransitionError);

    job.advance("extracting_audio", "2026-07-10T00:00:01.000Z");
    job.advance("transcribing", "2026-07-10T00:00:02.000Z");
    job.advance("sampling_frames", "2026-07-10T00:00:03.000Z");
    job.advance("visually_understanding", "2026-07-10T00:00:04.000Z");
    job.advance("reasoning", "2026-07-10T00:00:05.000Z");
    job.advance("retrieving_knowledge", "2026-07-10T00:00:06.000Z");
    job.advance("evaluating", "2026-07-10T00:00:07.000Z");
    job.advance("completed", "2026-07-10T00:00:08.000Z");

    expect(() =>
      job.advance("evaluating", "2026-07-10T00:00:09.000Z")
    ).toThrow(InvalidJobTransitionError);
  });

  it("records a failure with the active stage, code, and readable message", () => {
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });
    job.advance("extracting_audio", "2026-07-10T00:00:01.000Z");

    job.fail(
      {
        code: "SYSTEM_FFMPEG_FAILED",
        message: "ffmpeg exited with code 1"
      },
      "2026-07-10T00:00:02.000Z"
    );

    expect(job.toSnapshot()).toMatchObject({
      status: "failed",
      failure: {
        stage: "extracting_audio",
        code: "SYSTEM_FFMPEG_FAILED",
        message: "ffmpeg exited with code 1",
        occurredAt: "2026-07-10T00:00:02.000Z"
      }
    });
    expect(() =>
      job.advance("transcribing", "2026-07-10T00:00:03.000Z")
    ).toThrow(InvalidJobTransitionError);
  });

  it("rejects restoring snapshots with skipped history stages", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "sampling_frames",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:02.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "sampling_frames",
            occurredAt: "2026-07-10T00:00:02.000Z"
          }
        ]
      })
    ).toThrow(InvalidJobSnapshotError);
  });

  it("rejects restoring snapshots when the current status does not match history", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "transcribing",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:01.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "extracting_audio",
            occurredAt: "2026-07-10T00:00:01.000Z"
          }
        ]
      })
    ).toThrow("Job snapshot status must match the latest history status.");
  });

  it("rejects restoring failed snapshots without failure details", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "failed",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:01.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "failed",
            occurredAt: "2026-07-10T00:00:01.000Z"
          }
        ]
      })
    ).toThrow("Failed job snapshot must include failure details.");
  });

  it("rejects restoring failed snapshots whose failure stage does not match the last active stage", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "failed",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:02.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "extracting_audio",
            occurredAt: "2026-07-10T00:00:01.000Z"
          },
          {
            status: "failed",
            occurredAt: "2026-07-10T00:00:02.000Z"
          }
        ],
        failure: {
          stage: "transcribing",
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
          message: "failed at the wrong stage",
          occurredAt: "2026-07-10T00:00:02.000Z"
        }
      })
    ).toThrow("Failure stage must match the last active history status.");
  });

  it("rejects restoring failed snapshots whose failure time does not match the failed history time", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "failed",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:02.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "failed",
            occurredAt: "2026-07-10T00:00:02.000Z"
          }
        ],
        failure: {
          stage: "uploaded",
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
          message: "failed at a mismatched time",
          occurredAt: "2026-07-10T00:00:03.000Z"
        }
      })
    ).toThrow("Failure occurredAt must match the failed history timestamp.");
  });

  it("rejects restoring snapshots whose updated time does not match the latest history time", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "extracting_audio",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:03.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "extracting_audio",
            occurredAt: "2026-07-10T00:00:01.000Z"
          }
        ]
      })
    ).toThrow("Job snapshot updatedAt must match the latest history timestamp.");
  });

  it("rejects restoring snapshots with invalid timestamps", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "uploaded",
        createdAt: "not-a-date",
        updatedAt: "not-a-date",
        history: [
          {
            status: "uploaded",
            occurredAt: "not-a-date"
          }
        ]
      })
    ).toThrow("Job snapshot createdAt must be a valid ISO date string.");
  });

  it("rejects restoring snapshots whose history timestamps move backwards", () => {
    expect(() =>
      VideoAnalysisJobAggregate.restore({
        id: "job_corrupt",
        videoId: "video_123",
        status: "extracting_audio",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-09T23:59:59.000Z",
        history: [
          {
            status: "uploaded",
            occurredAt: "2026-07-10T00:00:00.000Z"
          },
          {
            status: "extracting_audio",
            occurredAt: "2026-07-09T23:59:59.000Z"
          }
        ]
      })
    ).toThrow("Job snapshot history timestamps must not move backwards.");
  });

  it("rejects advancing a job with a timestamp before the current update time", () => {
    const job = VideoAnalysisJobAggregate.create({
      id: "job_123",
      videoId: "video_123",
      createdAt: "2026-07-10T00:00:00.000Z"
    });

    expect(() =>
      job.advance("extracting_audio", "2026-07-09T23:59:59.000Z")
    ).toThrow("Job transition timestamp must not be before the current updatedAt.");
    expect(job.toSnapshot().status).toBe("uploaded");
  });
});
