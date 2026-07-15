/**
 * 访谈知识检索用例
 *
 * 组合用户输入（选题+嘉宾画像+创作者定位），
 * 调用 KnowledgeRepositoryPort 检索访谈相关知识。
 *
 * 降级策略：
 * - 正常：repo 返回匹配的知识条目
 * - repo 为空：返回空数组（调用方应回退到 LocalKnowledgeRepository）
 * - repo 异常：捕获错误，返回空数组
 */

import type { KnowledgeRepositoryPort } from "../ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge } from "../../domain/types";

export interface InterviewKnowledgeQuery {
  /** 选题方向 */
  topic: string;
  /** 嘉宾背景 */
  guestProfile: string;
  /** 创作者定位 */
  creatorPositioning: string;
  /** 样本文稿 */
  sampleText: string;
}

/**
 * 检索访谈相关知识
 *
 * @param input 查询参数
 * @param repo 知识仓储端口
 * @returns 检索到的知识条目列表
 */
export async function retrieveInterviewKnowledge(
  input: InterviewKnowledgeQuery,
  repo: KnowledgeRepositoryPort
): Promise<RetrievedKnowledge[]> {
  try {
    // 将 topic + guestProfile 合并到 sampleText 中提高匹配率
    const combinedSampleText = [
      input.sampleText,
      input.topic,
      input.guestProfile,
    ]
      .filter((s) => s.length > 0)
      .join(" ");

    return await repo.retrieve({
      category: "通用" as never,
      hotspot: input.topic,
      creatorPositioning: input.creatorPositioning,
      sampleText: combinedSampleText,
      commentSignals: "",
    });
  } catch {
    return [];
  }
}
