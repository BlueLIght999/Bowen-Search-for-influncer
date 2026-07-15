import { describe, expect, it } from "vitest";
import { generateCreatorPlan } from "../src/application/useCases/generateCreatorPlan";
import { getHotVideos } from "../src/application/useCases/getHotVideos";
import { transcribeVideoReference } from "../src/application/useCases/transcribeVideoReference";
import { defaultInput } from "../src/domain/sampleInputs";
import { analyzeSample } from "../src/engine/analyzeSample";
import { generateCandidateDirections, generatePlan } from "../src/engine/generatePlan";
import { rankHotVideos } from "../src/engine/rankHotVideos";
import { retrieveKnowledge } from "../src/engine/retrieveKnowledge";
import { scoreDifferentiation } from "../src/application/useCases/scoreDifferentiation";
import { LocalDifferentiationClient } from "../src/infrastructure/differentiation/LocalDifferentiationClient";
import { LocalKnowledgeRepository } from "../src/infrastructure/knowledge/LocalKnowledgeRepository";
import { analyzeUploadedVideo } from "../src/application/useCases/analyzeUploadedVideo";
import type { DifferentiationPort } from "../src/application/ports/DifferentiationPort";
import { bowenStrategies } from "../src/knowledge/bowenStrategies";

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
    const items = retrieveKnowledge(defaultInput, bowenStrategies);

    expect(items.some((item) => item.id === "ai-verification")).toBe(true);
    expect(items.some((item) => item.category === "通用")).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("plan generator", () => {
  it("generates three differentiated shootable directions", () => {
    const knowledgeItems = retrieveKnowledge(defaultInput, bowenStrategies);
    const plan = generatePlan(defaultInput, knowledgeItems);

    expect(plan.directions).toHaveLength(3);
    expect(plan.directions[0].outline.length).toBeGreaterThanOrEqual(4);
    expect(plan.directions[0].uniquenessScore).toBeGreaterThan(60);
    expect(plan.reviewPrompt).toContain("收藏率");
  });

  it("recommends AI work evaluation dimensions and keywords", () => {
    const knowledgeItems = retrieveKnowledge(defaultInput, bowenStrategies);
    const plan = generatePlan(defaultInput, knowledgeItems);

    expect(plan.evaluation).toHaveLength(5);
    expect(plan.evaluation.map((item) => item.dimension)).toContain("脚本优秀度");
    expect(plan.evaluation.map((item) => item.dimension)).toContain("分镜");
    expect(plan.evaluation.map((item) => item.dimension)).toContain("审美体验");
    expect(plan.evaluation.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(plan.evaluation.flatMap((item) => item.keywords).length).toBeGreaterThanOrEqual(15);
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

describe("application use cases", () => {
  it("falls back to the fallback trend source when the live source fails", async () => {
    const now = new Date("2026-07-04T12:00:00.000Z");
    const liveSource = {
      fetchCandidates: async () => {
        throw new Error("live unavailable");
      }
    };
    const fallbackSource = {
      fetchCandidates: async () => [
        {
          id: "fast",
          platform: "bilibili" as const,
          title: "fast sample",
          author: "creator",
          url: "https://example.com/fast",
          description: "fast",
          publishedAt: "2026-07-04T06:00:00.000Z",
          viewCount: 200000,
          likeCount: 5000,
          favoriteCount: 2000,
          commentCount: 800,
          growthScore: 0,
          growthReason: ""
        },
        {
          id: "baseline",
          platform: "bilibili" as const,
          title: "baseline sample",
          author: "creator",
          url: "https://example.com/baseline",
          description: "baseline",
          publishedAt: "2026-07-02T12:00:00.000Z",
          viewCount: 90000,
          likeCount: 1000,
          favoriteCount: 300,
          commentCount: 100,
          growthScore: 0,
          growthReason: ""
        }
      ]
    };

    const result = await getHotVideos({
      category: defaultInput.category,
      platform: "bilibili",
      liveSource,
      fallbackSource,
      now
    });

    expect(result.source).toBe("fallback");
    expect(result.platform).toBe("bilibili");
    expect(result.fallbackReason).toContain("live unavailable");
    expect(result.videos.map((video) => video.id)).toEqual(["fast"]);
  });

  it("explains fallback when live source returns fewer than ten ranked videos", async () => {
    const now = new Date("2026-07-04T12:00:00.000Z");
    const liveSource = {
      fetchCandidates: async () => [
        {
          id: "only-live-fast",
          platform: "bilibili" as const,
          title: "only live fast",
          author: "creator",
          url: "https://example.com/live",
          description: "fast",
          publishedAt: "2026-07-04T06:00:00.000Z",
          viewCount: 200000,
          likeCount: 5000,
          favoriteCount: 2000,
          commentCount: 800,
          growthScore: 0,
          growthReason: ""
        }
      ]
    };
    const fallbackSource = {
      fetchCandidates: async () => [
        {
          id: "fallback-fast",
          platform: "bilibili" as const,
          title: "fallback fast",
          author: "creator",
          url: "https://example.com/fallback",
          description: "fast",
          publishedAt: "2026-07-04T06:00:00.000Z",
          viewCount: 200000,
          likeCount: 5000,
          favoriteCount: 2000,
          commentCount: 800,
          growthScore: 0,
          growthReason: ""
        },
        {
          id: "fallback-baseline",
          platform: "bilibili" as const,
          title: "fallback baseline",
          author: "creator",
          url: "https://example.com/baseline",
          description: "baseline",
          publishedAt: "2026-07-02T12:00:00.000Z",
          viewCount: 90000,
          likeCount: 1000,
          favoriteCount: 300,
          commentCount: 100,
          growthScore: 0,
          growthReason: ""
        }
      ]
    };

    const result = await getHotVideos({
      category: defaultInput.category,
      platform: "bilibili",
      liveSource,
      fallbackSource,
      now
    });

    expect(result.source).toBe("fallback");
    expect(result.fallbackReason).toBe("实时榜单不足 10 条，已切换到本地演示样本。");
    expect(result.videos.map((video) => video.id)).toEqual(["fallback-fast"]);
  });

  it("passes the selected platform into trend sources", async () => {
    const seenPlatforms: string[] = [];
    const fallbackSource = {
      fetchCandidates: async (_category: typeof defaultInput.category, platform = "bilibili") => {
        seenPlatforms.push(platform);
        return [
          {
            id: "douyin-fast",
            platform: "douyin" as const,
            title: "douyin fast sample",
            author: "creator",
            url: "https://www.douyin.com",
            description: "fast",
            publishedAt: "2026-07-04T06:00:00.000Z",
            viewCount: 220000,
            likeCount: 12000,
            favoriteCount: 5000,
            commentCount: 900,
            growthScore: 0,
            growthReason: ""
          },
          {
            id: "douyin-baseline",
            platform: "douyin" as const,
            title: "douyin baseline sample",
            author: "creator",
            url: "https://www.douyin.com",
            description: "baseline",
            publishedAt: "2026-07-02T12:00:00.000Z",
            viewCount: 90000,
            likeCount: 1000,
            favoriteCount: 300,
            commentCount: 100,
            growthScore: 0,
            growthReason: ""
          }
        ];
      }
    };

    const result = await getHotVideos({
      category: defaultInput.category,
      platform: "douyin",
      liveSource: fallbackSource,
      fallbackSource,
      now: new Date("2026-07-04T12:00:00.000Z")
    });

    expect([...new Set(seenPlatforms)]).toEqual(["douyin"]);
    expect(result.platform).toBe("douyin");
    expect(result.videos[0].platform).toBe("douyin");
  });

  it("generates a creator plan through an application use case", async () => {
    const plan = await generateCreatorPlan(defaultInput);

    expect(plan.directions).toHaveLength(3);
    expect(plan.analysis.copyLogic).toHaveLength(4);
  });

  it("falls back to video metadata when the FunASR microservice is unavailable", async () => {
    const result = await transcribeVideoReference({
      video: {
        id: "fallback-transcript",
        platform: "bilibili",
        title: "爆款视频标题",
        author: "creator",
        url: "https://example.com/video",
        description: "这是一段用于 fallback 的视频简介",
        publishedAt: "2026-07-04T06:00:00.000Z",
        viewCount: 200000,
        likeCount: 5000,
        favoriteCount: 2000,
        commentCount: 800,
        growthScore: 180,
        growthReason: "5日快速增长"
      },
      transcriber: {
        transcribe: async () => {
          throw new Error("FunASR unavailable");
        }
      }
    });

    expect(result.source).toBe("fallback");
    expect(result.fullText).toContain("爆款视频标题");
    expect(result.fullText).toContain("这是一段用于 fallback 的视频简介");
    expect(result.segments[0].text).toContain("爆款视频标题");
  });
});

// ---------------------------------------------------------------------------
// P0 差异化算法相关测试
// ---------------------------------------------------------------------------

describe("candidate direction generation", () => {
  it("generates three candidate directions with placeholder scores", () => {
    const directions = generateCandidateDirections({
      category: defaultInput.category,
      hotspot: defaultInput.hotspot,
      creatorPositioning: defaultInput.creatorPositioning
    });

    expect(directions).toHaveLength(3);
    expect(directions[0].angle).toContain("对立翻转");
    expect(directions[1].angle).toContain("人群下钻");
    expect(directions[2].angle).toContain("维度升降");
    expect(directions.every((direction) => direction.uniquenessScore > 0)).toBe(true);
    expect(directions.every((direction) => direction.outline.length >= 4)).toBe(true);
  });
});

describe("LocalDifferentiationClient", () => {
  const client = new LocalDifferentiationClient();

  it("returns fallback uniqueness scores for candidate angles", async () => {
    const result = await client.scoreUniqueness({
      candidateAngles: ["对立翻转角度", "人群下钻角度"],
      referenceTexts: ["AI搜索改变信息获取", "普通人如何用AI工具"]
    });

    expect(result.scores).toHaveLength(2);
    expect(result.scores.every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(result.source).toBe("fallback");
  });

  it("returns fallback competition score for a query against corpus", async () => {
    const result = await client.scoreCompetition({
      query: "对立翻转：从机会叙事转向代价",
      corpus: ["AI搜索改变信息获取", "普通人如何用AI工具", "职场新人成长指南"]
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.corpusSize).toBe(3);
    expect(result.source).toBe("fallback");
  });

  it("returns 50 for empty corpus", async () => {
    const result = await client.scoreCompetition({
      query: "任意角度",
      corpus: []
    });

    expect(result.score).toBe(50);
    expect(result.corpusSize).toBe(0);
  });
});

describe("scoreDifferentiation engine", () => {
  it("scores candidate directions using the differentiator port", async () => {
    const mockDifferentiator: DifferentiationPort = {
      scoreUniqueness: async ({ candidateAngles }) => ({
        scores: candidateAngles.map((_, index) => 90 - index * 10),
        source: "mock"
      }),
      scoreCompetition: async ({ corpus }) => ({
        score: 30,
        topicId: 0,
        topicSize: 5,
        corpusSize: corpus.length,
        source: "mock"
      })
    };

    const directions = generateCandidateDirections({
      category: defaultInput.category,
      hotspot: defaultInput.hotspot,
      creatorPositioning: defaultInput.creatorPositioning
    });

    const result = await scoreDifferentiation({
      directions,
      referenceTexts: ["参照文本1", "参照文本2"],
      differentiator: mockDifferentiator
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions[0].uniquenessScore).toBe(90);
    expect(result.directions.every((direction) => direction.competitionScore === 30)).toBe(true);
    expect(result.meta.source).toBe("mock");
  });

  it("falls back gracefully when the differentiator throws", async () => {
    const failingDifferentiator: DifferentiationPort = {
      scoreUniqueness: async () => {
        throw new Error("service unavailable");
      },
      scoreCompetition: async () => {
        throw new Error("service unavailable");
      }
    };

    const directions = generateCandidateDirections({
      category: defaultInput.category,
      hotspot: defaultInput.hotspot,
      creatorPositioning: defaultInput.creatorPositioning
    });

    const result = await scoreDifferentiation({
      directions,
      referenceTexts: [],
      differentiator: failingDifferentiator
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((direction) => direction.uniquenessScore > 0)).toBe(true);
    expect(result.meta.source).toBe("fallback");
  });

  it("sorts directions by composite score (uniqueness - competition/2)", async () => {
    const mockDifferentiator: DifferentiationPort = {
      scoreUniqueness: async ({ candidateAngles }) => {
        const scores = [60, 95, 70];
        return { scores, source: "mock" };
      },
      scoreCompetition: async () => ({
        score: 40,
        topicId: 0,
        topicSize: 3,
        corpusSize: 10,
        source: "mock"
      })
    };

    const directions = generateCandidateDirections({
      category: defaultInput.category,
      hotspot: defaultInput.hotspot,
      creatorPositioning: defaultInput.creatorPositioning
    });

    const result = await scoreDifferentiation({
      directions,
      referenceTexts: [],
      differentiator: mockDifferentiator
    });

    // 第二个方向 uniqueness=95, competition=40 → composite = 95-20 = 75（最高）
    expect(result.directions[0].uniquenessScore).toBe(95);
  });
});

describe("analyzeUploadedVideo use case", () => {
  it("produces a full differentiation analysis for an uploaded video", async () => {
    const localClient = new LocalDifferentiationClient();

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索正在改变信息获取",
        transcript: "你以为搜索是在找答案，其实是在外包判断。中段对比传统搜索和AI搜索的使用路径。",
        commentSignals: "普通人怎么判断AI答案真假？",
        creatorPositioning: defaultInput.creatorPositioning
      },
      differentiator: localClient,
      knowledgeRepository: new LocalKnowledgeRepository(),
      referenceTexts: ["AI搜索改变信息获取", "普通人如何用AI工具"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis.hookPattern).toContain("反常识");
    expect(result.analysis.copyLogic).toHaveLength(4);
    expect(result.directions.every((direction) => direction.uniquenessScore > 0)).toBe(true);
    expect(result.directions.every((direction) => direction.competitionScore >= 0)).toBe(true);
    expect(result.differentiationMeta.source).toBe("fallback");
    expect(result.summary).toContain("AI科技");
  });

  it("works even with empty reference texts", async () => {
    const localClient = new LocalDifferentiationClient();

    const result = await analyzeUploadedVideo({
      input: {
        category: "知识科普",
        hotspot: "黑洞",
        title: "黑洞里面到底是什么",
        transcript: "黑洞不是洞，而是一个引力极端的区域。",
        commentSignals: "",
        creatorPositioning: "科普创作者"
      },
      differentiator: localClient,
      knowledgeRepository: new LocalKnowledgeRepository(),
      referenceTexts: []
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis).toBeDefined();
  });
});
