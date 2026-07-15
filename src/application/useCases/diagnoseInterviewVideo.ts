/**
 * 访谈视频诊断用例
 *
 * 编排流程：
 * 1. 调用 analyzeInterviewSample 纯函数获取结构分析
 * 2. 调用 scoreInterviewQuality 纯函数获取提问质量
 * 3. 调用 InterviewAnalysisPort 获取 LLM 增强分析（收藏触发点、改进建议）
 * 4. 如 LLM 失败，降级为 rules_fallback，用规则生成建议
 * 5. 组装 InterviewDiagnosisReport
 *
 * 降级链：
 * - L1 multimodal: analyzer 正常返回
 * - L2 rules_fallback: analyzer 失败，使用规则引擎结果 + 规则建议
 */

import type { InterviewAnalysisPort } from "../ports/InterviewAnalysisPort";
import type { KnowledgeRepositoryPort } from "../ports/KnowledgeRepositoryPort";
import type {
  InterviewDiagnosisInput,
  InterviewDiagnosisReport,
  InterviewStructure,
  QuestionQuality,
  InterviewCollectibleMoment,
  InterviewSuggestion,
} from "../../domain/interview/types";
import { analyzeInterviewSample } from "../../engine/analyzeInterviewSample";
import { scoreInterviewQuality } from "../../engine/scoreInterviewQuality";
import { retrieveInterviewKnowledge } from "./retrieveInterviewKnowledge";

export interface DiagnoseInterviewVideoDeps {
  analyzer: InterviewAnalysisPort;
  knowledgeRepo: KnowledgeRepositoryPort;
}

let jobIdCounter = 0;

export async function diagnoseInterviewVideo(params: {
  input: InterviewDiagnosisInput;
  deps: DiagnoseInterviewVideoDeps;
}): Promise<InterviewDiagnosisReport> {
  const { input, deps } = params;
  jobIdCounter += 1;
  const jobId = `iv-diag-${Date.now()}-${jobIdCounter}`;

  // 1. 规则引擎：结构分析
  const ruleStructure = analyzeInterviewSample(input);

  // 2. 规则引擎：提问质量
  const ruleQuality = scoreInterviewQuality(input.transcript, ruleStructure);

  // 3. 尝试 LLM 增强分析
  let analysisMode: "multimodal" | "text_only" | "rules_fallback" = "rules_fallback";
  let structure = ruleStructure;
  let questionQuality = ruleQuality;
  let collectibleMoments: InterviewCollectibleMoment[] = [];
  let suggestions: InterviewSuggestion[] = [];

  try {
    const llmResult = await deps.analyzer.analyze({
      transcript: input.transcript,
      guestProfile: input.guestProfile,
      topic: input.topic,
    });

    // LLM 成功：使用 LLM 结果（但保留规则引擎的结构评分作为基准）
    analysisMode = "text_only";
    structure = llmResult.structure;
    questionQuality = llmResult.questionQuality;
    collectibleMoments = llmResult.collectibleMoments;
    suggestions = llmResult.suggestions;
  } catch {
    // LLM 失败：降级到规则
    analysisMode = "rules_fallback";
    collectibleMoments = extractCollectibleMomentsFromRules(input.transcript);
    suggestions = generateRuleBasedSuggestions(ruleStructure, ruleQuality);
  }

  // 4. 检索知识库匹配改进建议
  try {
    const knowledge = await retrieveInterviewKnowledge(
      {
        topic: input.topic,
        guestProfile: input.guestProfile,
        creatorPositioning: input.creatorPositioning,
        sampleText: input.transcript.slice(0, 500),
      },
      deps.knowledgeRepo
    );

    // 将知识库建议追加到 suggestions
    for (const k of knowledge.slice(0, 2)) {
      suggestions.push({
        target: "question",
        issue: `可参考：${k.item.title}`,
        action: k.item.strategy.slice(0, 200),
        priority: "low",
      });
    }
  } catch {
    // 知识库检索失败不影响主流程
  }

  return {
    jobId,
    status: "completed",
    analysisMode,
    interviewStructure: structure,
    questionQuality,
    collectibleMoments,
    improvementSuggestions: suggestions,
    source: analysisMode === "rules_fallback" ? "rules-engine" : "llm-enhanced",
  };
}

/** 规则降级：从文稿中提取收藏触发点 */
function extractCollectibleMomentsFromRules(
  transcript: string
): InterviewCollectibleMoment[] {
  const moments: InterviewCollectibleMoment[] = [];

  // 查找金句候选：包含"不是...是..."句式的句子
  const goldenRegex = /[^。！？\n]*不是[^。！？\n]*是[^。！？\n]*[。！？]/g;
  const matches = transcript.match(goldenRegex);
  if (matches) {
    for (const match of matches.slice(0, 3)) {
      moments.push({
        moment: match.trim(),
        reason: "包含'不是...是...'句式，可能为金句",
        timestampRange: "",
        viralityDimension: "quotable",
      });
    }
  }

  return moments;
}

/** 规则降级：生成改进建议 */
function generateRuleBasedSuggestions(
  structure: InterviewStructure,
  quality: QuestionQuality
): InterviewSuggestion[] {
  const suggestions: InterviewSuggestion[] = [];

  // 开放性不足
  if (quality.openness < 50 && quality.weakQuestions.length > 0) {
    suggestions.push({
      target: "question",
      issue: `开放性评分偏低（${quality.openness}），存在${quality.weakQuestions.length}个封闭式提问`,
      action: "将'是不是'类问题改为'怎么看待'类开放性提问",
      priority: "high",
    });
  }

  // 追问不足
  if (quality.followUpEffectiveness < 40) {
    suggestions.push({
      target: "followup",
      issue: "追问有效性不足，提问之间缺乏关联",
      action: "在受访者回答后，基于其回答中的关键词进行追问",
      priority: "medium",
    });
  }

  // 结构不完整
  if (structure.structureScore < 50) {
    suggestions.push({
      target: "structure",
      issue: `访谈结构不完整（评分${structure.structureScore}）`,
      action: "确保包含：开场引入 → 主题提问 → 深度追问 → 金句收尾",
      priority: "medium",
    });
  }

  // 节奏问题
  if (quality.paceControl < 50) {
    suggestions.push({
      target: "pacing",
      issue: `提问节奏不均匀（评分${quality.paceControl}）`,
      action: "避免问题集中出现，每个问题后给受访者充分回答空间",
      priority: "low",
    });
  }

  // 如果没有问题，给一个默认建议
  if (suggestions.length === 0) {
    suggestions.push({
      target: "hook",
      issue: "可以进一步优化开场钩子",
      action: "尝试用反常识陈述或数据冲击作为开场",
      priority: "low",
    });
  }

  return suggestions;
}
