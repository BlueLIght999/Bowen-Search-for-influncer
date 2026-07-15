import type {
  KnowledgeQuery,
  KnowledgeRepositoryPort
} from "../../application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge } from "../../domain/types";

interface CachedKnowledgeRepositoryOptions {
  maxSize?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface CacheEntry {
  results: RetrievedKnowledge[];
  // LRU timestamp for eviction
  lastAccessed: number;
}

/**
 * LRU 缓存知识仓储装饰器
 *
 * 包装任何 KnowledgeRepositoryPort，对相同查询返回缓存结果。
 * 缓存键：query 字段的序列化 hash。
 * 淘汰策略：LRU，默认 100 条。
 *
 * 避免同一视频分析流程中重复调用 embedding 和向量查询。
 */
export class CachedKnowledgeRepository implements KnowledgeRepositoryPort {
  private readonly inner: KnowledgeRepositoryPort;
  private readonly maxSize: number;
  private readonly cache: Map<string, CacheEntry>;
  private hits = 0;
  private misses = 0;

  constructor(inner: KnowledgeRepositoryPort, options: CachedKnowledgeRepositoryOptions = {}) {
    this.inner = inner;
    this.maxSize = options.maxSize ?? 100;
    this.cache = new Map();
  }

  async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]> {
    const key = buildCacheKey(query);
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      // Update LRU order: delete and re-insert
      this.cache.delete(key);
      const refreshed: CacheEntry = { results: entry.results, lastAccessed: Date.now() };
      this.cache.set(key, refreshed);
      // Return deep copy to prevent mutation
      return entry.results.map((r) => ({ ...r, item: { ...r.item }, matchReasons: [...r.matchReasons] }));
    }

    this.misses++;
    const results = await this.inner.retrieve(query);

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    // Store deep copy to prevent mutation
    const stored = results.map((r) => ({ ...r, item: { ...r.item }, matchReasons: [...r.matchReasons] }));
    this.cache.set(key, { results: stored, lastAccessed: Date.now() });
    return results;
  }

  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size
    };
  }

  private findOldestKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}

function buildCacheKey(query: KnowledgeQuery): string {
  return JSON.stringify({
    category: query.category,
    hotspot: query.hotspot,
    creatorPositioning: query.creatorPositioning,
    sampleText: query.sampleText,
    commentSignals: query.commentSignals,
    modelSignals: query.modelSignals ?? [],
    dimension: query.dimension
  });
}
