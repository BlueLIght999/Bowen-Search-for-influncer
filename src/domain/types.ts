export type Category = "时评热点" | "知识科普" | "职场成长" | "商业分析" | "AI科技" | "教育观察";

export interface MvpInput {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  sampleText: string;
  commentSignals: string;
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
  directions: DifferentiatedDirection[];
  differentiationMeta: DifferentiationScoreMeta;
  reviewPrompt: string;
}
