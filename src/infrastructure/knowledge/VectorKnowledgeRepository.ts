import type {
  KnowledgeQuery,
  KnowledgeRepositoryPort
} from "../../application/ports/KnowledgeRepositoryPort";
import type { EmbeddingPort } from "../../application/ports/EmbeddingPort";
import type {
  VectorStorePort,
  VectorFilter,
  VectorQueryResult
} from "../../application/ports/VectorStorePort";
import type { RetrievedKnowledge, KnowledgeItem } from "../../domain/types";

interface VectorKnowledgeRepositoryOptions {
  topK?: number;
  finalK?: number;
  /** 向量相似度权重（默认 0.7） */
  vectorWeight?: number;
  /** 关键词匹配权重（默认 0.3） */
  keywordWeight?: number;
}

/**
 * 向量知识仓储适配器
 *
 * 实现 KnowledgeRepositoryPort，检索流程：
 * 1. 将 query 文本通过 EmbeddingPort 生成向量
 * 2. 通过 VectorStorePort 查询 top-K 语义相似条目（可按 dimension 分桶过滤）
 * 3. 用关键词匹配对向量召回结果 rerank，取 top-finalK
 * 4. 包装为 RetrievedKnowledge[]，含语义相似度分数和关键词命中原因
 *
 * 当 embedding 或 vector store 不可用时，降级到关键词检索。
 * 当 query.dimension 设置时，只召回该维度的知识（分桶召回）。
 */
export class VectorKnowledgeRepository implements KnowledgeRepositoryPort {
  private readonly embedder: EmbeddingPort;
  private readonly vectorStore: VectorStorePort;
  private readonly strategies: KnowledgeItem[];
  private readonly topK: number;
  private readonly finalK: number;
  private readonly vectorWeight: number;
  private readonly keywordWeight: number;

  constructor(
    embedder: EmbeddingPort,
    vectorStore: VectorStorePort,
    strategies: KnowledgeItem[],
    options: VectorKnowledgeRepositoryOptions = {}
  ) {
    this.embedder = embedder;
    this.vectorStore = vectorStore;
    this.strategies = strategies;
    this.topK = options.topK ?? 10;
    this.finalK = options.finalK ?? 4;
    this.vectorWeight = options.vectorWeight ?? 0.7;
    this.keywordWeight = options.keywordWeight ?? 0.3;
  }

  async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]> {
    const queryText = buildQueryText(query);
    const hasContent = [query.hotspot, query.creatorPositioning, query.sampleText, query.commentSignals]
      .some((field) => field.trim().length > 0);
    if (!hasContent) {
      return [];
    }

    const startTime = Date.now();

    // 构建 filter（分桶召回）
    const filter: VectorFilter | undefined = query.dimension
      ? { dimension: query.dimension }
      : undefined;

    // 尝试向量检索路径
    try {
      const queryVector = await this.embedder.embedQuery(queryText);
      const isZeroVector = queryVector.every((v) => v === 0);
      if (isZeroVector) {
        throw new Error("embedding returned zero vector (fallback)");
      }

      const vectorResults = await this.vectorStore.query(queryVector, this.topK, filter);
      if (vectorResults.length === 0) {
        const fallbackResults = keywordFallback(query, this.strategies, this.finalK);
        return annotateRetrievalPath(fallbackResults, "keyword-fallback", startTime);
      }

      const rerankedResults = this.hybridRerank(vectorResults, query, this.finalK);
      return annotateRetrievalPath(rerankedResults, "vector", startTime);
    } catch {
      // 降级到关键词检索
      const fallbackResults = keywordFallback(query, this.strategies, this.finalK);
      return annotateRetrievalPath(fallbackResults, "keyword-fallback", startTime);
    }
  }

  /**
   * 混合 rerank：向量召回结果 + 关键词匹配加权排序
   * 如果 query.dimension 设置，只保留该维度的结果
   */
  private hybridRerank(
    vectorResults: VectorQueryResult[],
    query: KnowledgeQuery,
    finalK: number
  ): RetrievedKnowledge[] {
    const haystack = normalizeText(buildQueryText(query));
    const strategyMap = new Map(this.strategies.map((s) => [s.id, s]));

    const scored: RetrievedKnowledge[] = [];

    for (const result of vectorResults) {
      const item = strategyMap.get(result.id);
      if (!item) continue;

      // 分桶过滤：如果 query.dimension 设置，跳过不匹配的条目
      if (query.dimension && item.dimension !== query.dimension) {
        continue;
      }

      const matchReasons: string[] = [`semantic-similarity: ${result.score.toFixed(2)}`];

      // 知识来源和版本追踪
      if (item.source) {
        matchReasons.push(`source: ${item.source}`);
      }
      if (item.version) {
        matchReasons.push(`version: ${item.version}`);
      }

      // 加权 rerank：向量分数 * vectorWeight + 关键词分 * keywordWeight
      let keywordHitCount = 0;

      // 关键词匹配 rerank
      for (const keyword of item.appliesWhen) {
        const normalizedKeyword = normalizeText(keyword);
        if (normalizedKeyword && haystack.includes(normalizedKeyword)) {
          matchReasons.push(`keyword: ${keyword}`);
          keywordHitCount++;
        }
      }

      // 归一化关键词分（0-1）
      const maxKeywords = Math.max(item.appliesWhen.length, 1);
      const keywordScore = keywordHitCount / maxKeywords;

      // 品类匹配加分（不计入加权公式，作为额外微调）
      let categoryBonus = 0;
      if (item.category === query.category) {
        matchReasons.push(`category: ${item.category}`);
        categoryBonus = 0.03;
      } else if (item.category === "通用") {
        matchReasons.push("category: 通用策略");
        categoryBonus = 0.01;
      }

      const combinedScore = result.score * this.vectorWeight + keywordScore * this.keywordWeight + categoryBonus;

      scored.push({
        item,
        score: combinedScore,
        matchReasons
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, finalK);
  }
}

// --- 辅助函数 ---

function buildQueryText(query: KnowledgeQuery): string {
  return `${query.category} ${query.hotspot} ${query.creatorPositioning} ${query.sampleText} ${query.commentSignals}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 为检索结果添加 retrieval-path 和 retrieval-latency-ms 审计信息
 */
function annotateRetrievalPath(
  results: RetrievedKnowledge[],
  path: string,
  startTime: number
): RetrievedKnowledge[] {
  const latencyMs = Date.now() - startTime;
  return results.map((r) => ({
    ...r,
    matchReasons: [
      ...r.matchReasons,
      `retrieval-path: ${path}`,
      `retrieval-latency-ms: ${latencyMs}`
    ]
  }));
}

/**
 * 关键词回退检索
 *
 * 当向量服务不可用时，用关键词匹配策略知识库。
 * 如果 query.dimension 设置，只返回该维度的知识。
 */
function keywordFallback(
  query: KnowledgeQuery,
  strategies: KnowledgeItem[],
  finalK: number
): RetrievedKnowledge[] {
  const queryText = buildQueryText(query);
  const hasContent = [query.hotspot, query.creatorPositioning, query.sampleText, query.commentSignals]
    .some((field) => field.trim().length > 0);
  if (!hasContent) return [];

  const haystack = normalizeText(queryText);
  const modelSignals = (query.modelSignals ?? []).map((s) => s.trim().toLowerCase());

  const scored: RetrievedKnowledge[] = [];

  for (const item of strategies) {
    // 分桶过滤：如果 query.dimension 设置，跳过不匹配的条目
    if (query.dimension && item.dimension !== query.dimension) {
      continue;
    }

    const matchReasons: string[] = ["fallback: keyword-mode"];

    if (item.source) {
      matchReasons.push(`source: ${item.source}`);
    }
    if (item.version) {
      matchReasons.push(`version: ${item.version}`);
    }

    let score = 0;

    if (item.category === query.category) {
      score += 3;
      matchReasons.push(`category: ${item.category}`);
    } else if (item.category === "通用") {
      score += 1;
      matchReasons.push("category: 通用策略");
    }

    for (const keyword of item.appliesWhen) {
      const normalizedKeyword = normalizeText(keyword);
      if (normalizedKeyword && haystack.includes(normalizedKeyword)) {
        score += 1;
        matchReasons.push(`keyword: ${keyword}`);
      }

      for (const signal of modelSignals) {
        if (normalizedKeyword && (signal.includes(normalizedKeyword) || normalizedKeyword.includes(signal))) {
          const reason = `model-signal: ${keyword}`;
          if (!matchReasons.includes(reason)) {
            score += 2;
            matchReasons.push(reason);
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ item, score, matchReasons });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, finalK);
}
