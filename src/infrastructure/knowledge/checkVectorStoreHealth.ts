/**
 * 向量数据库健康检查
 *
 * 调用 Python 服务的 /vector/health 端点，
 * 返回健康状态、条目数和维度信息。
 * 用于组合根在启动时决定是否降级到关键词检索。
 */

export interface VectorStoreHealth {
  /** 服务是否可用 */
  healthy: boolean;
  /** 知识库是否已入库（count > 0） */
  ready: boolean;
  /** 集合名称 */
  collection: string;
  /** 条目数 */
  count: number;
  /** 向量维度 */
  dimension: number;
}

/**
 * 检查向量数据库健康状态
 *
 * @param endpoint 向量服务端点（如 http://localhost:8766）
 * @param collection 集合名称（默认 bowen-knowledge）
 * @param timeoutMs 超时毫秒（默认 3000）
 */
export async function checkVectorStoreHealth(
  endpoint: string,
  collection: string = "bowen-knowledge",
  timeoutMs: number = 3000
): Promise<VectorStoreHealth> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${endpoint}/vector/health?collection=${encodeURIComponent(collection)}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        return { healthy: false, ready: false, collection, count: 0, dimension: 0 };
      }

      const data = await response.json();
      const healthy = data.status === "ok";
      const count = data.count ?? 0;

      return {
        healthy,
        ready: healthy && count > 0,
        collection,
        count,
        dimension: data.dimension ?? 0
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { healthy: false, ready: false, collection, count: 0, dimension: 0 };
  }
}
