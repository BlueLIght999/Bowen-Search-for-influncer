/**
 * 访谈领域类型定义
 *
 * 包含两部分：
 * 1. DistilledCaseJson — 匹配 interview-collector Python 服务输出的 JSON 结构
 * 2. 访谈诊断/提纲相关的 domain 类型
 *
 * 纯类型定义，不包含任何逻辑、不访问网络/文件/环境变量。
 */

// ---------------------------------------------------------------------------
// interview-collector 输出的 JSON 结构（只读，不修改 Python 端）
// ---------------------------------------------------------------------------

/** 访谈技巧（匹配 Python InterviewTechnique dataclass） */
export interface DistilledInterviewTechnique {
  technique: string;
  description: string;
  example_quote: string;
  timestamp_range: string;
  applicable_scene: string;
}

/** 钩子模式（匹配 Python HookPattern dataclass） */
export interface DistilledHookPattern {
  pattern: string;
  opening_line: string;
  psychological_trigger: string;
  retention_mechanism: string;
  score_estimate: number;
}

/** 传播力信号（匹配 Python ViralitySignal dataclass） */
export interface DistilledViralitySignal {
  dimension: string;
  matched_text: string;
  score: number;
  reason: string;
}

/** 内容结构片段（匹配 Python ContentSection dataclass） */
export interface DistilledContentSection {
  name: string;
  duration_ratio: number;
  purpose: string;
  technique: string;
}

/** 内容结构（匹配 Python ContentStructure dataclass） */
export interface DistilledContentStructure {
  overall_structure: string;
  sections: DistilledContentSection[];
  rhythm_pattern: string;
}

/** 收藏触发点（匹配 Python CollectibleMoment dataclass） */
export interface DistilledCollectibleMoment {
  moment: string;
  reason: string;
  timestamp_range: string;
}

/**
 * 蒸馏后的案例知识（匹配 Python DistilledCase dataclass）
 *
 * 这是 interview-collector 服务输出的 JSON 顶层结构。
 * infrastructure 层负责读取 JSON 文件并反序列化为此类型。
 */
export interface DistilledCaseJson {
  interview_techniques: DistilledInterviewTechnique[];
  hook_patterns: DistilledHookPattern[];
  virality_signals: DistilledViralitySignal[];
  content_structure: DistilledContentStructure | null;
  emotional_design: Record<string, unknown>;
  collectible_moments: DistilledCollectibleMoment[];
  reusable_formulas: string[];
}

/** interview-collector 输出的完整 JSON 文件结构 */
export interface DistilledCaseFile {
  video: {
    id: string;
    platform: string;
    title: string;
    author: string;
    url: string;
    duration: number;
  };
  transcript: {
    source: string;
    full_text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    language: string;
    duration: number;
  };
  distilled: DistilledCaseJson;
  collected_at: string;
}

// ---------------------------------------------------------------------------
// 访谈诊断报告类型
// ---------------------------------------------------------------------------

/** 传播力维度 */
export type ViralityDimension =
  | "hook"
  | "emotional"
  | "opinion"
  | "revelation"
  | "conflict"
  | "quotable"
  | "story"
  | "practical";

/** 访谈诊断输入 */
export interface InterviewDiagnosisInput {
  category: import("../types").Category;
  topic: string;
  creatorPositioning: string;
  guestProfile: string;
  transcript: string;
  commentSignals: string;
}

/** 访谈结构分析 */
export interface InterviewStructure {
  openingPattern: string;
  topicIntroduction: string;
  questionProgression: string;
  followUpDepth: string;
  closingPattern: string;
  structureScore: number;
}

/** 提问质量评估 */
export interface QuestionQuality {
  questionDepth: number;
  openness: number;
  followUpEffectiveness: number;
  paceControl: number;
  weakQuestions: string[];
  strongQuestions: string[];
}

/** 收藏触发点 */
export interface InterviewCollectibleMoment {
  moment: string;
  reason: string;
  timestampRange: string;
  viralityDimension: ViralityDimension;
}

/** 改进建议 */
export interface InterviewSuggestion {
  target: "question" | "structure" | "followup" | "pacing" | "hook";
  issue: string;
  action: string;
  priority: "high" | "medium" | "low";
}

/** 访谈诊断报告 */
export interface InterviewDiagnosisReport {
  jobId: string;
  status: "completed" | "failed";
  analysisMode: "multimodal" | "text_only" | "rules_fallback";
  interviewStructure: InterviewStructure;
  questionQuality: QuestionQuality;
  collectibleMoments: InterviewCollectibleMoment[];
  improvementSuggestions: InterviewSuggestion[];
  source: string;
}

// ---------------------------------------------------------------------------
// AI 访谈提纲生成器类型
// ---------------------------------------------------------------------------

/** 提纲生成输入 */
export interface InterviewOutlineInput {
  topic: string;
  guestProfile: string;
  creatorPositioning: string;
  category: import("../types").Category;
  referenceTexts?: string[];
}

/** 追问问题 */
export interface FollowUpQuestion {
  question: string;
  trigger: string;
  purpose: string;
}

/** 主问题 */
export interface InterviewQuestion {
  id: string;
  question: string;
  purpose: string;
  expectedDirection: string;
  followUps: FollowUpQuestion[];
  collectiblePotential: "high" | "medium" | "low";
  viralityDimension?: ViralityDimension;
}

/** 访谈提纲 */
export interface InterviewOutline {
  topic: string;
  guestProfile: string;
  hookSuggestions: string[];
  questions: InterviewQuestion[];
  closingStrategy: string;
  collectibleHighlights: string[];
  differentiationAngle: string;
}
