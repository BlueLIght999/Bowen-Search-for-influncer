import type {
  KnowledgeQuery,
  KnowledgeRepositoryPort
} from "../../application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge, KnowledgeItem } from "../../domain/types";
import { retrieveKnowledgeEvidence } from "../../engine/retrieveKnowledge";
import { bowenStrategies } from "../../knowledge/bowenStrategies";

/**
 * 本地知识仓储适配器
 *
 * 组合知识数据源（bowenStrategies）与纯函数检索引擎（retrieveKnowledgeEvidence）。
 * infrastructure 层可以同时依赖 engine 纯函数和 knowledge 数据层，
 * 不再形成 engine→knowledge→infrastructure 循环依赖。
 */
export class LocalKnowledgeRepository implements KnowledgeRepositoryPort {
  private readonly strategies: KnowledgeItem[];

  constructor(strategies?: KnowledgeItem[]) {
    this.strategies = strategies ?? bowenStrategies;
  }

  async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]> {
    return retrieveKnowledgeEvidence(query, this.strategies);
  }
}
