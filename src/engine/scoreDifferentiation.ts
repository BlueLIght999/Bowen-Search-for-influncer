import type { DifferentiationPort } from "../application/ports/DifferentiationPort";
import type { DifferentiatedDirection, DifferentiationScoreMeta } from "../domain/types";

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
 * 差异化评分引擎
 *
 * 接收候选方向列表，调用 DifferentiationPort（sentence-transformers + BERTopic）
 * 为每个方向计算真实 uniquenessScore 和 competitionScore，
 * 替换原来 generatePlan 中的硬编码数值。
 *
 * 如果远程服务不可用，端口适配器内部会回退到启发式评分，
 * 这里额外做一次 try-catch 保证引擎永不抛错。
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

  // 3. 按综合得分排序：uniquenessScore 越高越好，competitionScore 越低越好
  const sorted = [...scoredDirections].sort((a, b) => {
    const scoreA = a.uniquenessScore - a.competitionScore * 0.5;
    const scoreB = b.uniquenessScore - b.competitionScore * 0.5;
    return scoreB - scoreA;
  });

  return {
    directions: sorted,
    meta: lastMeta
  };
}
