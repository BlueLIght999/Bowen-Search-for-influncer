import { describe, expect, it } from "vitest";
import { analyzeUploadedVideo } from "../src/application/useCases/analyzeUploadedVideo";
import { LocalDifferentiationClient } from "../src/infrastructure/differentiation/LocalDifferentiationClient";
import { LocalKnowledgeRepository } from "../src/infrastructure/knowledge/LocalKnowledgeRepository";
import type { DifferentiationPort } from "../src/application/ports/DifferentiationPort";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import type { MultimodalUnderstanding } from "../src/domain/multimodalIntelligence/MultimodalUnderstanding";

const localKnowledgeRepository = new LocalKnowledgeRepository();

/**
 * analyzeUploadedVideo 用例边界测试
 *
 * 覆盖：
 * - 标准输入
 * - 空文案（仅有标题）
 * - 空标题（仅有文案）
 * - 超长文本
 * - 未知品类（默认回退）
 * - 空 referenceTexts
 * - 大量 referenceTexts
 * - differentiator 失败回退
 */

describe("analyzeUploadedVideo - 标准输入", () => {
  it("返回完整分析结果，包含 3 个方向、样本拆解和知识库", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索正在改变信息获取",
        transcript: "你以为搜索是在找答案，其实是在外包判断。对比传统搜索和AI搜索。",
        commentSignals: "普通人怎么判断AI答案真假？",
        creatorPositioning: "面向职场新人"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: ["AI搜索改变信息获取", "普通人如何用AI工具"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis.hookPattern).toContain("反常识");
    expect(result.analysis.copyLogic).toHaveLength(4);
    expect(result.knowledgeUsed.length).toBeGreaterThanOrEqual(1);
    expect(result.report.evaluation.rubric).toEqual({
      version: "bowen-content-evaluation-v1",
      checksum: "e72db704602f",
      dimensions: [
        "scriptQuality",
        "hookStrength",
        "sceneDesign",
        "aestheticExperience",
        "emotionalRhythm",
        "differentiation",
        "viralPotential",
        "aiDramaFit"
      ]
    });
    expect(result.reviewPrompt).toContain("收藏率");
    expect(result.summary).toContain("AI科技");
  });
});

describe("analyzeUploadedVideo - 边界输入", () => {
  it("仅有标题、无文案时仍能分析", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "知识科普",
        hotspot: "黑洞",
        title: "黑洞里面到底是什么",
        transcript: "",
        commentSignals: "",
        creatorPositioning: "科普创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: []
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis).toBeDefined();
  });

  it("仅有文案、无标题时仍能分析", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "时评热点",
        hotspot: "社会事件",
        title: "",
        transcript: "这是一段没有标题的视频文案，讲述了一个社会热点事件的来龙去脉。",
        commentSignals: "",
        creatorPositioning: "时评创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: ["相关热点1"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.summary).toContain("时评热点");
  });

  it("超长文案（5000 字）不会崩溃", async () => {
    const longText = "这是一段很长的视频文案。".repeat(500); // ~5000 字
    const result = await analyzeUploadedVideo({
      input: {
        category: "商业分析",
        hotspot: "商业模式",
        title: "商业模式深度分析",
        transcript: longText,
        commentSignals: "这个模式怎么赚钱？",
        creatorPositioning: "商业分析师"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: ["商业分析1", "商业分析2"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.analysis.copyLogic).toHaveLength(4);
  });

  it("空 referenceTexts 时仍能计算评分（回退值）", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "教育观察",
        hotspot: "教育改革",
        title: "教育改革新方向",
        transcript: "教育改革正在改变学习方式。",
        commentSignals: "",
        creatorPositioning: "教育观察者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: []
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.directions.every((d) => d.competitionScore >= 0)).toBe(true);
  });

  it("大量 referenceTexts（100 条）时仍能正常工作", async () => {
    const largeRefPool = Array.from({ length: 100 }, (_, i) => `参照视频标题${i}`);
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI工具",
        title: "AI工具评测",
        transcript: "这期视频评测了三款AI工具。",
        commentSignals: "",
        creatorPositioning: "AI工具评测者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: largeRefPool
    });

    expect(result.directions).toHaveLength(3);
  });
});

describe("analyzeUploadedVideo - differentiator 失败回退", () => {
  it("differentiator 全部抛错时，用例仍返回结果（引擎内部回退）", async () => {
    const failingDifferentiator: DifferentiationPort = {
      scoreUniqueness: async () => {
        throw new Error("service down");
      },
      scoreCompetition: async () => {
        throw new Error("service down");
      }
    };

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索分析",
        transcript: "AI搜索正在改变信息获取方式。",
        commentSignals: "",
        creatorPositioning: "面向职场新人"
      },
      differentiator: failingDifferentiator,
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: ["参照1"]
    });

    expect(result.directions).toHaveLength(3);
    expect(result.directions.every((d) => d.uniquenessScore > 0)).toBe(true);
    expect(result.differentiationMeta.source).toBe("fallback");
  });
});

describe("analyzeUploadedVideo - 品类与知识库", () => {
  it("AI科技品类召回 ai-verification 知识", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索",
        transcript: "AI搜索工具正在改变信息获取。",
        commentSignals: "AI工具真假怎么判断",
        creatorPositioning: "面向职场新人"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: []
    });

    expect(result.knowledgeUsed.some((item) => item.id === "ai-verification")).toBe(true);
  });

  it("通用知识（对立翻转）在任何品类下都能召回", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "职场成长",
        hotspot: "职场晋升",
        title: "职场晋升指南",
        transcript: "职场晋升不只是努力工作。",
        commentSignals: "",
        creatorPositioning: "职场博主"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: []
    });

    expect(result.knowledgeUsed.some((item) => item.id === "opposite-turn")).toBe(true);
  });

  it("使用多模态 narrative 和 visualCraft 信号增强 RAG 召回", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "知识科普",
        hotspot: "上传视频分析",
        title: "视频诊断",
        transcript: "这是一段普通视频文稿，本身没有短剧或字幕策略关键词。",
        commentSignals: "",
        creatorPositioning: "AI漫剧创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: [],
      multimodalUnderstanding: buildAiDramaUnderstanding()
    });

    const aiDrama = result.report.knowledgeEvidence.find(
      (item) => item.item.id === "ai-drama-reversal"
    );

    expect(aiDrama).toBeDefined();
    expect(aiDrama?.matchReasons).toContain("model-signal: identity reversal");
    expect(result.knowledgeUsed.some((item) => item.id === "ai-drama-reversal")).toBe(true);
  });

  it("projects model storyboard and viral remake claims into creatorInsights for the frontend", async () => {
    const understanding = buildAiDramaUnderstanding();
    const ref = understanding.narrative.premise.evidenceRefs[0];
    const modelClaim = (id: string, statement: string) => ({
      id,
      type: "inference" as const,
      statement,
      confidence: 0.84,
      evidenceRefs: [ref],
      knowledgeIds: []
    });
    understanding.visualCraft.composition = [
      modelClaim(
        "model_scene_understanding",
        "模型画面理解：开场用近景证据暴露冲突。"
      )
    ];
    understanding.visualCraft.shotVariety = [
      modelClaim(
        "model_storyboard",
        "模型分镜节奏：近景、反应、证据插入、悬念卡片依次推进。"
      )
    ];
    understanding.visualCraft.pacing = [
      modelClaim(
        "model_pacing",
        "模型节奏建议：第一次揭示应控制在前三秒内。"
      )
    ];
    understanding.aiDrama = {
      ...understanding.aiDrama!,
      seriesPotential: modelClaim(
        "model_remake",
        "模型同款建议：保留身份反转，并补一个更强的评论追问。"
      )
    };

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI drama",
        title: "AI drama upload",
        transcript: "The heroine is betrayed and returns with a new identity.",
        commentSignals: "",
        creatorPositioning: "AI drama creator"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: [],
      multimodalUnderstanding: understanding
    });

    expect(result.report.creatorInsights?.visual.sceneUnderstanding).toContain(
      "模型画面理解：开场用近景证据暴露冲突。"
    );
    expect(result.report.creatorInsights?.visual.shotRhythm).toEqual(
      expect.arrayContaining([
        "模型分镜节奏：近景、反应、证据插入、悬念卡片依次推进。",
        "模型节奏建议：第一次揭示应控制在前三秒内。"
      ])
    );
    expect(result.report.creatorInsights?.viral.remakeSuggestions).toContain(
      "模型同款建议：保留身份反转，并补一个更强的评论追问。"
    );
  });

  it("本地规则 fallback 的三栏展示字段保持中文", async () => {
    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI漫剧复仇反转",
        title: "失踪继承人归来",
        transcript:
          "女主被家族背叛后归来，开头揭露身份反转，中段展示证据，结尾留下下一集悬念。",
        commentSignals: "",
        creatorPositioning: "AI漫剧创作者"
      },
      differentiator: new LocalDifferentiationClient(),
      knowledgeRepository: localKnowledgeRepository,
      referenceTexts: []
    });

    const insights = result.report.creatorInsights!;
    expectChineseUserFacingText([
      insights.script.mainContent,
      ...insights.script.logicBeats,
      ...insights.script.hookHits,
      ...insights.script.rewriteDirections,
      ...insights.visual.sceneUnderstanding,
      ...insights.visual.shotRhythm,
      ...insights.visual.aestheticIssues,
      ...insights.viral.viralBreakdown,
      ...insights.viral.hitReasons,
      ...insights.viral.weakPoints,
      ...insights.viral.remakeSuggestions,
      result.report.evaluation.summary,
      ...result.report.evaluation.missingPatterns,
      ...result.report.evaluation.suggestions.flatMap((item) => [
        item.title,
        item.reason,
        item.action
      ]),
      ...result.report.generatedOutline.titleOptions,
      result.report.generatedOutline.hook,
      ...result.report.generatedOutline.scriptOutline,
      ...result.report.generatedOutline.sceneOutline,
      result.report.generatedOutline.endingHook,
      result.report.generatedOutline.aiDramaOutline?.relationship,
      result.report.generatedOutline.aiDramaOutline?.conflict,
      result.report.generatedOutline.aiDramaOutline?.reversal,
      result.report.generatedOutline.aiDramaOutline?.cliffhanger
    ]);
  });

  it("通过 KnowledgeRepositoryPort 获取 RAG 依据", async () => {
    const knowledgeRepository: KnowledgeRepositoryPort = {
      retrieve: async () => [
        {
          item: {
            id: "fake-port-knowledge",
            category: "通用",
            title: "Port 注入知识",
            strategy: "通过端口返回的策略。",
            appliesWhen: ["port"]
          },
          score: 9,
          matchReasons: ["model-signal: port"]
        }
      ]
    };

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索",
        transcript: "AI搜索工具正在改变信息获取。",
        commentSignals: "",
        creatorPositioning: "AI工具评测者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: [],
      knowledgeRepository
    });

    expect(result.knowledgeUsed.map((item) => item.id)).toContain("fake-port-knowledge");
    expect(result.report.knowledgeEvidence[0].matchReasons).toContain("model-signal: port");
  });

  it("知识仓储不可用时显式降级并继续生成报告", async () => {
    const knowledgeRepository: KnowledgeRepositoryPort = {
      retrieve: async () => {
        throw new Error("knowledge store unavailable");
      }
    };

    const result = await analyzeUploadedVideo({
      input: {
        category: "AI科技",
        hotspot: "AI搜索",
        title: "AI搜索",
        transcript: "AI搜索工具正在改变信息获取。",
        commentSignals: "",
        creatorPositioning: "AI工具评测者"
      },
      differentiator: new LocalDifferentiationClient(),
      referenceTexts: [],
      knowledgeRepository
    });

    expect(result.knowledgeUsed).toEqual([]);
    expect(result.knowledgeRetrieval).toEqual({
      status: "failed",
      evidenceCount: 0,
      reason: "knowledge store unavailable"
    });
    expect(result.report.knowledgeSummary).toEqual(result.knowledgeRetrieval);
  });
});

function buildAiDramaUnderstanding(): MultimodalUnderstanding {
  const ref = {
    startMs: 0,
    endMs: 3000,
    frameIds: ["frame_1"],
    transcriptSegmentIds: ["transcript_1"],
    ocrEvidenceIds: []
  };
  const claim = (id: string, statement: string) => ({
    id,
    type: "inference" as const,
    statement,
    confidence: 0.82,
    evidenceRefs: [ref],
    knowledgeIds: []
  });

  return {
    jobId: "job_model_rag",
    videoId: "video_model_rag",
    contentType: "ai_drama",
    scenes: [
      {
        id: "scene_1",
        sliceId: "slice_1",
        startMs: 0,
        endMs: 3000,
        summary: "女主身份反转提前出现，结尾留出下一集悬念。",
        visibleSubjects: ["女主"],
        actions: ["身份揭晓"],
        shotTypes: ["近景"],
        subtitleLegibility: "clear",
        aiDramaSignals: ["身份反转", "续集悬念"],
        confidence: 0.82,
        claims: [claim("scene_claim", "身份反转打开核心冲突")]
      }
    ],
    narrative: {
      premise: claim("premise", "AI 漫剧冲突建立很快"),
      reversal: claim("reversal", "身份反转成为主要钩子"),
      ending: claim("ending", "续集悬念推动下一集期待")
    },
    visualCraft: {
      composition: [],
      shotVariety: [],
      continuity: [],
      subtitleLegibility: [
        claim("subtitle", "字幕可读性支撑角色台词归属")
      ],
      styleConsistency: [
        claim("style", "生成镜头之间出现画风漂移")
      ],
      pacing: []
    },
    aiDrama: {
      conflict: [claim("conflict", "核心冲突可见")],
      reversals: [claim("ai_reversal", "身份反转驱动钩子")],
      styleDrift: [claim("style_drift", "画风漂移削弱连续性")],
      cliffhanger: claim("cliffhanger", "悬念制造下一集动机")
    },
    evidenceCoverage: {
      coveredRanges: [{ startMs: 0, endMs: 3000 }],
      coveredDurationMs: 3000,
      coverageRatio: 1
    },
    execution: {
      provider: "fake",
      model: "fake-temporal-reasoner-v1",
      promptVersion: "test-rag-v1",
      schemaVersion: "multimodal-video-v1",
      latencyMs: 0,
      status: "completed",
      partial: false
    }
  };
}

function expectChineseUserFacingText(items: Array<string | undefined>): void {
  const englishFallbackPhrases = [
    "Start with",
    "Open with",
    "End with",
    "Opening hook",
    "Main conflict",
    "Explicit first",
    "Next episode",
    "Comment-triggering",
    "Move the",
    "Turn the",
    "Put the",
    "Split the",
    "Close-up",
    "Reaction shot",
    "Summary frame",
    "Fast hook",
    "Visible conflict",
    "Identity reversal",
    "Series hook"
  ];

  const visibleItems = items.filter((item): item is string =>
    Boolean(item?.trim())
  );
  expect(visibleItems.length).toBeGreaterThan(0);

  for (const item of visibleItems) {
    expect(item).toMatch(/[\u4e00-\u9fff]/);
    for (const phrase of englishFallbackPhrases) {
      expect(item).not.toContain(phrase);
    }
  }
}
