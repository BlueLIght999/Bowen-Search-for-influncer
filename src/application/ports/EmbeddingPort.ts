/**
 * 嵌入向量生成端口
 *
 * 将文本转换为向量表示，供向量检索使用。
 * 远程适配器调用 Python sentence-transformers 服务，
 * 本地适配器回退到简单 TF-IDF 或返回空向量。
 */

export interface EmbeddingPort {
  /** 模型标识（如 paraphrase-multilingual-MiniLM-L12-v2） */
  readonly model: string;

  /** 向量维度 */
  readonly dimension: number;

  /**
   * 批量嵌入文本
   *
   * @param texts 待嵌入的文本数组
   * @returns 向量矩阵，行数等于 texts.length
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * 嵌入单条查询文本
   *
   * @param text 查询文本
   * @returns 单个向量
   */
  embedQuery(text: string): Promise<number[]>;
}
