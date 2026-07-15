/**
 * 提纲生成端口
 *
 * LLM 版和规则版输出同一结构，application 层不感知差异。
 */

export interface OutlineGenerationRequest {
  topic: string;
  guestProfile: string;
  creatorPositioning: string;
  knowledgeContext: string;
  questionSkeletons: string[];
}

export interface GeneratedQuestion {
  question: string;
  purpose: string;
  expectedDirection: string;
  followUps: Array<{
    question: string;
    trigger: string;
    purpose: string;
  }>;
  collectiblePotential: "high" | "medium" | "low";
  viralityDimension?: string;
}

export interface OutlineGenerationResult {
  questions: GeneratedQuestion[];
  hookSuggestions: string[];
  closingStrategy: string;
  collectibleHighlights: string[];
  differentiationAngle: string;
}

export interface OutlineGenerationPort {
  generate(input: OutlineGenerationRequest): Promise<OutlineGenerationResult>;
}
