import { describe, expect, it, vi } from "vitest";

describe("API error logging resilience", () => {
  it("returns the original legacy upload analysis error when API logging also fails", async () => {
    vi.resetModules();
    vi.doMock("../src/application/useCases/runVideoAnalysisJob", () => ({
      VideoAnalysisJobExecutionError: class VideoAnalysisJobExecutionError extends Error {},
      runVideoAnalysisJob: vi.fn(async () => {
        throw new Error("analysis worker crashed before fatal log");
      })
    }));
    vi.doMock("../src/infrastructure/logging/LocalJsonlErrorLog", () => ({
      LocalJsonlErrorLog: class {
        async append() {
          throw new Error("log directory is read-only");
        }
      }
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const route = await import("../app/api/upload-video/route");
      const formData = new FormData();
      formData.append("file", new File(["video"], "demo.mp4", { type: "video/mp4" }));

      const response = await route.POST(
        new Request("http://localhost/api/upload-video", {
          method: "POST",
          body: formData
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED"
        }
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist API error log.",
        expect.objectContaining({
          entry: expect.objectContaining({
            code: "SYSTEM_VIDEO_ANALYSIS_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
      vi.doUnmock("../src/application/useCases/runVideoAnalysisJob");
      vi.doUnmock("../src/infrastructure/logging/LocalJsonlErrorLog");
      vi.resetModules();
    }
  });

  it("returns the original video asset storage error when logging also fails", async () => {
    vi.resetModules();
    vi.doMock("../src/application/useCases/uploadVideoAsset", () => ({
      uploadVideoAsset: vi.fn(async () => {
        throw new Error("disk is read-only");
      })
    }));
    vi.doMock("../src/infrastructure/logging/LocalJsonlErrorLog", () => ({
      LocalJsonlErrorLog: class {
        async append() {
          throw new Error("log directory is read-only");
        }
      }
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const route = await import("../app/api/video-assets/route");
      const formData = new FormData();
      formData.append("file", new File(["video"], "demo.mp4", { type: "video/mp4" }));

      const response = await route.POST(
        new Request("http://localhost/api/video-assets", {
          method: "POST",
          body: formData
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "SYSTEM_VIDEO_ASSET_STORAGE_FAILED"
        }
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist API error log.",
        expect.objectContaining({
          entry: expect.objectContaining({
            code: "SYSTEM_VIDEO_ASSET_STORAGE_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
      vi.doUnmock("../src/application/useCases/uploadVideoAsset");
      vi.doUnmock("../src/infrastructure/logging/LocalJsonlErrorLog");
      vi.resetModules();
    }
  });

  it("returns the original job creation error when logging also fails", async () => {
    vi.resetModules();
    vi.doMock("../src/application/useCases/createVideoAnalysisJob", () => ({
      VideoAssetNotFoundError: class VideoAssetNotFoundError extends Error {},
      createVideoAnalysisJob: vi.fn(async () => {
        throw new Error("job repository unavailable");
      })
    }));
    vi.doMock("../src/infrastructure/logging/LocalJsonlErrorLog", () => ({
      LocalJsonlErrorLog: class {
        async append() {
          throw new Error("log directory is read-only");
        }
      }
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const route = await import("../app/api/video-analysis-jobs/route");
      const response = await route.POST(
        new Request("http://localhost/api/video-analysis-jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetId: "video_123" })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "SYSTEM_VIDEO_ANALYSIS_JOB_CREATION_FAILED"
        }
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist API error log.",
        expect.objectContaining({
          entry: expect.objectContaining({
            code: "SYSTEM_VIDEO_ANALYSIS_JOB_CREATION_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
      vi.doUnmock("../src/application/useCases/createVideoAnalysisJob");
      vi.doUnmock("../src/infrastructure/logging/LocalJsonlErrorLog");
      vi.resetModules();
    }
  });

  it("returns a structured job query error when logging also fails", async () => {
    vi.resetModules();
    vi.doMock("../src/infrastructure/jobs/LocalJsonJobRepository", () => ({
      LocalJsonJobRepository: class {
        async findById() {
          throw new Error("job store is corrupted");
        }
      }
    }));
    vi.doMock("../src/infrastructure/logging/LocalJsonlErrorLog", () => ({
      LocalJsonlErrorLog: class {
        async append() {
          throw new Error("log directory is read-only");
        }
      }
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const route = await import("../app/api/video-analysis-jobs/[jobId]/route");
      const response = await route.GET(
        new Request("http://localhost/api/video-analysis-jobs/job_123"),
        { params: Promise.resolve({ jobId: "job_123" }) }
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED"
        }
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist API error log.",
        expect.objectContaining({
          entry: expect.objectContaining({
            code: "SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
      vi.doUnmock("../src/infrastructure/jobs/LocalJsonJobRepository");
      vi.doUnmock("../src/infrastructure/logging/LocalJsonlErrorLog");
      vi.resetModules();
    }
  });

  it("returns a structured report query error when logging also fails", async () => {
    vi.resetModules();
    vi.doMock("../src/infrastructure/reports/LocalJsonReportRepository", () => ({
      LocalJsonReportRepository: class {
        async findByJobId() {
          throw new Error("report store is corrupted");
        }
      }
    }));
    vi.doMock("../src/infrastructure/logging/LocalJsonlErrorLog", () => ({
      LocalJsonlErrorLog: class {
        async append() {
          throw new Error("log directory is read-only");
        }
      }
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
      const response = await route.GET(
        new Request("http://localhost/api/video-analysis-jobs/job_123/report"),
        { params: Promise.resolve({ jobId: "job_123" }) }
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED"
        }
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist API error log.",
        expect.objectContaining({
          entry: expect.objectContaining({
            code: "SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
      vi.doUnmock("../src/infrastructure/reports/LocalJsonReportRepository");
      vi.doUnmock("../src/infrastructure/logging/LocalJsonlErrorLog");
      vi.resetModules();
    }
  });
});
