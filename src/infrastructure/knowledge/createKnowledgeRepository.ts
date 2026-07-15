import type { KnowledgeRepositoryPort } from "../../application/ports/KnowledgeRepositoryPort";
import { LocalKnowledgeRepository } from "./LocalKnowledgeRepository";
import { VectorKnowledgeRepository } from "./VectorKnowledgeRepository";
import { CachedKnowledgeRepository } from "./CachedKnowledgeRepository";
import { RemoteEmbeddingClient } from "../embedding/RemoteEmbeddingClient";
import { RemoteVectorStoreClient } from "./RemoteVectorStoreClient";
import { checkVectorStoreHealth } from "./checkVectorStoreHealth";
import { bowenStrategies } from "../../knowledge/bowenStrategies";

/**
 * 知识仓储组合根工厂
 *
 * 根据环境变量决定注入哪种知识仓储实现：
 * - BOWEN_VECTOR_STORE_URL 已设置且服务健康 → VectorKnowledgeRepository（向量检索）
 * - 否则 → LocalKnowledgeRepository（关键词检索）
 *
 * 所有实现都通过 CachedKnowledgeRepository 包装，启用 LRU 缓存。
 * 两者实现同一端口，切换无侵入。
 */
export async function createKnowledgeRepository(): Promise<KnowledgeRepositoryPort> {
  const vectorStoreUrl = process.env.BOWEN_VECTOR_STORE_URL;

  let inner: KnowledgeRepositoryPort;

  if (vectorStoreUrl) {
    // 健康检查：服务不可用或知识库未入库时降级到关键词模式
    const health = await checkVectorStoreHealth(vectorStoreUrl);

    if (health.healthy && health.ready) {
      const embedder = new RemoteEmbeddingClient({ endpoint: vectorStoreUrl });
      const vectorStore = new RemoteVectorStoreClient({ endpoint: vectorStoreUrl });
      inner = new VectorKnowledgeRepository(embedder, vectorStore, bowenStrategies);
    } else {
      // 降级到关键词模式
      inner = new LocalKnowledgeRepository();
    }
  } else {
    inner = new LocalKnowledgeRepository();
  }

  // 用 LRU 缓存装饰器包装
  return new CachedKnowledgeRepository(inner, { maxSize: 100 });
}

/**
 * 同步版本（不检查健康状态，直接按环境变量决定）
 * 适用于测试或已知服务状态的场景
 */
export function createKnowledgeRepositorySync(): KnowledgeRepositoryPort {
  const vectorStoreUrl = process.env.BOWEN_VECTOR_STORE_URL;

  let inner: KnowledgeRepositoryPort;

  if (vectorStoreUrl) {
    const embedder = new RemoteEmbeddingClient({ endpoint: vectorStoreUrl });
    const vectorStore = new RemoteVectorStoreClient({ endpoint: vectorStoreUrl });
    inner = new VectorKnowledgeRepository(embedder, vectorStore, bowenStrategies);
  } else {
    inner = new LocalKnowledgeRepository();
  }

  return new CachedKnowledgeRepository(inner, { maxSize: 100 });
}
