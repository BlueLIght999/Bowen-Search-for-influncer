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

  it("accepts webm files by mime type and extension", async () => {
    const formData = new FormData();
    formData.append("file", new File(["fake video bytes"], "clip.webm", { type: "video/webm" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(200);
    expect(data.uploadedVideo.format).toBe("webm");
  });

  it("rejects non-video files", async () => {
    const formData = new FormData();
    formData.append("file", new File(["plain text"], "notes.txt", { type: "text/plain" }));

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(415);
    expect(data.error).toContain("Unsupported video format");
  });

  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("title", "missing file");

    const { status, data } = await callUploadRoute(formData);

    expect(status).toBe(400);
    expect(data.error).toContain("Missing video file");
  });
}
);
