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
  it("keeps only videos from the last five days and ranks fast growers first", () => {
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
          id: "slow",
          platform: "bilibili",
          title: "慢增长",
          author: "B",
          url: "https://example.com/slow",
          description: "slow",
          publishedAt: "2026-07-02T12:00:00.000Z",
          viewCount: 10000,
          likeCount: 500,
          favoriteCount: 100,
          commentCount: 30,
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
          viewCount: 50000,
          likeCount: 4000,
          favoriteCount: 1500,
          commentCount: 800,
          growthScore: 0,
          growthReason: ""
        }
      ],
      now
    );

    expect(videos.map((video) => video.id)).toEqual(["fast", "slow"]);
    expect(videos[0].growthScore).toBeGreaterThan(videos[1].growthScore);
    expect(videos[0].growthReason).toContain("小时");
  });
});
