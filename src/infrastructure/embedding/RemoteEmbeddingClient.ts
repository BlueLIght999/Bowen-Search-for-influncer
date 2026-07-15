import type { EmbeddingPort } from "../../application/ports/EmbeddingPort";

interface RemoteEmbeddingClientOptions {
  endpoint?: string;
  timeoutMs?: number;
}

/**
 * 远程嵌入向量适配器
 *
 * 调用 Python differentiation-service 的 /embed 端点，
 * 使用 sentence-transformers 模型将文本转为向量。
 *
 * 环境变量 BOWEN_EMBEDDING_SERVICE_URL 可覆盖默认地址。
 */
export class RemoteEmbeddingClient implements EmbeddingPort {
  readonly endpoint: string;
  private readonly timeoutMs: number;
  private _model: string = "paraphrase-multilingual-MiniLM-L12-v2";
  private _dimension: number = 384;

  constructor(options: RemoteEmbeddingClientOptions = {}) {
    const base = (options.endpoint || process.env.BOWEN_EMBEDDING_SERVICE_URL || "http://localhost:8766").replace(/\/$/, "");
    this.endpoint = base;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  get model(): string {
    return this._model;
  }

  get dimension(): number {
    return this._dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const data = await this.post("/embed", { texts });
    this._model = data.model ?? this._model;
    this._dimension = data.dimension ?? this._dimension;

    if (data.source === "fallback" || !data.vectors || data.vectors.length === 0) {
      throw new Error("Embedding service returned fallback (model unavailable)");
    }

    return data.vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embed([text]);
    return vectors[0];
  }

  private async post(path: string, body: unknown): Promise<{
    vectors: number[][];
    model: string;
    dimension: number;
    source: string;
  }> {
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
        throw new Error(`Embedding service responded ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
