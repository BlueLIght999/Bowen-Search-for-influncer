import { describe, expect, it, vi } from "vitest";
import { diagnoseInterviewVideo } from "../src/application/useCases/diagnoseInterviewVideo";
import type { InterviewAnalysisPort } from "../src/application/ports/InterviewAnalysisPort";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge, KnowledgeItem } from "../src/domain/types";

const SAMPLE_TRANSCRIPT = `
大家好，今天我们请到了张三，他之前在阿里做了八年，去年出来创业了。
你怎么看待从大厂出来的那一刻？
其实那一刻不是兴奋，是恐惧。所有人都觉得你很勇敢，但你知道自己只是没有退路了。
是什么让你做了这个决定？
是有一天开会的时候，领导说我们要做创新，但我发现所谓的创新只是在PPT上改数字。
那创业最难的是什么？
创业最难的不是找钱，是找到不骗自己的勇气。
最后有什么想对想出来创业的人说的？
不要因为 escape 一个地方而创业，要因为 toward 一个东西而创业。
`;

function makeFakeAnalyzer(
  overrides: Partial<InterviewAnalysisPort> = {}
): InterviewAnalysisPort {
  return {
    analyze: vi.fn().mockResolvedValue({
      structure: {
        openingPattern: "陈述开场",
        topicIntroduction: "嘉宾介绍",
        questionProgression: "检测到3个提问，形成追问链",
        followUpDepth: "追问深度良好",
        closingPattern: "金句收尾",
        structureScore: 80,
      },
      questionQuality: {
        questionDepth: 75,
        openness: 80,
        followUpEffectiveness: 70,
        paceControl: 65,
        weakQuestions: [],
        strongQuestions: ["你怎么看待从大厂出来的那一刻？"],
      },
      collectibleMoments: [
        {
          moment: "创业最难的不是找钱，是找到不骗自己的勇气",
          reason: "金句，可独立传播",
          timestampRange: "05:00-05:10",
          viralityDimension: "quotable" as const,
        },
      ],
      suggestions: [
        {
          target: "followup" as const,
          issue: "追问深度可以进一步加强",
          action: "在受访者给出观点后，追问具体场景",
          priority: "medium" as const,
        },
      ],
    }),
    ...overrides,
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
      { item, score: 5, matchReasons: ["keyword: 提问技巧"] },
    ] as RetrievedKnowledge[]),
  };
}

describe("diagnoseInterviewVideo", () => {
  it("returns a completed diagnosis report with structure analysis", async () => {
    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业心路",
        creatorPositioning: "职场博主",
        guestProfile: "前大厂员工",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.status).toBe("completed");
    expect(result.interviewStructure).toBeDefined();
    expect(result.interviewStructure.structureScore).toBeGreaterThan(0);
  });

  it("includes question quality assessment in the report", async () => {
    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业心路",
        creatorPositioning: "职场博主",
        guestProfile: "前大厂员工",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.questionQuality).toBeDefined();
    expect(result.questionQuality.openness).toBeGreaterThanOrEqual(0);
    expect(result.questionQuality.openness).toBeLessThanOrEqual(100);
  });

  it("includes collectible moments in the report", async () => {
    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业心路",
        creatorPositioning: "职场博主",
        guestProfile: "前大厂员工",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.collectibleMoments.length).toBeGreaterThan(0);
    expect(result.collectibleMoments[0].moment).toBeTruthy();
  });

  it("includes improvement suggestions in the report", async () => {
    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业心路",
        creatorPositioning: "职场博主",
        guestProfile: "前大厂员工",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.improvementSuggestions.length).toBeGreaterThan(0);
  });

  it("falls back to rules_fallback when analyzer fails", async () => {
    const failingAnalyzer = makeFakeAnalyzer({
      analyze: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    });

    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业心路",
        creatorPositioning: "职场博主",
        guestProfile: "前大厂员工",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: failingAnalyzer,
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.status).toBe("completed");
    expect(result.analysisMode).toBe("rules_fallback");
    // 应该仍然有结构分析（来自规则引擎）
    expect(result.interviewStructure.structureScore).toBeGreaterThan(0);
  });

  it("handles empty transcript gracefully", async () => {
    const failingAnalyzer = makeFakeAnalyzer({
      analyze: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    });

    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "测试",
        creatorPositioning: "",
        guestProfile: "",
        transcript: "",
        commentSignals: "",
      },
      deps: {
        analyzer: failingAnalyzer,
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.status).toBe("completed");
    expect(result.interviewStructure.structureScore).toBe(0);
  });

  it("generates unique jobId for each diagnosis", async () => {
    const r1 = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "A",
        creatorPositioning: "",
        guestProfile: "",
        transcript: "测试？",
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    const r2 = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "B",
        creatorPositioning: "",
        guestProfile: "",
        transcript: "测试？",
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(r1.jobId).not.toBe(r2.jobId);
  });

  it("includes source field indicating analysis origin", async () => {
    const result = await diagnoseInterviewVideo({
      input: {
        category: "通用" as never,
        topic: "创业",
        creatorPositioning: "",
        guestProfile: "",
        transcript: SAMPLE_TRANSCRIPT,
        commentSignals: "",
      },
      deps: {
        analyzer: makeFakeAnalyzer(),
        knowledgeRepo: makeFakeKnowledgeRepo(),
      },
    });

    expect(result.source).toBeTruthy();
  });
});
