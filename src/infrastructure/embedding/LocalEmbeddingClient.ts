import type { EmbeddingPort } from "../../application/ports/EmbeddingPort";

/**
 * 本地回退嵌入向量适配器
 *
 * 当 Python sentence-transformers 服务不可用时，
 * 返回零向量让检索链路降级到关键词模式。
 */
export class LocalEmbeddingClient implements EmbeddingPort {
  readonly model: string = "fallback";
  readonly dimension: number = 384;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(this.dimension).fill(0));
  }

  async embedQuery(text: string): Promise<number[]> {
    return new Array(this.dimension).fill(0);
  }
}
