import { describe, expect, it, vi } from "vitest";
import { generateInterviewOutline } from "../src/application/useCases/generateInterviewOutline";
import type { OutlineGenerationPort } from "../src/application/ports/OutlineGenerationPort";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge, KnowledgeItem } from "../src/domain/types";

function makeFakeGenerator(): OutlineGenerationPort {
  return {
    generate: vi.fn().mockResolvedValue({
      questions: [
        {
          question: "你怎么看待创业？",
          purpose: "引导开放性回答",
          expectedDirection: "个人感受与思考",
          followUps: [
            { question: "是什么让你做了这个决定？", trigger: "回答中提到决定", purpose: "深挖动机" },
          ],
          collectiblePotential: "high" as const,
          viralityDimension: "opinion",
        },
      ],
      hookSuggestions: ["所有人都觉得创业是勇敢，其实那是恐惧"],
      closingStrategy: "最后有什么建议给想创业的人？",
      collectibleHighlights: ["创业最难的不是找钱，是找到不骗自己的勇气"],
      differentiationAngle: "从恐惧而非勇敢的角度切入创业",
    }),
  };
}

function makeFakeKnowledgeRepo(): KnowledgeRepositoryPort {
  const item: KnowledgeItem = {
    id: "k1",
    category: "通用",
    title: "开放性提问",
    strategy: "用'你怎么看待'引导深度回答",
    appliesWhen: ["提问技巧"],
    type: "interview_technique",
    source: "interview-collector",
  };
  return {
    retrieve: vi.fn().mockResolvedValue([
      { item, score: 5, matchReasons: [] },
    ] as RetrievedKnowledge[]),
  };
}

describe("generateInterviewOutline", () => {
  it("returns an outline with questions and hooks", async () => {
    const result = await generateInterviewOutline({
      input: {
        topic: "创业心路",
        guestProfile: "前大厂员工",
        creatorPositioning: "职场博主",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.topic).toBe("创业心路");
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.hookSuggestions.length).toBeGreaterThan(0);
    expect(result.closingStrategy).toBeTruthy();
  });

  it("includes follow-up questions for each main question", async () => {
    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    for (const q of result.questions) {
      expect(q.followUps.length).toBeGreaterThan(0);
      expect(q.id).toBeTruthy();
    }
  });

  it("includes collectible highlights", async () => {
    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.collectibleHighlights.length).toBeGreaterThan(0);
  });

  it("falls back to rules when generator fails", async () => {
    const failingGenerator: OutlineGenerationPort = {
      generate: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    };

    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "前大厂员工",
        creatorPositioning: "职场博主",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: failingGenerator,
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    // 降级后仍然有问题和钩子
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.hookSuggestions.length).toBeGreaterThan(0);
    expect(result.differentiationAngle).toBeTruthy();
  });

  it("handles knowledge repo failure gracefully", async () => {
    const failingRepo: KnowledgeRepositoryPort = {
      retrieve: vi.fn().mockRejectedValue(new Error("db down")),
    };

    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: failingRepo,
      },
    });

    expect(result.questions.length).toBeGreaterThan(0);
  });

  it("passes knowledge context to the generator", async () => {
    const generator = makeFakeGenerator();
    await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: generator,
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "创业",
        knowledgeContext: expect.any(String),
        questionSkeletons: expect.any(Array),
      })
    );
  });

  it("assigns unique ids to questions", async () => {
    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    const ids = result.questions.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("includes differentiation angle in result", async () => {
    const result = await generateInterviewOutline({
      input: {
        topic: "创业",
        guestProfile: "创业者",
        creatorPositioning: "职场博主",
        category: "通用" as never,
      },
      deps: {
        outlineGenerator: makeFakeGenerator(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.differentiationAngle).toBeTruthy();
    expect(result.differentiationAngle.length).toBeGreaterThan(0);
  });
});
