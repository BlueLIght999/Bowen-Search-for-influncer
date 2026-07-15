import type { DifferentiationPort } from "../ports/DifferentiationPort";
import type { DifferentiatedDirection, DifferentiationScoreMeta } from "../../domain/types";
import { rankByCompositeScore } from "../../engine/rankByCompositeScore";

export interface ScoreDifferentiationInput {
  directions: DifferentiatedDirection[];
  referenceTexts: string[];
  differentiator: DifferentiationPort;
}

export interface ScoreDifferentiationOutput {
  directions: DifferentiatedDirection[];
  meta: DifferentiationScoreMeta;
}

/**
 * 差异化评分用例
 *
 * 接收候选方向列表，调用 DifferentiationPort（sentence-transformers + BERTopic）
 * 为每个方向计算真实 uniquenessScore 和 competitionScore，
 * 然后用纯函数 rankByCompositeScore 排序。
 *
 * 如果远程服务不可用，端口适配器内部会回退到启发式评分，
 * 这里额外做一次 try-catch 保证用例永不抛错。
 */
export async function scoreDifferentiation(
  input: ScoreDifferentiationInput
): Promise<ScoreDifferentiationOutput> {
  const { directions, referenceTexts, differentiator } = input;

  const candidateAngles = directions.map((direction) => direction.angle);

  // 1. 批量计算独特性
  let uniquenessScores: number[] = directions.map((_, index) => 80 - index * 5);
  let source = "fallback";

  try {
    const uniqResult = await differentiator.scoreUniqueness({
      candidateAngles,
      referenceTexts
    });
    if (uniqResult.scores.length === directions.length) {
      uniquenessScores = uniqResult.scores.map((score) => Math.round(score));
      source = uniqResult.source;
    }
  } catch {
    // 保持回退值
  }

  // 2. 逐个计算竞争密度
  let lastMeta: DifferentiationScoreMeta = { source };

  const scoredDirections = await Promise.all(
    directions.map(async (direction, index) => {
      let competitionScore = 50;
      try {
        const compResult = await differentiator.scoreCompetition({
          query: direction.angle,
          corpus: referenceTexts
        });
        competitionScore = Math.round(compResult.score);
        lastMeta = {
          source: compResult.source,
          topicId: compResult.topicId,
          topicSize: compResult.topicSize,
          corpusSize: compResult.corpusSize
        };
      } catch {
        // 保持回退值
      }

      return {
        ...direction,
        uniquenessScore: uniquenessScores[index] ?? direction.uniquenessScore,
        competitionScore
      };
    })
  );

  // 3. 用纯函数排序
  const sorted = rankByCompositeScore(scoredDirections);

  return {
    directions: sorted,
    meta: lastMeta
  };
}
