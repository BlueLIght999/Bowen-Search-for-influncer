/**
 * AI 访谈提纲生成器用例
 *
 * 编排流程：
 * 1. 检索访谈知识库
 * 2. 生成提纲骨架（纯函数）
 * 3. 调用 OutlineGenerationPort LLM 润色
 * 4. 如 LLM 失败，降级为规则骨架
 * 5. 组装 InterviewOutline
 *
 * 降级链：
 * - L1 LLM 完整生成
 * - L2 规则骨架（generateOutlineStructure 输出）
 */

import type { OutlineGenerationPort } from "../ports/OutlineGenerationPort";
import type { KnowledgeRepositoryPort } from "../ports/KnowledgeRepositoryPort";
import type {
  InterviewOutlineInput,
  InterviewOutline,
  InterviewQuestion,
  FollowUpQuestion,
  ViralityDimension,
} from "../../domain/interview/types";
import type { RetrievedKnowledge } from "../../domain/types";
import { generateOutlineStructure } from "../../engine/generateOutlineStructure";
import { retrieveInterviewKnowledge } from "./retrieveInterviewKnowledge";

export interface GenerateInterviewOutlineDeps {
  outlineGenerator: OutlineGenerationPort;
  knowledgeRepo: KnowledgeRepositoryPort;
}

let outlineIdCounter = 0;

export async function generateInterviewOutline(params: {
  input: InterviewOutlineInput;
  deps: GenerateInterviewOutlineDeps;
}): Promise<InterviewOutline> {
  const { input, deps } = params;

  // 1. 检索知识库
  let knowledge: RetrievedKnowledge[];
  try {
    knowledge = await retrieveInterviewKnowledge(
      {
        topic: input.topic,
        guestProfile: input.guestProfile,
        creatorPositioning: input.creatorPositioning,
        sampleText: input.referenceTexts?.join(" ").slice(0, 500) ?? "",
      },
      deps.knowledgeRepo
    );
  } catch {
    knowledge = [];
  }
  const skeleton = generateOutlineStructure(input, knowledge);

  // 3. 尝试 LLM 生成
  try {
    const knowledgeContext = knowledge
      .map((k) => k.item.strategy)
      .join("\n")
      .slice(0, 2000);

    const generated = await deps.outlineGenerator.generate({
      topic: input.topic,
      guestProfile: input.guestProfile,
      creatorPositioning: input.creatorPositioning,
      knowledgeContext,
      questionSkeletons: skeleton.questionSkeletons,
    });

    // 4. 组装 LLM 结果
    return {
      topic: input.topic,
      guestProfile: input.guestProfile,
      hookSuggestions: generated.hookSuggestions,
      questions: generated.questions.map((q, i) => ({
        id: `iv-q-${++outlineIdCounter}`,
        question: q.question,
        purpose: q.purpose,
        expectedDirection: q.expectedDirection,
        followUps: q.followUps,
        collectiblePotential: q.collectiblePotential,
        viralityDimension: q.viralityDimension as ViralityDimension | undefined,
      })),
      closingStrategy: generated.closingStrategy,
      collectibleHighlights: generated.collectibleHighlights,
      differentiationAngle: generated.differentiationAngle,
    };
  } catch {
    // 5. LLM 失败：降级到规则骨架
    return buildRulesBasedOutline(input, skeleton);
  }
}

/** 规则降级：从骨架构建提纲 */
function buildRulesBasedOutline(
  input: InterviewOutlineInput,
  skeleton: ReturnType<typeof generateOutlineStructure>
): InterviewOutline {
  const questions: InterviewQuestion[] = skeleton.questionSkeletons.map(
    (q, i) => {
      const followUps: FollowUpQuestion[] = skeleton.followUpDirections[i].map(
        (dir) => ({
          question: dir,
          trigger: "受访者回答后",
          purpose: "深入挖掘",
        })
      );

      return {
        id: `iv-q-${++outlineIdCounter}`,
        question: q,
        purpose: "引导深度回答",
        expectedDirection: "个人经历与观点",
        followUps,
        collectiblePotential: i < 2 ? "high" : "medium",
        viralityDimension: i === 0 ? "hook" : i === 1 ? "opinion" : "practical",
      };
    }
  );

  return {
    topic: input.topic,
    guestProfile: input.guestProfile,
    hookSuggestions: skeleton.hookTemplates,
    questions,
    closingStrategy: skeleton.closingTemplate,
    collectibleHighlights: questions
      .filter((q) => q.collectiblePotential === "high")
      .map((q) => q.question),
    differentiationAngle: `从${input.creatorPositioning || "创作者"}视角切入${input.topic || "话题"}`,
  };
}
