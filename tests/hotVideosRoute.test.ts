import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.doMock("../src/infrastructure/trends/createTrendSource", () => ({
    createLiveTrendSource: vi.fn(() => ({
      fetchCandidates: async () => {
        throw new Error("live route unavailable");
      }
    }))
  }));
});

describe("GET /api/hot-videos", () => {
  it("returns fallback videos with a readable fallback reason when live source fails", async () => {
    const route = await import("../app/api/hot-videos/route");

    const response = await route.GET(
      new Request("http://localhost/api/hot-videos?category=AI%E7%A7%91%E6%8A%80&platform=douyin")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("fallback");
    expect(body.platform).toBe("douyin");
    expect(body.fallbackReason).toContain("live route unavailable");
    expect(body.videos.length).toBeGreaterThan(0);
    expect(body.videos.length).toBeLessThanOrEqual(10);
    expect(body.videos.every((video: { platform: string; url: string }) => {
      return video.platform === "douyin" && video.url.startsWith("https://");
    })).toBe(true);
  });

  it("defaults invalid category and platform before querying trend sources", async () => {
    const route = await import("../app/api/hot-videos/route");

    const response = await route.GET(
      new Request("http://localhost/api/hot-videos?category=unknown&platform=unknown")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("fallback");
    expect(body.platform).toBe("bilibili");
    expect(body.videos.length).toBeGreaterThan(0);
    expect(body.videos[0].title).toContain("AI科技");
    expect(body.videos.every((video: { platform: string }) => video.platform === "bilibili")).toBe(true);
  });
});
