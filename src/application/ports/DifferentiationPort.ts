/**
 * 差异化评分端口
 *
 * 对接 P0 算法框架（sentence-transformers + BERTopic），
 * 将角度独特性与竞争密度的计算抽象为端口，便于远程/本地适配器切换。
 */

export interface UniquenessScoreInput {
  /** 候选选题角度列表（通常是 3 个差异化方向） */
  candidateAngles: string[];
  /** 已有爆款标题/描述（参照池），用于衡量候选有多"不撞车" */
  referenceTexts: string[];
}

export interface UniquenessScoreResult {
  /** 每个候选角度的独特性评分 0-100（越高越独特） */
  scores: number[];
  /** 评分来源：sentence-transformers / fallback */
  source: string;
}

export interface CompetitionScoreInput {
  /** 待评估的选题角度 */
  query: string;
  /** 同品类已有内容标题/描述列表 */
  corpus: string[];
}

export interface CompetitionScoreResult {
  /** 竞争密度 0-100（越高越拥挤） */
  score: number;
  /** 所属主题簇 ID（-1 表示噪声/无法聚类） */
  topicId: number;
  /** 该主题簇的样本数 */
  topicSize: number;
  /** 语料库总数 */
  corpusSize: number;
  /** 评分来源：bertopic / embedding-fallback / fallback */
  source: string;
}

export interface DifferentiationPort {
  /** 批量计算角度独特性（sentence-transformers） */
  scoreUniqueness(input: UniquenessScoreInput): Promise<UniquenessScoreResult>;

  /** 计算单个角度的竞争密度（BERTopic） */
  scoreCompetition(input: CompetitionScoreInput): Promise<CompetitionScoreResult>;
}
