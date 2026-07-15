import { describe, expect, it } from "vitest";

async function callUploadRoute(formData: FormData): Promise<{ status: number; data: any }> {
  const routeModule = await import("../app/api/upload-video/route");
  const request = new Request("http://localhost/api/upload-video", {
    method: "POST",
    body: formData
  });
  const response = await routeModule.POST(request);
  return {
    status: response.status,
    data: await response.json()
  };
}

describe("POST /api/upload-video", () => {
  it("accepts mainstream video formats and returns AI analysis configuration", async () => {
    const formData = new FormData();
    formData.append("category", "AI绉戞妧");
    formData.append("title", "AI工具视频复盘");
    formData.append("file", new File(["fake video bytes"], "demo.mp4", { type: "video/mp4" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(200);
    expect(data.uploadedVideo.fileName).toBe("demo.mp4");
    expect(data.uploadedVideo.format).toBe("mp4");
    expect(data.prefill.title).toBe("AI工具视频复盘");
    expect(data.prefill.transcript).toContain("demo.mp4");
    expect(data.analysis.directions).toHaveLength(3);
  });

  it("returns local asset and analysis job metadata for the uploaded video", async () => {
    const formData = new FormData();
    formData.append("title", "AI drama upload");
    formData.append("transcript", "The heroine is betrayed and returns with a new identity in the next episode.");
    formData.append("file", new File(["fake video bytes"], "drama.mp4", { type: "video/mp4" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(200);
    expect(data.asset.id).toMatch(/^video_/);
    expect(data.asset.fileName).toBe("drama.mp4");
    expect(data.asset.storagePath).toContain("storage");
    expect(data.asset.storagePath).toContain("uploads");
    expect(data.job.id).toMatch(/^job_/);
    expect(data.job.status).toBe("completed");
    expect(data.analysis.report.jobId).toBe(data.job.id);
    expect(data.analysis.report.video.id).toBe(data.asset.id);
    expect(["completed", "failed"]).toContain(data.mediaProcessing.audio.status);
    expect(["completed", "failed"]).toContain(data.mediaProcessing.frames.status);
    expect(["funasr", "fallback"]).toContain(data.transcription.source);
    expect(data.analysis.report.transcript.text).toBe(data.transcription.fullText);
    expect(Array.isArray(data.frameSamples)).toBe(true);
    expect(data.videoObservation).toBeDefined();
    expect(["high", "medium", "low"]).toContain(data.videoObservation.evidenceConfidence);
    expect(["completed", "skipped", "failed"]).toContain(data.ocr.status);
    expect(["paddleocr", "fallback"]).toContain(data.ocr.source);
    expect(Array.isArray(data.ocr.signals)).toBe(true);
    expect(data.analysis.report.analysisMode).toBe("multimodal");
    expect(data.analysis.report.modelSummary).toMatchObject({
      provider: "fake",
      coverageRatio: 1,
      partial: false
    });
    expect(data.analysis.report.understanding).toMatchObject({
      contentType: data.videoObservation.contentType,
      narrative: expect.objectContaining({
        premise: expect.objectContaining({
          type: "inference"
        })
      }),
      visualCraft: expect.objectContaining({
        pacing: expect.any(Array)
      })
    });
    expect(data.analysis.report.understanding.claims.length).toBeGreaterThan(0);
    expect(data.analysis.report.knowledgeEvidence.length).toBeGreaterThan(0);
  });

  it("accepts webm files by mime type and extension", async () => {
    const formData = new FormData();
    formData.append("file", new File(["fake video bytes"], "clip.webm", { type: "video/webm" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(200);
    expect(data.uploadedVideo.format).toBe("webm");
  });

  it("creates unique asset and job ids for repeated uploads of the same file", async () => {
    const createFormData = () => {
      const formData = new FormData();
      formData.append("title", "Repeated upload");
      formData.append(
        "file",
        new File(["same video bytes"], "same.mp4", { type: "video/mp4" })
      );
      return formData;
    };

    const first = await callUploadRoute(createFormData());
    const second = await callUploadRoute(createFormData());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.asset.id).not.toBe(second.data.asset.id);
    expect(first.data.job.id).not.toBe(second.data.job.id);
  });

  it("rejects non-video files", async () => {
    const formData = new FormData();
    formData.append("file", new File(["plain text"], "notes.txt", { type: "text/plain" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(415);
    expect(data).toMatchObject({
      success: false,
      error: {
        code: "REQUEST_UNSUPPORTED_VIDEO_FORMAT"
      }
    });
    expect(data.error.message).toContain("mp4");
    expect(data.traceId).toMatch(/^trace_/);
  });

  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("title", "missing file");

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(400);
    expect(data).toMatchObject({
      success: false,
      error: {
        code: "REQUEST_VIDEO_FILE_REQUIRED"
      }
    });
    expect(data.error.message).toContain("视频文件");
    expect(data.traceId).toMatch(/^trace_/);
  });
}
);
