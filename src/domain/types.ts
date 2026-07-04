export type Category = "时评热点" | "知识科普" | "职场成长" | "商业分析" | "AI科技" | "教育观察";

export interface MvpInput {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  sampleText: string;
  commentSignals: string;
}

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

export interface GeneratedPlan {
  summary: string;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  directions: DifferentiatedDirection[];
  reviewPrompt: string;
}
