import type { DifferentiationPort } from "../ports/DifferentiationPort";
import type { KnowledgeRepositoryPort } from "../ports/KnowledgeRepositoryPort";
import type {
  AiDramaSignal,
  DifferentiatedDirection,
  KnowledgeItem,
  KnowledgeRetrievalSummary,
  RetrievedKnowledge,
  SampleAnalysis,
  UploadedVideoAnalysis,
  UploadedVideoInput,
  VideoObservation,
  VideoAnalysisReport
} from "../../domain/types";
import type {
  MultimodalUnderstanding,
  MultimodalVisualCraft
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import type { ReasoningClaim } from "../../domain/multimodalIntelligence/VideoEvidence";
import { createEvaluationRubricSummary } from "../../domain/evaluation/EvaluationRubric";
import { analyzeSample } from "../../engine/analyzeSample";
import { generateCandidateDirections } from "../../engine/generatePlan";
import { scoreDifferentiation } from "./scoreDifferentiation";
import { retrieveEvaluationKnowledge } from "./retrieveEvaluationKnowledge";

interface AnalyzeUploadedVideoOptions {
  input: UploadedVideoInput;
  differentiator: DifferentiationPort;
  referenceTexts?: string[];
  reportContext?: {
    jobId?: string;
    videoId?: string;
    filename?: string;
  };
  videoObservation?: VideoObservation;
  multimodalUnderstanding?: MultimodalUnderstanding;
  analysisMode?: VideoAnalysisReport["analysisMode"];
  knowledgeRepository: KnowledgeRepositoryPort;
}

export async function analyzeUploadedVideo(options: AnalyzeUploadedVideoOptions): Promise<UploadedVideoAnalysis> {
  const {
    input,
    differentiator,
    referenceTexts = [],
    reportContext,
    videoObservation,
    multimodalUnderstanding,
    analysisMode = multimodalUnderstanding ? "multimodal" : "rules_fallback",
    knowledgeRepository
  } = options;

  const analysis = analyzeSample({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning,
    sampleText: input.transcript || input.title,
    commentSignals: input.commentSignals
  });

  const knowledgeRetrieval = await retrieveEvaluationKnowledge({
    query: {
      category: input.category,
      hotspot: input.hotspot,
      creatorPositioning: input.creatorPositioning,
      sampleText: input.transcript || input.title,
      commentSignals: input.commentSignals,
      modelSignals: buildRagModelSignals(multimodalUnderstanding)
    },
    repository: knowledgeRepository,
    limit: 4
  });
  const knowledgeEvidence = knowledgeRetrieval.evidence;
  const knowledgeUsed = knowledgeEvidence.map(({ item }) => item);
  const knowledgeSummary: KnowledgeRetrievalSummary = {
    status: knowledgeRetrieval.status,
    evidenceCount: knowledgeEvidence.length,
    ...(knowledgeRetrieval.status === "failed"
      ? { reason: knowledgeRetrieval.reason }
      : {})
  };

  const candidateDirections = generateCandidateDirections({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning
  });

  const { directions, meta } = await scoreDifferentiation({
    directions: candidateDirections,
    referenceTexts,
    differentiator
  });

  const report = buildVideoAnalysisReport({
    input,
    analysis,
    knowledgeUsed,
    knowledgeEvidence,
    knowledgeSummary,
    directions,
    reportContext,
    videoObservation,
    multimodalUnderstanding,
    analysisMode
  });

  return {
    summary: `基于${input.category}品类和上传视频${input.title || input.hotspot}，博闻生成了${directions.length}个差异化制作方向。`,
    analysis,
    knowledgeUsed,
    knowledgeRetrieval: knowledgeSummary,
    directions,
    differentiationMeta: meta,
    report,
    reviewPrompt: "发布后回填播放量、完播率、收藏率、评论关键词，用于校准差异化评分。"
  };
}

function buildRagModelSignals(
  understanding?: MultimodalUnderstanding
): string[] {
  if (!understanding) {
    return [];
  }

  const signals = new Set<string>();
  addSignal(signals, understanding.contentType);
  if (understanding.contentType === "ai_drama") {
    addSignal(signals, "AI漫剧");
  }

  for (const scene of understanding.scenes) {
    addSignal(signals, scene.subtitleLegibility === "clear" ? "subtitle legibility" : "");
    for (const signal of scene.aiDramaSignals) {
      addSignal(signals, signal);
    }
    addCanonicalSignals(signals, scene.summary);
    for (const claim of scene.claims) {
      addCanonicalSignals(signals, claim.statement);
    }
  }

  for (const claim of collectMultimodalClaims(understanding)) {
    addCanonicalSignals(signals, claim.statement);
  }

  if (understanding.visualCraft.subtitleLegibility.length > 0) {
    addSignal(signals, "subtitle legibility");
  }
  if (understanding.visualCraft.styleConsistency.length > 0) {
    addSignal(signals, "style drift");
  }
  if (understanding.aiDrama?.cliffhanger) {
    addSignal(signals, "cliffhanger");
  }

  return [...signals].slice(0, 24);
}

function addCanonicalSignals(signals: Set<string>, value: string): void {
  const text = value.toLowerCase();
  if (
    (text.includes("identity") && text.includes("reversal")) ||
    text.includes("身份反转")
  ) {
    addSignal(signals, "identity reversal");
  }
  if (text.includes("cliffhanger") || text.includes("悬念") || text.includes("下一集")) {
    addSignal(signals, "cliffhanger");
  }
  if (text.includes("subtitle") && text.includes("legibility")) {
    addSignal(signals, "subtitle legibility");
  }
  if (text.includes("style drift") || text.includes("风格漂移")) {
    addSignal(signals, "style drift");
  }
}

function addSignal(signals: Set<string>, value: string): void {
  const trimmedValue = value.trim();
  if (trimmedValue) {
    signals.add(trimmedValue);
  }
}

function buildVideoAnalysisReport({
  input,
  analysis,
  knowledgeUsed,
  knowledgeEvidence,
  knowledgeSummary,
  directions,
  reportContext,
  videoObservation,
  multimodalUnderstanding,
  analysisMode
}: {
  input: UploadedVideoInput;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  knowledgeEvidence: RetrievedKnowledge[];
  knowledgeSummary: KnowledgeRetrievalSummary;
  directions: DifferentiatedDirection[];
  reportContext?: {
    jobId?: string;
    videoId?: string;
    filename?: string;
  };
  videoObservation?: VideoObservation;
  multimodalUnderstanding?: MultimodalUnderstanding;
  analysisMode: VideoAnalysisReport["analysisMode"];
}): VideoAnalysisReport {
  const projectedObservation = projectReportObservation({
    fallback: videoObservation,
    multimodalUnderstanding,
    analysis,
    input
  });
  const subtitleText = videoObservation?.subtitleSignals.map((signal) => signal.text).join(" ") ?? "";
  const rawText = [
    input.title,
    input.hotspot,
    input.transcript,
    input.commentSignals,
    subtitleText
  ].join(" ");
  const text = rawText.toLowerCase();
  const isAiDrama =
    projectedObservation.contentType === "ai_drama" ||
    hasAny(text, [
      "drama",
      "heroine",
      "villain",
      "betray",
      "revenge",
      "cliffhanger",
      "episode",
      "reversal",
      "ai漫剧",
      "漫剧",
      "短剧",
      "反转",
      "继承人",
      "下一集"
    ]);
  const aiDramaSignals =
    projectedObservation.aiDramaSignals ??
    (isAiDrama ? detectAiDramaSignals(text) : []);
  const hasSubtitleEvidence = (projectedObservation.subtitleSignals.length ?? 0) > 0;
  const hasVisualHook =
    hasSubtitleEvidence &&
    (hasAny(text, ["反转", "继承人", "真相", "下一集", "reversal", "identity", "truth"]) ||
      aiDramaSignals.some((signal) => signal.type === "hook" || signal.type === "reversal"));

  const scriptQuality = clampScore(58 + analysis.copyLogic.length * 6 + knowledgeUsed.length * 2);
  const hookStrength = clampScore(
    hasVisualHook ||
      hasAny(text, ["first scene", "3秒", "hook", "开头", "betray", "reversal", "反转"])
      ? 82
      : 62
  );
  const sceneDesign = clampScore(
    (videoObservation?.scenes.length ?? 0) > 1 ||
      hasAny(text, ["scene", "shot", "frame", "镜头", "分镜"])
      ? 76
      : 64
  );
  const aestheticExperience = clampScore(
    hasSubtitleEvidence ||
      hasAny(text, ["style", "visual", "字幕", "画风", "审美"])
      ? 74
      : 66
  );
  const emotionalRhythm = clampScore(
    56 +
      analysis.copyLogic.length * 4 +
      (isAiDrama ? aiDramaSignals.length * 3 : 0) +
      (hasSubtitleEvidence ? 5 : 0)
  );
  const differentiation = clampScore(
    directions.length > 0
      ? directions.reduce((sum, direction) => sum + direction.uniquenessScore, 0) / directions.length
      : 62 + knowledgeUsed.length * 3
  );
  const viralPotential = clampScore(
    (hookStrength + scriptQuality + emotionalRhythm + Math.min(92, differentiation)) / 4
  );
  const aiDramaFit = isAiDrama
    ? clampScore(64 + aiDramaSignals.length * 6 + (hasSubtitleEvidence ? 4 : 0))
    : undefined;
  const scoreReasons = buildScoreReasons({
    analysis,
    knowledgeUsed,
    directions,
    scriptQuality,
    hookStrength,
    sceneDesign,
    aestheticExperience,
    emotionalRhythm,
    differentiation,
    viralPotential,
    aiDramaFit,
    isAiDrama,
    hasSubtitleEvidence
  });
  const suggestions = buildSuggestions({
    input,
    isAiDrama,
    directions,
    hasSubtitleEvidence
  });
  const hitPatterns = [
    analysis.hookPattern,
    analysis.emotionalTrigger,
    ...(hasSubtitleEvidence
      ? [`画面字幕识别到 ${videoObservation?.subtitleSignals.length ?? 0} 条高置信内容`]
      : []),
    ...knowledgeUsed.slice(0, 2).map((item) => item.title)
  ].filter(Boolean);
  const missingPatterns = buildMissingPatterns({ text, isAiDrama });
  const generatedOutline = {
    titleOptions: buildTitleOptions(input, directions),
    hook: isAiDrama
      ? "前三秒直接呈现背叛、身份反转或核心冲突。"
      : "先抛出最反常识的判断，再解释背景和证据。",
    scriptOutline: buildScriptOutline(input, isAiDrama),
    sceneOutline: buildSceneOutline(isAiDrama),
    endingHook: isAiDrama
      ? "结尾抛出下一集追问：隐藏身份会如何改变局势？"
      : "结尾用下一步提问，引导观众对照自己的情况评论。",
    aiDramaOutline: isAiDrama ? buildAiDramaOutline(input, aiDramaSignals) : undefined
  };

  return {
    jobId: reportContext?.jobId || makeStableId("job", input.title || input.hotspot || input.transcript),
    status: "completed",
    analysisMode,
    modelSummary: multimodalUnderstanding
      ? {
          provider: multimodalUnderstanding.execution.provider,
          model: multimodalUnderstanding.execution.model,
          promptVersion: multimodalUnderstanding.execution.promptVersion,
          schemaVersion: multimodalUnderstanding.execution.schemaVersion,
          analyzedDurationMs:
            multimodalUnderstanding.evidenceCoverage.coveredDurationMs,
          coverageRatio:
            multimodalUnderstanding.evidenceCoverage.coverageRatio,
          partial: multimodalUnderstanding.execution.partial
        }
      : undefined,
    video: {
      id: reportContext?.videoId || makeStableId("video", input.title || input.hotspot || "uploaded-video"),
      filename: reportContext?.filename || input.title || "uploaded-video",
      durationSeconds: multimodalUnderstanding
        ? Math.round(
            multimodalUnderstanding.evidenceCoverage.coveredDurationMs / 1000
          )
        : undefined
    },
    transcript: {
      text: input.transcript || input.title || input.hotspot,
      confidence: input.transcript.length > 240 ? "high" : "medium",
      segments: [
        {
          start: 0,
          end: 30,
          text: (input.transcript || input.title || input.hotspot).slice(0, 180)
        }
      ]
    },
    understanding: projectedObservation,
    knowledgeEvidence,
    knowledgeSummary,
    creatorInsights: buildCreatorInsights({
      input,
      analysis,
      observation: projectedObservation,
      multimodalUnderstanding,
      scoreReasons,
      suggestions,
      hitPatterns,
      missingPatterns,
      generatedOutline
    }),
    evaluation: {
      summary: `报告基于文稿、画面证据、${knowledgeUsed.length} 条知识库依据和 ${directions.length} 个候选方向生成。`,
      rubric: createEvaluationRubricSummary(),
      scores: {
        scriptQuality,
        hookStrength,
        sceneDesign,
        aestheticExperience,
        emotionalRhythm,
        differentiation,
        viralPotential,
        aiDramaFit
      },
      scoreReasons,
      keywordRecommendations: buildKeywordRecommendations({
        isAiDrama,
        hasSubtitleEvidence,
        aiDramaSignals,
        directions
      }),
      hitPatterns,
      missingPatterns,
      suggestions
    },
    generatedOutline
  };
}

function buildCreatorInsights({
  input,
  analysis,
  observation,
  multimodalUnderstanding,
  scoreReasons,
  suggestions,
  hitPatterns,
  missingPatterns,
  generatedOutline
}: {
  input: UploadedVideoInput;
  analysis: SampleAnalysis;
  observation: VideoObservation;
  multimodalUnderstanding?: MultimodalUnderstanding;
  scoreReasons: VideoAnalysisReport["evaluation"]["scoreReasons"];
  suggestions: VideoAnalysisReport["evaluation"]["suggestions"];
  hitPatterns: string[];
  missingPatterns: string[];
  generatedOutline: VideoAnalysisReport["generatedOutline"];
}): NonNullable<VideoAnalysisReport["creatorInsights"]> {
  const claims = observation.claims ?? [];
  const narrative = multimodalUnderstanding?.narrative;
  const visualCraft = multimodalUnderstanding?.visualCraft;
  const timestampEvidence = buildTimestampEvidence(claims);
  const narrativeStatements = [
    narrative?.hook?.statement,
    narrative?.conflict?.statement,
    narrative?.reversal?.statement,
    narrative?.ending?.statement
  ].filter(isNonEmptyString);
  const sceneSummaries = observation.scenes
    .map((scene) => scene.summary)
    .filter(isNonEmptyString);

  return {
    script: {
      mainContent:
        narrative?.premise.statement ??
        summarizeTranscript(input.transcript || input.title || input.hotspot),
      logicBeats:
        narrativeStatements.length > 0
          ? narrativeStatements
          : generatedOutline.scriptOutline,
      hookHits: uniqueNonEmpty([
        ...hitPatterns,
        ...observation.aiDramaSignals.map((signal) =>
          localizeAiDramaSignalLabel(signal)
        ),
        analysis.hookPattern
      ]).slice(0, 6),
      rewriteDirections: uniqueNonEmpty(
        suggestions
          .filter((item) => item.target === "hook" || item.target === "script" || item.target === "differentiation")
          .map((item) => item.action)
      ).slice(0, 5),
      timestampEvidence
    },
    visual: {
      sceneUnderstanding: uniqueNonEmpty([
        ...claimStatements(visualCraft?.composition),
        ...(sceneSummaries.length > 0
          ? sceneSummaries
          : generatedOutline.sceneOutline)
      ]).slice(0, 6),
      shotRhythm: uniqueNonEmpty([
        ...claimStatements(visualCraft?.shotVariety),
        ...claimStatements(visualCraft?.pacing),
        ...generatedOutline.sceneOutline
      ]).slice(0, 6),
      aestheticIssues: uniqueNonEmpty([
        ...claimStatements(visualCraft?.subtitleLegibility),
        ...claimStatements(visualCraft?.styleConsistency),
        scoreReasons.aestheticExperience
      ]).slice(0, 5),
      timestampEvidence
    },
    viral: {
      viralBreakdown: uniqueNonEmpty([
        narrative?.hook?.statement,
        narrative?.reversal?.statement,
        narrative?.ending?.statement,
        scoreReasons.viralPotential
      ]).slice(0, 5),
      hitReasons: uniqueNonEmpty([
        ...hitPatterns,
        ...claimStatements(multimodalUnderstanding?.aiDrama?.conflict),
        ...claimStatements(multimodalUnderstanding?.aiDrama?.reversals),
        multimodalUnderstanding?.aiDrama?.cliffhanger?.statement
      ]).slice(0, 6),
      weakPoints:
        missingPatterns.length > 0
          ? missingPatterns
          : ["需要补足更明确的评论触发点或结尾追问。"],
      remakeSuggestions: uniqueNonEmpty([
        multimodalUnderstanding?.aiDrama?.seriesPotential?.statement,
        multimodalUnderstanding?.aiDrama?.cliffhanger?.statement,
        narrative?.ending?.statement,
        ...suggestions.map((item) => item.action),
        generatedOutline.endingHook
      ]).slice(0, 6),
      timestampEvidence
    }
  };
}

function buildTimestampEvidence(
  claims: ReasoningClaim[]
): NonNullable<VideoAnalysisReport["creatorInsights"]>["script"]["timestampEvidence"] {
  return claims
    .flatMap((claim) =>
      claim.evidenceRefs.map((reference) => ({
        startMs: reference.startMs,
        endMs: reference.endMs,
        label: claim.statement
      }))
    )
    .slice(0, 6);
}

function claimStatements(claims?: ReasoningClaim[]): string[] {
  return claims?.map((claim) => claim.statement).filter(isNonEmptyString) ?? [];
}

function summarizeTranscript(text: string): string {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return "未识别到完整文稿，当前报告基于标题、热点和可用画面证据生成。";
  }
  return trimmedText.length > 120
    ? `${trimmedText.slice(0, 120)}...`
    : trimmedText;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(isNonEmptyString))];
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function projectReportObservation({
  fallback,
  multimodalUnderstanding,
  analysis,
  input
}: {
  fallback?: VideoObservation;
  multimodalUnderstanding?: MultimodalUnderstanding;
  analysis: SampleAnalysis;
  input: UploadedVideoInput;
}): VideoObservation {
  if (!multimodalUnderstanding) {
    return (
      fallback ??
      buildFallbackObservation({
        analysis,
        isAiDrama: hasAny(
          `${input.title} ${input.hotspot} ${input.transcript}`.toLowerCase(),
          ["drama", "reversal", "ai漫剧", "漫剧", "短剧", "反转"]
        ),
        aiDramaSignals: []
      })
    );
  }

  const claims = collectMultimodalClaims(multimodalUnderstanding);

  return {
    contentType: multimodalUnderstanding.contentType,
    scenes: multimodalUnderstanding.scenes.map((scene) => ({
      start: scene.startMs / 1000,
      end: scene.endMs / 1000,
      summary: scene.summary,
      signals: [
        ...scene.visibleSubjects,
        ...scene.actions,
        ...scene.shotTypes,
        ...scene.aiDramaSignals
      ].filter(Boolean)
    })),
    visualTags: [
      ...(fallback?.visualTags ?? []),
      "multimodal",
      `coverage-${Math.round(
        multimodalUnderstanding.evidenceCoverage.coverageRatio * 100
      )}`
    ],
    aiDramaSignals: projectAiDramaSignals(multimodalUnderstanding),
    subtitleSignals: fallback?.subtitleSignals ?? [],
    evidenceConfidence: confidenceFromCoverage(
      multimodalUnderstanding.evidenceCoverage.coverageRatio
    ),
    claims,
    narrative: multimodalUnderstanding.narrative,
    visualCraft: multimodalUnderstanding.visualCraft
  };
}

function collectMultimodalClaims(
  understanding: MultimodalUnderstanding
): ReasoningClaim[] {
  const narrativeClaims = Object.values(understanding.narrative).filter(
    (claim): claim is ReasoningClaim => Boolean(claim)
  );
  const visualCraftClaims = Object.values(
    understanding.visualCraft
  ).flat() as ReasoningClaim[];
  const aiDramaClaims = understanding.aiDrama
    ? [
        ...understanding.aiDrama.conflict,
        ...understanding.aiDrama.reversals,
        ...understanding.aiDrama.styleDrift,
        understanding.aiDrama.cliffhanger,
        understanding.aiDrama.seriesPotential
      ].filter((claim): claim is ReasoningClaim => Boolean(claim))
    : [];

  return [...narrativeClaims, ...visualCraftClaims, ...aiDramaClaims];
}

function projectAiDramaSignals(
  understanding: MultimodalUnderstanding
): AiDramaSignal[] {
  if (!understanding.aiDrama) {
    return [];
  }

  return [
    ...understanding.aiDrama.conflict.map((claim) =>
      toAiDramaSignal("conflict", "冲突明确", claim)
    ),
    ...understanding.aiDrama.reversals.map((claim) =>
      toAiDramaSignal("reversal", "身份反转", claim)
    ),
    ...(understanding.aiDrama.cliffhanger
      ? [
          toAiDramaSignal(
            "cliffhanger",
            "续集悬念",
            understanding.aiDrama.cliffhanger
          )
        ]
      : []),
    ...(understanding.aiDrama.seriesPotential
      ? [
          toAiDramaSignal(
            "series_potential",
            "系列化潜力",
            understanding.aiDrama.seriesPotential
          )
        ]
      : [])
  ];
}

function toAiDramaSignal(
  type: AiDramaSignal["type"],
  label: string,
  claim: ReasoningClaim
): AiDramaSignal {
  return {
    type,
    label,
    evidence: claim.statement
  };
}

function localizeAiDramaSignalLabel(signal: AiDramaSignal): string {
  const normalizedLabel = signal.label.trim().toLowerCase();
  if (
    normalizedLabel === "fast hook" ||
    normalizedLabel === "strong opening candidate"
  ) {
    return "强钩子候选";
  }
  if (
    normalizedLabel === "clear relationship" ||
    normalizedLabel === "character relationship"
  ) {
    return "人物关系清晰";
  }
  if (normalizedLabel === "visible conflict") {
    return "冲突可视化";
  }
  if (normalizedLabel === "identity reversal") {
    return "身份反转";
  }
  if (
    normalizedLabel === "series hook" ||
    normalizedLabel === "next episode hook"
  ) {
    return "续集钩子";
  }
  if (normalizedLabel === "conflict") {
    return "冲突明确";
  }
  if (normalizedLabel === "reversal") {
    return "反转钩子";
  }
  if (normalizedLabel === "cliffhanger") {
    return "续集悬念";
  }
  if (normalizedLabel === "series potential") {
    return "系列化潜力";
  }
  return signal.label;
}

function confidenceFromCoverage(ratio: number): VideoObservation["evidenceConfidence"] {
  if (ratio >= 0.8) {
    return "high";
  }
  if (ratio >= 0.4) {
    return "medium";
  }
  return "low";
}

function buildScoreReasons({
  analysis,
  knowledgeUsed,
  directions,
  scriptQuality,
  hookStrength,
  sceneDesign,
  aestheticExperience,
  emotionalRhythm,
  differentiation,
  viralPotential,
  aiDramaFit,
  isAiDrama,
  hasSubtitleEvidence
}: {
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  directions: DifferentiatedDirection[];
  scriptQuality: number;
  hookStrength: number;
  sceneDesign: number;
  aestheticExperience: number;
  emotionalRhythm: number;
  differentiation: number;
  viralPotential: number;
  aiDramaFit?: number;
  isAiDrama: boolean;
  hasSubtitleEvidence: boolean;
}): VideoAnalysisReport["evaluation"]["scoreReasons"] {
  return {
    scriptQuality: `文案结构包含 ${analysis.copyLogic.length} 个推进节点，并命中 ${knowledgeUsed.length} 条知识库依据，脚本优秀度为 ${scriptQuality}。`,
    hookStrength: `开场钩子结合「${analysis.hookPattern}」与${hasSubtitleEvidence ? "字幕证据" : "文本信号"}评估，得分 ${hookStrength}。`,
    sceneDesign: `分镜表现依据场景片段、镜头/字幕信号和可拍摄节奏评估，得分 ${sceneDesign}。`,
    aestheticExperience: `审美体验依据画面字幕、视觉标签和信息清晰度评估，得分 ${aestheticExperience}。`,
    emotionalRhythm: `情绪节奏依据冲突推进、反转密度和段落节拍评估，得分 ${emotionalRhythm}。`,
    differentiation: `差异化依据 ${directions.length} 个候选方向的独特性评分和知识命中评估，得分 ${differentiation}。`,
    viralPotential: `传播潜力综合钩子、脚本、情绪节奏和差异化得出，得分 ${viralPotential}。`,
    aiDramaFit: isAiDrama
      ? `AI 漫剧适配度依据人物关系、冲突、反转、续集钩子和字幕可读性评估，得分 ${aiDramaFit ?? 0}。`
      : undefined
  };
}

function buildKeywordRecommendations({
  isAiDrama,
  hasSubtitleEvidence,
  aiDramaSignals,
  directions
}: {
  isAiDrama: boolean;
  hasSubtitleEvidence: boolean;
  aiDramaSignals: AiDramaSignal[];
  directions: DifferentiatedDirection[];
}): VideoAnalysisReport["evaluation"]["keywordRecommendations"] {
  const hasReversal = aiDramaSignals.some((signal) => signal.type === "reversal");
  const hasCliffhanger = aiDramaSignals.some((signal) => signal.type === "cliffhanger");
  const firstDirection = directions[0];

  return [
    {
      dimension: "scriptQuality",
      label: "脚本优秀度",
      keywords: isAiDrama
        ? [
            "冲突前置",
            "身份反转",
            hasCliffhanger ? "续集悬念" : "情绪债务"
          ]
        : ["反常识开场", "案例递进", "评论问题"],
      reason: isAiDrama
        ? "AI 漫剧脚本需要让人物关系、背叛原因和反转收益在短时间内成立。"
        : "通用短视频脚本需要清晰问题、证据和行动建议。"
    },
    {
      dimension: "hookStrength",
      label: "前三秒钩子",
      keywords: [
        hasSubtitleEvidence ? "首帧字幕钩子" : "开头利益点",
        hasReversal ? "反转预告" : "悬念提问",
        "强冲突开场"
      ],
      reason: "前三秒关键词用于指导首帧标题、开场台词和第一组画面信息。"
    },
    {
      dimension: "sceneDesign",
      label: "分镜表现",
      keywords: isAiDrama
        ? ["反应镜头", "证据特写", "身份揭晓镜头"]
        : ["对比画面", "步骤拆解", "结论卡片"],
      reason: "分镜关键词用于把文案节点转换成可拍摄、可剪辑的画面动作。"
    },
    {
      dimension: "aestheticExperience",
      label: "审美体验",
      keywords: [
        "高对比字幕",
        isAiDrama ? "统一画风" : "信息层级",
        hasSubtitleEvidence ? "字幕安全区" : "主体留白"
      ],
      reason: "审美关键词用于控制画面可读性、字幕压迫感和系列内容一致性。"
    },
    {
      dimension: "differentiation",
      label: "差异化",
      keywords: [
        firstDirection?.angle ? "差异角度" : "独特立场",
        "同题避让",
        "可系列化表达"
      ],
      reason: firstDirection?.angle || "通过关键词约束下一版内容不直接复述原视频。"
    }
  ];
}

function detectAiDramaSignals(text: string): AiDramaSignal[] {
  const signals: AiDramaSignal[] = [
    {
      type: "hook",
      label: "强钩子候选",
      evidence: "可以把最强冲突前置到开场前三秒。"
    },
    {
      type: "relationship",
      label: "人物关系清晰",
      evidence: "内容可以快速交代谁伤害、帮助或阻挡主角。"
    },
    {
      type: "conflict",
      label: "冲突可视化",
      evidence: "冲突驱动的短剧更容易让观众在缺少上下文时看懂。"
    }
  ];

  if (hasAny(text, ["reversal", "return", "identity", "反转", "身份"])) {
    signals.push({
      type: "reversal",
      label: "身份反转",
      evidence: "文稿包含反转、归来或隐藏身份信号。"
    });
  }

  if (hasAny(text, ["cliffhanger", "next episode", "下一集", "续集"])) {
    signals.push({
      type: "cliffhanger",
      label: "续集钩子",
      evidence: "内容包含后续展开或下一集信号。"
    });
  }

  return signals;
}

function buildFallbackObservation({
  analysis,
  isAiDrama,
  aiDramaSignals
}: {
  analysis: SampleAnalysis;
  isAiDrama: boolean;
  aiDramaSignals: AiDramaSignal[];
}): VideoObservation {
  return {
    contentType: isAiDrama ? "ai_drama" : "mixed",
    scenes: [
      {
        start: 0,
        end: 10,
        summary: "开场钩子与核心设定。",
        signals: [analysis.hookPattern, analysis.emotionalTrigger].filter(Boolean)
      },
      {
        start: 10,
        end: 45,
        summary: "主体冲突、证据或反转段落。",
        signals: analysis.copyLogic.slice(0, 3)
      }
    ],
    visualTags: isAiDrama
      ? ["ai-drama", "character-conflict", "subtitle-driven"]
      : ["uploaded-video", "script-driven"],
    aiDramaSignals,
    subtitleSignals: [],
    evidenceConfidence: "low"
  };
}

function buildMissingPatterns({ text, isAiDrama }: { text: string; isAiDrama: boolean }): string[] {
  const missing: string[] = [];
  if (!hasAny(text, ["3秒", "first three", "first scene", "开头"])) {
    missing.push("缺少明确的前三秒钩子");
  }
  if (isAiDrama && !hasAny(text, ["next episode", "cliffhanger", "下一集", "续集"])) {
    missing.push("缺少下一集悬念或续集追问");
  }
  if (!hasAny(text, ["comment", "评论", "ask", "互动"])) {
    missing.push("缺少能触发评论的问题");
  }
  return missing;
}

function buildSuggestions({
  input,
  isAiDrama,
  directions,
  hasSubtitleEvidence
}: {
  input: UploadedVideoInput;
  isAiDrama: boolean;
  directions: DifferentiatedDirection[];
  hasSubtitleEvidence: boolean;
}): VideoAnalysisReport["evaluation"]["suggestions"] {
  const firstDirection = directions[0];
  return [
    {
      title: "把最强冲突前置",
      target: "hook",
      reason: "短视频留存依赖观众立刻看懂情境和情绪代价。",
      action: isAiDrama
        ? "把背叛、反转或身份揭晓放进前三秒。"
        : "先给出最反常识的判断，再补充背景解释。"
    },
    {
      title: "把中段拆成可拍分镜",
      target: "scene",
      reason: "清晰节拍能让内容更容易复刻成稳定生产流程。",
      action: "将主体拆成铺垫、施压、反转、证据和结尾追问。"
    },
    ...(hasSubtitleEvidence
      ? [
          {
            title: "把识别字幕做成视觉钩子卡",
            target: "subtitle" as const,
            reason: "抽帧中已经有可读故事证据，可以支撑静音观看。",
            action: "把最强反转字幕保留在首帧，并压缩成一句明确判断。"
          }
        ]
      : []),
    {
      title: "增加差异化制作角度",
      target: "differentiation",
      reason: firstDirection?.angle || "该选题需要一个区别于泛泛点评的可识别角度。",
      action: firstDirection?.filmingAdvice || `围绕「${input.hotspot}」重构下一版内容。`
    }
  ];
}

function buildTitleOptions(input: UploadedVideoInput, directions: DifferentiatedDirection[]): string[] {
  return [
    `${input.hotspot}：这个隐藏反转很多人没看见`,
    directions[0]?.title || `${input.title || input.hotspot}：用更强钩子重做一版`
  ];
}

function buildScriptOutline(input: UploadedVideoInput, isAiDrama: boolean): string[] {
  if (isAiDrama) {
    return [
      "0-3s：立刻呈现背叛、身份反转或核心冲突。",
      "3-12s：交代主角、对手和情绪债务。",
      "12-30s：用一个可视证据继续加压。",
      "30-45s：给出反转，并留下下一集钩子。"
    ];
  }

  return [
    `0-3s：先抛出关于「${input.hotspot}」的最锋利判断。`,
    "3-15s：用一个具体用户场景定义问题。",
    "15-35s：给出对比、证据和可复用框架。",
    "35-45s：用一个能引发评论的问题收束。"
  ];
}

function buildSceneOutline(isAiDrama: boolean): string[] {
  return isAiDrama
    ? [
        "用大字幕近景呈现冲突。",
        "加入反应镜头，让权力关系更清楚。",
        "快切到证据或隐藏身份揭晓。",
        "结尾卡片保留一个未解问题。"
      ]
    : [
        "开场标题画面。",
        "口播或录屏讲解画面。",
        "对比说明画面。",
        "带评论问题的总结画面。"
      ];
}

function buildAiDramaOutline(
  input: UploadedVideoInput,
  signals: AiDramaSignal[]
): NonNullable<VideoAnalysisReport["generatedOutline"]["aiDramaOutline"]> {
  const labels = signals.map((signal) => signal.label).join(" / ");
  return {
    relationship:
      "用一个清晰反应镜头建立主角、背叛者和权力持有者的关系。",
    conflict: `把「${input.hotspot}」里的背叛或情绪债务转成第一眼可见的冲突。`,
    reversal:
      labels.length > 0
        ? `把「${labels}」作为身份反转证据，再解释主角为什么能反击。`
        : "在观众把场景当作普通铺垫前，先揭示隐藏身份。",
    cliffhanger:
      "结尾落在下一集决策上：谁会第一个发现主角的新身份？"
  };
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function makeStableId(prefix: string, value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
}
