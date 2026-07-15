import { describe, expect, it, vi } from "vitest";
import {
  runVideoAnalysisPipelineClient,
  VideoAnalysisPipelineClientError
} from "../src/interface/videoAnalysis/runVideoAnalysisPipelineClient";

describe("runVideoAnalysisPipelineClient", () => {
  it("uploads, creates a job, polls progress, and fetches the completed report", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            videoId: "video_123",
            status: "uploaded",
            createdAt: "2026-07-10T00:00:00.000Z",
            updatedAt: "2026-07-10T00:00:00.000Z",
            history: []
          }
        },
        traceId: "trace_job"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          id: "job_123",
          videoId: "video_123",
          status: "visually_understanding",
          progressPercent: 60,
          currentStage: "visually_understanding",
          isTerminal: false
        },
        traceId: "trace_poll_1"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          id: "job_123",
          videoId: "video_123",
          status: "completed",
          progressPercent: 100,
          currentStage: "completed",
          isTerminal: true
        },
        traceId: "trace_poll_2"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          jobId: "job_123",
          status: "completed",
          video: { id: "video_123", filename: "demo.mp4" }
        },
        traceId: "trace_report"
      }));
    const progress = vi.fn();

    const result = await runVideoAnalysisPipelineClient({
      file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
      jobInput: {
        category: "AI科技",
        title: "Demo",
        hotspot: "Demo",
        transcript: "",
        creatorPositioning: "AI creators",
        referenceTexts: []
      },
      fetcher,
      delay: async () => undefined,
      onProgress: progress
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/video-assets",
      "/api/video-analysis-jobs",
      "/api/video-analysis-jobs/job_123",
      "/api/video-analysis-jobs/job_123",
      "/api/video-analysis-jobs/job_123/report"
    ]);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "visually_understanding",
        progressPercent: 60
      })
    );
    expect(result.report.jobId).toBe("job_123");
    expect(result.asset.fileName).toBe("demo.mp4");
  });

  it("stops polling and exposes the job failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        }
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: { id: "job_123", status: "uploaded" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          id: "job_123",
          status: "failed",
          progressPercent: 40,
          currentStage: "transcribing",
          isTerminal: true,
          failure: {
            code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
            message: "transcription failed"
          }
        },
        traceId: "trace_failed_job"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
      jobId: "job_123",
      traceId: "trace_failed_job"
    } satisfies Partial<VideoAnalysisPipelineClientError>);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("checks the job one final time before reporting a timeout", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            videoId: "video_123",
            status: "reasoning",
            progressPercent: 75,
            currentStage: "reasoning",
            isTerminal: false
          }
        },
        traceId: "trace_job"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          id: "job_123",
          videoId: "video_123",
          status: "reasoning",
          progressPercent: 75,
          currentStage: "reasoning",
          isTerminal: false
        },
        traceId: "trace_poll_limit"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          id: "job_123",
          videoId: "video_123",
          status: "completed",
          progressPercent: 100,
          currentStage: "completed",
          isTerminal: true
        },
        traceId: "trace_final_check"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          jobId: "job_123",
          status: "completed",
          video: { id: "video_123", filename: "demo.mp4" }
        },
        traceId: "trace_report"
      }));

    const result = await runVideoAnalysisPipelineClient({
      file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
      jobInput: {
        category: "AI绉戞妧",
        title: "Demo",
        hotspot: "Demo",
        transcript: "",
        creatorPositioning: "AI creators",
        referenceTexts: []
      },
      fetcher,
      delay: async () => undefined,
      maxPolls: 1
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/video-assets",
      "/api/video-analysis-jobs",
      "/api/video-analysis-jobs/job_123",
      "/api/video-analysis-jobs/job_123",
      "/api/video-analysis-jobs/job_123/report"
    ]);
    expect(result.job.status).toBe("completed");
    expect(result.report.jobId).toBe("job_123");
  });

  it("keeps the API trace id on structured request failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(415, {
      success: false,
      error: {
        code: "REQUEST_UNSUPPORTED_VIDEO_FORMAT",
        message: "仅支持 mp4、mov、webm、mkv、avi、m4v、mpeg 或 mpg 视频。"
      },
      traceId: "trace_upload_error"
    }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["not video"], "notes.txt", { type: "text/plain" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "REQUEST_UNSUPPORTED_VIDEO_FORMAT",
      traceId: "trace_upload_error"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
  });

  it("wraps network failures in a stable client error instead of leaking fetch errors", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI绉戞妧",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_VIDEO_ANALYSIS_REQUEST_FAILED"
    } satisfies Partial<VideoAnalysisPipelineClientError>);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed job progress responses before polling an empty job id", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            status: "uploaded",
            progressPercent: 5,
            currentStage: "uploaded",
            isTerminal: false
          }
        },
        traceId: "trace_job_malformed"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_JOB_PROGRESS",
      traceId: "trace_job_malformed"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed asset upload responses before creating a job", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(201, {
      success: true,
      data: {
        asset: {
          fileName: "demo.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          size: 5,
          storagePath: "storage/uploads/video_123-demo.mp4",
          uploadedAt: "2026-07-10T00:00:00.000Z"
        }
      },
      traceId: "trace_asset_malformed"
    }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_ASSET_RESPONSE",
      traceId: "trace_asset_malformed"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects job progress responses with an unknown status", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            status: "unknown_status",
            progressPercent: 5,
            currentStage: "unknown_status",
            isTerminal: false
          }
        },
        traceId: "trace_job_unknown_status"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_JOB_PROGRESS",
      traceId: "trace_job_unknown_status"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects non-terminal job statuses marked as terminal before fetching a report", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            status: "uploaded",
            progressPercent: 5,
            currentStage: "uploaded",
            isTerminal: true
          }
        },
        traceId: "trace_job_terminal_mismatch"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI绉戞妧",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_JOB_PROGRESS",
      jobId: "job_123",
      traceId: "trace_job_terminal_mismatch"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects terminal job statuses marked as non-terminal before polling forever", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            status: "completed",
            progressPercent: 100,
            currentStage: "completed",
            isTerminal: false
          }
        },
        traceId: "trace_job_nonterminal_mismatch"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI绉戞妧",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined,
        maxPolls: 1
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_JOB_PROGRESS",
      jobId: "job_123",
      traceId: "trace_job_nonterminal_mismatch"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects reports whose job id does not match the completed job", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        success: true,
        data: {
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 5,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-10T00:00:00.000Z"
          }
        },
        traceId: "trace_upload"
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        success: true,
        data: {
          job: {
            id: "job_123",
            status: "completed",
            progressPercent: 100,
            currentStage: "completed",
            isTerminal: true
          }
        },
        traceId: "trace_job"
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        success: true,
        data: {
          jobId: "job_other",
          status: "completed",
          video: { id: "video_123", filename: "demo.mp4" }
        },
        traceId: "trace_report_mismatch"
      }));

    await expect(
      runVideoAnalysisPipelineClient({
        file: new File(["video"], "demo.mp4", { type: "video/mp4" }),
        jobInput: {
          category: "AI科技",
          title: "Demo",
          hotspot: "Demo",
          transcript: "",
          creatorPositioning: "AI creators",
          referenceTexts: []
        },
        fetcher,
        delay: async () => undefined
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisPipelineClientError",
      code: "SYSTEM_INVALID_REPORT_RESPONSE",
      jobId: "job_123",
      traceId: "trace_report_mismatch"
    } satisfies Partial<VideoAnalysisPipelineClientError> & { traceId: string });
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
