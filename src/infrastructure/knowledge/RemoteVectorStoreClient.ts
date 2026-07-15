import type {
  VectorEntry,
  VectorFilter,
  VectorQueryResult,
  VectorStorePort
} from "../../application/ports/VectorStorePort";

interface RemoteVectorStoreClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  collection?: string;
}

/**
 * 远程向量存储适配器
 *
 * 调用 Python differentiation-service 的 /vector/* 端点，
 * 使用 ChromaDB 进行向量存储和相似度检索。
 *
 * 环境变量 BOWEN_VECTOR_STORE_URL 可覆盖默认地址。
 */
export class RemoteVectorStoreClient implements VectorStorePort {
  readonly endpoint: string;
  readonly collectionName: string;
  private readonly timeoutMs: number;

  constructor(options: RemoteVectorStoreClientOptions = {}) {
    const base = (options.endpoint || process.env.BOWEN_VECTOR_STORE_URL || "http://localhost:8766").replace(/\/$/, "");
    this.endpoint = base;
    this.collectionName = options.collection ?? "bowen-knowledge";
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.post("/vector/upsert", {
      collection: this.collectionName,
      entries: entries.map((entry) => ({
        id: entry.id,
        text: entry.text,
        metadata: entry.metadata
      }))
    });
  }

  async query(vector: number[], topK: number, filter?: VectorFilter): Promise<VectorQueryResult[]> {
    try {
      const data = await this.post("/vector/query", {
        collection: this.collectionName,
        queryText: "",
        queryVector: vector,
        topK,
        filter
      });

      return (data.results ?? []).map((r: { id: string; score: number; metadata: VectorQueryResult["metadata"] }) => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata
      }));
    } catch (e) {
      if (e instanceof Error && e.message.includes("Vector store responded")) {
        throw e;
      }
      return [];
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.post("/vector/delete", {
      collection: this.collectionName,
      ids
    });
  }

  async count(): Promise<number> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(
          `${this.endpoint}/vector/health?collection=${encodeURIComponent(this.collectionName)}`,
          { signal: controller.signal }
        );

        if (!response.ok) return 0;
        const data = await response.json();
        return data.count ?? 0;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return 0;
    }
  }

  private async post(path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Vector store responded ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
