import type {
  CompetitionScoreInput,
  CompetitionScoreResult,
  DifferentiationPort,
  UniquenessScoreInput,
  UniquenessScoreResult
} from "../../application/ports/DifferentiationPort";

/**
 * 本地回退差异化评分适配器
 *
 * 当 Python 微服务不可用时，用关键词匹配启发式计算评分，
 * 保证博闻主链路始终可用。
 */
export class LocalDifferentiationClient implements DifferentiationPort {
  async scoreUniqueness(input: UniquenessScoreInput): Promise<UniquenessScoreResult> {
    const { candidateAngles, referenceTexts } = input;

    if (candidateAngles.length === 0) {
      return { scores: [], source: "fallback" };
    }

    // 启发式：候选角度与参照池的关键词重合度越低，独特性越高
    const refWords = referenceTexts.flatMap((text) => extractKeywords(text));
    const refSet = new Set(refWords);

    const scores = candidateAngles.map((angle, index) => {
      const angleWords = extractKeywords(angle);
      const overlap = angleWords.filter((word) => refSet.has(word)).length;
      const overlapRatio = refSet.size > 0 ? overlap / Math.max(1, angleWords.length) : 0;
      const base = 85 - index * 6;
      return Math.round(Math.max(35, base - overlapRatio * 30));
    });

    return { scores, source: "fallback" };
  }

  async scoreCompetition(input: CompetitionScoreInput): Promise<CompetitionScoreResult> {
    const { query, corpus } = input;
    const corpusSize = corpus.length;

    if (corpusSize === 0) {
      return { score: 50, topicId: -1, topicSize: 0, corpusSize: 0, source: "fallback" };
    }

    // 启发式：query 关键词在语料中出现的频率 → 竞争密度
    const queryWords = extractKeywords(query);
    const matchCount = corpus.filter((text) =>
      queryWords.some((word) => text.includes(word))
    ).length;

    const density = Math.round((matchCount / corpusSize) * 100);
    return {
      score: density,
      topicId: -1,
      topicSize: matchCount,
      corpusSize,
      source: "fallback"
    };
  }
}

function extractKeywords(text: string): string[] {
  // 简单的中文关键词提取：按标点和空格分割，过滤短词
  return text
    .split(/[，。、：；\s,.;:!?]/)
    .filter((segment) => segment.length >= 2)
    .flatMap((segment) => {
      // 滑动 2-3 字窗口作为关键词
      const words: string[] = [];
      for (let i = 0; i < segment.length - 1; i++) {
        words.push(segment.slice(i, i + 2));
      }
      return words;
    });
}
