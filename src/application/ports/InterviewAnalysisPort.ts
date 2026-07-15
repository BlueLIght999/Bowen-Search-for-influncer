/**
 * 访谈分析端口
 *
 * 规则版和 LLM 版输出同一结构，application 层不感知差异。
 */

import type {
  InterviewStructure,
  QuestionQuality,
  InterviewCollectibleMoment,
  InterviewSuggestion,
} from "../../domain/interview/types";

export interface InterviewAnalysisRequest {
  transcript: string;
  guestProfile: string;
  topic: string;
}

export interface InterviewAnalysisResult {
  structure: InterviewStructure;
  questionQuality: QuestionQuality;
  collectibleMoments: InterviewCollectibleMoment[];
  suggestions: InterviewSuggestion[];
}

export interface InterviewAnalysisPort {
  analyze(input: InterviewAnalysisRequest): Promise<InterviewAnalysisResult>;
}
