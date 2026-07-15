import type {
  Category,
  RetrievedKnowledge
} from "../../domain/types";
import type { EvaluationDimensionKey } from "./VectorStorePort";

export interface KnowledgeQuery {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  sampleText: string;
  commentSignals: string;
  modelSignals?: string[];
  /** 评估维度过滤（分桶召回：只返回该维度的知识） */
  dimension?: EvaluationDimensionKey;
}

export interface KnowledgeRepositoryPort {
  retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]>;
}
