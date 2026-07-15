import type { DifferentiatedDirection } from "../domain/types";

/**
 * 按综合得分降序排列候选方向。
 *
 * 综合得分 = uniquenessScore - competitionScore * 0.5
 * 纯函数，不依赖任何外部端口或数据源。
 */
export function rankByCompositeScore(
  directions: DifferentiatedDirection[]
): DifferentiatedDirection[] {
  return [...directions].sort((a, b) => {
    const scoreA = a.uniquenessScore - a.competitionScore * 0.5;
    const scoreB = b.uniquenessScore - b.competitionScore * 0.5;
    return scoreB - scoreA;
  });
}
