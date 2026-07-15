import type {
  KnowledgeQuery,
  KnowledgeRepositoryPort
} from "../ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge } from "../../domain/types";

interface RetrieveEvaluationKnowledgeInput {
  query: KnowledgeQuery;
  repository: KnowledgeRepositoryPort;
  limit: number;
}

export type RetrieveEvaluationKnowledgeResult =
  | {
      status: "completed";
      evidence: RetrievedKnowledge[];
    }
  | {
      status: "failed";
      evidence: [];
      reason: string;
    };

export async function retrieveEvaluationKnowledge({
  query,
  repository,
  limit
}: RetrieveEvaluationKnowledgeInput): Promise<RetrieveEvaluationKnowledgeResult> {
  try {
    const evidence = normalizeEvidence(
      await repository.retrieve(query),
      Math.max(0, Math.floor(limit))
    );
    return {
      status: "completed",
      evidence
    };
  } catch (error) {
    return {
      status: "failed",
      evidence: [],
      reason: error instanceof Error ? error.message : "Knowledge retrieval failed."
    };
  }
}

function normalizeEvidence(
  evidence: RetrievedKnowledge[],
  limit: number
): RetrievedKnowledge[] {
  const byKnowledgeId = new Map<string, RetrievedKnowledge>();

  for (const entry of evidence) {
    const existing = byKnowledgeId.get(entry.item.id);
    if (!existing || entry.score > existing.score) {
      byKnowledgeId.set(entry.item.id, cloneEvidence(entry));
    }
  }

  return [...byKnowledgeId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function cloneEvidence(entry: RetrievedKnowledge): RetrievedKnowledge {
  return {
    item: {
      ...entry.item,
      appliesWhen: [...entry.item.appliesWhen]
    },
    score: entry.score,
    matchReasons: [...entry.matchReasons]
  };
}
