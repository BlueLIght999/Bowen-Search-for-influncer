export type Category = "时评热点" | "知识科普" | "职场成长" | "商业分析" | "AI科技" | "教育观察";

export interface MvpInput {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  sampleText: string;
  commentSignals: string;
  modelSignals?: string[];
}

export type Platform = "bilibili" | "douyin" | "weibo";

export interface SampleAnalysis {
  hookPattern: string;
  copyLogic: string[];
  emotionalTrigger: string;
  sceneStyle: string;
  shotRhythm: string;
  collectibleMoment: string;
}

export interface KnowledgeItem {
  id: string;
  category: Category | "通用";
  title: string;
  strategy: string;
  appliesWhen: string[];
  /** 知识类型（向量检索过滤用） */
  type?: "hook_strategy" | "script_structure" | "scene_design" | "ai_drama_pattern" | "aesthetic_rule" | "platform_growth_rule" | "interview_technique" | "interview_structure" | "interview_hook" | "interview_collectible";
  /** 对应的评估维度 */
  dimension?: "scriptQuality" | "hookStrength" | "sceneDesign" | "aestheticExperience" | "emotionalRhythm" | "differentiation" | "viralPotential" | "aiDramaFit";
  /** 检索辅助标签 */
  tags?: string[];
  /** 知识来源标识 */
  source?: string;
  /** 知识版本号 */
  version?: string;
}

export interface RetrievedKnowledge {
  item: KnowledgeItem;
  score: number;
  matchReasons: string[];
}

export interface DifferentiatedDirection {
  title: string;
  angle: string;
  uniquenessScore: number;
  competitionScore: number;
  explosionStrategy: string;
  filmingAdvice: string;
  outline: string[];
}

export interface WorkEvaluationDimension {
  dimension: string;
  score: number;
  description: string;
  keywords: string[];
}

export interface GeneratedPlan {
  summary: string;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  directions: DifferentiatedDirection[];
  evaluation: WorkEvaluationDimension[];
  reviewPrompt: string;
}

export interface VideoTrend {
  id: string;
  platform: Platform;
  title: string;
  author: string;
  url: string;
  description: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  growthScore: number;
  growthReason: string;
}

export interface TrendFetchResult {
  source: "live" | "fallback";
  platform: Platform;
  updatedAt: string;
  fallbackReason?: string;
  videos: VideoTrend[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  source: "funasr" | "fallback";
  language?: string;
  duration?: number;
  fullText: string;
  segments: TranscriptionSegment[];
}

// ---------------------------------------------------------------------------
// 上传视频差异化分析相关类型
// ---------------------------------------------------------------------------

export interface UploadedVideoInput {
  category: Category;
  hotspot: string;
  title: string;
  transcript: string;
  commentSignals: string;
  creatorPositioning: string;
}

export interface DifferentiationScoreMeta {
  source: string;
  topicId?: number;
  topicSize?: number;
  corpusSize?: number;
}

export interface UploadedVideoAnalysis {
  summary: string;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  knowledgeRetrieval: KnowledgeRetrievalSummary;
  directions: DifferentiatedDirection[];
  differentiationMeta: DifferentiationScoreMeta;
  report: VideoAnalysisReport;
  reviewPrompt: string;
}

export interface KnowledgeRetrievalSummary {
  status: "completed" | "failed";
  evidenceCount: number;
  reason?: string;
}

export type AnalysisJobStatus =
  | "uploaded"
  | "extracting_audio"
  | "transcribing"
  | "sampling_frames"
  | "visually_understanding"
  | "reasoning"
  | "retrieving_knowledge"
  | "evaluating"
  | "completed"
  | "failed";

export interface VideoAnalysisJob {
  id: string;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  confidence: "high" | "medium" | "low";
  segments?: TranscriptSegment[];
}

export interface SceneSegment {
  start: number;
  end: number;
  summary: string;
  signals: string[];
}

export interface AiDramaSignal {
  type: "hook" | "relationship" | "conflict" | "reversal" | "cliffhanger" | "series_potential";
  label: string;
  evidence: string;
}

export interface SubtitleSignal {
  frameIndex: number;
  text: string;
  confidence: number;
}

export interface VideoObservation {
  contentType: "ai_drama" | "talking_head" | "mixed" | "unknown";
  scenes: SceneSegment[];
  visualTags: string[];
  aiDramaSignals: AiDramaSignal[];
  subtitleSignals: SubtitleSignal[];
  evidenceConfidence: "high" | "medium" | "low";
  claims?: import("./multimodalIntelligence/VideoEvidence").ReasoningClaim[];
  narrative?: import("./multimodalIntelligence/MultimodalUnderstanding").MultimodalNarrative;
  visualCraft?: import("./multimodalIntelligence/MultimodalUnderstanding").MultimodalVisualCraft;
}

export interface ExplosionSuggestion {
  title: string;
  target: "hook" | "script" | "scene" | "subtitle" | "ending" | "differentiation";
  reason: string;
  action: string;
}

export interface EvaluationKeywordRecommendation {
  dimension:
    | "scriptQuality"
    | "hookStrength"
    | "sceneDesign"
    | "aestheticExperience"
    | "emotionalRhythm"
    | "differentiation"
    | "viralPotential"
    | "aiDramaFit";
  label: string;
  keywords: string[];
  reason: string;
}

export interface ContentEvaluation {
  summary: string;
  rubric?: import("./evaluation/EvaluationRubric").EvaluationRubricSummary;
  scores: {
    scriptQuality: number;
    hookStrength: number;
    sceneDesign: number;
    aestheticExperience: number;
    emotionalRhythm: number;
    differentiation: number;
    viralPotential: number;
    aiDramaFit?: number;
  };
  scoreReasons: {
    scriptQuality: string;
    hookStrength: string;
    sceneDesign: string;
    aestheticExperience: string;
    emotionalRhythm: string;
    differentiation: string;
    viralPotential: string;
    aiDramaFit?: string;
  };
  keywordRecommendations: EvaluationKeywordRecommendation[];
  hitPatterns: string[];
  missingPatterns: string[];
  suggestions: ExplosionSuggestion[];
}

export interface GeneratedViralOutline {
  titleOptions: string[];
  hook: string;
  scriptOutline: string[];
  sceneOutline: string[];
  endingHook: string;
  aiDramaOutline?: {
    relationship: string;
    conflict: string;
    reversal: string;
    cliffhanger: string;
  };
}

export interface CreatorInsightTimestampEvidence {
  startMs: number;
  endMs: number;
  label: string;
}

export interface CreatorInsights {
  script: {
    mainContent: string;
    logicBeats: string[];
    hookHits: string[];
    rewriteDirections: string[];
    timestampEvidence: CreatorInsightTimestampEvidence[];
  };
  visual: {
    sceneUnderstanding: string[];
    shotRhythm: string[];
    aestheticIssues: string[];
    timestampEvidence: CreatorInsightTimestampEvidence[];
  };
  viral: {
    viralBreakdown: string[];
    hitReasons: string[];
    weakPoints: string[];
    remakeSuggestions: string[];
    timestampEvidence: CreatorInsightTimestampEvidence[];
  };
}

export interface VideoAnalysisReport {
  jobId: string;
  status: "completed" | "failed";
  analysisMode: "multimodal" | "text_only" | "rules_fallback";
  modelSummary?: {
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    analyzedDurationMs: number;
    coverageRatio: number;
    partial: boolean;
  };
  video: {
    id: string;
    filename: string;
    durationSeconds?: number;
  };
  transcript: Transcript;
  understanding: VideoObservation;
  knowledgeEvidence: RetrievedKnowledge[];
  knowledgeSummary?: KnowledgeRetrievalSummary;
  creatorInsights?: CreatorInsights;
  evaluation: ContentEvaluation;
  generatedOutline: GeneratedViralOutline;
}
