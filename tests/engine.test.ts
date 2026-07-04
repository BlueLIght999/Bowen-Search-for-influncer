import { describe, expect, it } from "vitest";
import { defaultInput } from "../src/domain/sampleInputs";
import { analyzeSample } from "../src/engine/analyzeSample";
import { generatePlan } from "../src/engine/generatePlan";
import { rankHotVideos } from "../src/engine/rankHotVideos";
import { retrieveKnowledge } from "../src/engine/retrieveKnowledge";

describe("default MVP input", () => {
  it("contains enough information for a demo run", () => {
    expect(defaultInput.hotspot.length).toBeGreaterThan(5);
    expect(defaultInput.sampleText).toContain("标题");
    expect(defaultInput.commentSignals).toContain("评论");
  });
});

describe("sample analyzer", () => {
  it("extracts a useful sample analysis", () => {
    const analysis = analyzeSample(defaultInput);

    expect(analysis.hookPattern).toContain("反常识");
    expect(analysis.copyLogic).toHaveLength(4);
    expect(analysis.sceneStyle.length).toBeGreaterThan(5);
    expect(analysis.collectibleMoment).toContain("收藏");
  });
});

describe("knowledge retrieval", () => {
  it("retrieves category and universal knowledge", () => {
    const items = retrieveKnowledge(defaultInput);

    expect(items.some((item) => item.id === "ai-verification")).toBe(true);
    expect(items.some((item) => item.category === "通用")).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("plan generator", () => {
  it("generates three differentiated shootable directions", () => {
    const plan = generatePlan(defaultInput);

    expect(plan.directions).toHaveLength(3);
    expect(plan.directions[0].outline.length).toBeGreaterThanOrEqual(4);
    expect(plan.directions[0].uniquenessScore).toBeGreaterThan(60);
    expect(plan.reviewPrompt).toContain("收藏率");
  });
});

describe("hot video ranking", () => {
  it("keeps five-day videos that reached 100k views and outgrow the category baseline", () => {
    const now = new Date("2026-07-04T12:00:00.000Z");
    const videos = rankHotVideos(
      [
        {
          id: "older",
          platform: "bilibili",
          title: "旧爆款",
          author: "A",
          url: "https://example.com/older",
          description: "older",
          publishedAt: "2026-06-20T12:00:00.000Z",
          viewCount: 2000000,
          likeCount: 100000,
          favoriteCount: 20000,
          commentCount: 5000,
          growthScore: 0,
          growthReason: ""
        },
        {
          id: "under-100k",
          platform: "bilibili",
          title: "没破10万",
          author: "B",
          url: "https://example.com/under-100k",
          description: "under 100k",
          publishedAt: "2026-07-02T12:00:00.000Z",
          viewCount: 99000,
          likeCount: 5000,
          favoriteCount: 1000,
          commentCount: 300,
          growthScore: 0,
          growthReason: ""
        },
        {
          id: "baseline",
          platform: "bilibili",
          title: "同品类正常增长",
          author: "B",
          url: "https://example.com/baseline",
          description: "baseline",
          publishedAt: "2026-07-02T12:00:00.000Z",
          viewCount: 120000,
          likeCount: 3000,
          favoriteCount: 800,
          commentCount: 200,
          growthScore: 0,
          growthReason: ""
        },
        {
          id: "fast",
          platform: "bilibili",
          title: "快增长",
          author: "C",
          url: "https://example.com/fast",
          description: "fast",
          publishedAt: "2026-07-04T06:00:00.000Z",
          viewCount: 150000,
          likeCount: 4000,
          favoriteCount: 1500,
          commentCount: 800,
          growthScore: 0,
          growthReason: ""
        }
      ],
      now
    );

    expect(videos.map((video) => video.id)).toEqual(["fast"]);
    expect(videos[0].growthScore).toBeGreaterThan(150);
    expect(videos[0].growthReason).toContain("5天内破10万");
    expect(videos[0].growthReason).toContain("同品类均值");
  });
});
