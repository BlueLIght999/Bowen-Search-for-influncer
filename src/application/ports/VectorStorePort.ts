/**
 * 向量存储端口
 *
 * 抽象向量数据库的写入、查询和删除操作。
 * 远程适配器调用 Python ChromaDB 服务，
 * 本地适配器回退到关键词检索。
 */

/** 知识类型枚举 */
export type KnowledgeType =
  | "hook_strategy"
  | "script_structure"
  | "scene_design"
  | "ai_drama_pattern"
  | "aesthetic_rule"
  | "platform_growth_rule";

/** 评估维度枚举（与 EvaluationRubric 对齐） */
export type EvaluationDimensionKey =
  | "scriptQuality"
  | "hookStrength"
  | "sceneDesign"
  | "aestheticExperience"
  | "emotionalRhythm"
  | "differentiation"
  | "viralPotential"
  | "aiDramaFit";

/** 向量条目元数据 */
export interface VectorEntryMetadata {
  title: string;
  category: string;
  type: KnowledgeType;
  dimension?: EvaluationDimensionKey;
  tags?: string[];
  source?: string;
  version?: string;
}

/** 写入向量库的条目 */
export interface VectorEntry {
  id: string;
  vector: number[];
  text: string;
  metadata: VectorEntryMetadata;
}

/** 查询结果 */
export interface VectorQueryResult {
  id: string;
  /** 相似度分数 0-1（越高越相似） */
  score: number;
  metadata: VectorEntryMetadata;
}

/** 查询过滤条件 */
export interface VectorFilter {
  dimension?: EvaluationDimensionKey;
  category?: string;
  type?: KnowledgeType;
}

export interface VectorStorePort {
  /** 集合名称 */
  readonly collectionName: string;

  /**
   * 批量写入或更新向量条目
   *
   * @param entries 待写入的条目列表
   */
  upsert(entries: VectorEntry[]): Promise<void>;

  /**
   * 向量相似度查询
   *
   * @param vector 查询向量
   * @param topK 返回的最大结果数
   * @param filter 可选的元数据过滤条件
   * @returns 按相似度降序排列的结果列表
   */
  query(vector: number[], topK: number, filter?: VectorFilter): Promise<VectorQueryResult[]>;

  /**
   * 按 ID 删除向量条目
   *
   * @param ids 待删除的条目 ID 列表
   */
  delete(ids: string[]): Promise<void>;

  /**
   * 获取集合中的条目总数
   *
   * @returns 条目数量
   */
  count(): Promise<number>;
}
