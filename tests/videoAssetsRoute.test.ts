import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempRoot: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("POST /api/video-assets", () => {
  it("uploads a video asset without starting analysis", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-video-assets-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    const route = await import("../app/api/video-assets/route");
    const formData = new FormData();
    formData.append(
      "file",
      new File(["fake video"], "Demo Video.mp4", { type: "video/mp4" })
    );

    const response = await route.POST(
      new Request("http://localhost/api/video-assets", {
        method: "POST",
        body: formData
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.asset.id).toMatch(/^video_/);
    expect(body.data.asset.fileName).toBe("Demo Video.mp4");
    expect(body.data.asset.format).toBe("mp4");
    expect(body.data.asset.storagePath).toContain(tempRoot);
    expect(body.data.job).toBeUndefined();
  });

  it("returns a structured error for unsupported files", async () => {
    const route = await import("../app/api/video-assets/route");
    const formData = new FormData();
    formData.append("file", new File(["text"], "notes.txt", { type: "text/plain" }));

    const response = await route.POST(
      new Request("http://localhost/api/video-assets", {
        method: "POST",
        body: formData
      })
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "REQUEST_UNSUPPORTED_VIDEO_FORMAT"
      }
    });
    expect(body.traceId).toMatch(/^trace_/);
  });
});
