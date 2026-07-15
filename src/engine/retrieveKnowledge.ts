import type {
  KnowledgeItem,
  MvpInput,
  RetrievedKnowledge
} from "../domain/types";

/**
 * 知识检索纯函数引擎
 *
 * 接收策略知识库作为参数，根据输入匹配返回相关知识条目。
 * 不直接 import 任何知识数据源，保持 engine 层纯函数特性。
 */

export function retrieveKnowledgeEvidence(
  input: MvpInput,
  strategies: KnowledgeItem[]
): RetrievedKnowledge[] {
  const haystack = normalizeText(
    `${input.category} ${input.hotspot} ${input.creatorPositioning} ${input.sampleText} ${input.commentSignals}`
  );
  const modelSignals = normalizeModelSignals(input.modelSignals ?? []);

  return strategies
    .map((item) => scoreKnowledgeItem(item, input, haystack, modelSignals))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export function retrieveKnowledge(
  input: MvpInput,
  strategies: KnowledgeItem[]
): KnowledgeItem[] {
  return retrieveKnowledgeEvidence(input, strategies).map(({ item }) => item);
}

function scoreKnowledgeItem(
  item: KnowledgeItem,
  input: MvpInput,
  haystack: string,
  modelSignals: NormalizedModelSignal[]
): RetrievedKnowledge {
  const matchReasons: string[] = [];
  let score = 0;

  if (item.category === input.category) {
    score += 3;
    matchReasons.push(`category: ${item.category}`);
  } else if (item.category === "通用") {
    score += 1;
    matchReasons.push("category: 通用策略");
  }

  for (const keyword of item.appliesWhen) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedKeyword && haystack.includes(normalizedKeyword)) {
      score += 1;
      matchReasons.push(`keyword: ${keyword}`);
    }

    for (const signal of modelSignals) {
      if (
        normalizedKeyword &&
        modelSignalMatchesKeyword(signal.normalized, normalizedKeyword)
      ) {
        const reason = `model-signal: ${signal.raw}`;
        if (!matchReasons.includes(reason)) {
          score += 2;
          matchReasons.push(reason);
        }
      }
    }
  }

  return {
    item,
    score,
    matchReasons
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

interface NormalizedModelSignal {
  raw: string;
  normalized: string;
}

function normalizeModelSignals(signals: string[]): NormalizedModelSignal[] {
  const seen = new Set<string>();
  const normalizedSignals: NormalizedModelSignal[] = [];

  for (const signal of signals) {
    const normalized = normalizeText(signal);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    normalizedSignals.push({
      raw: signal.trim(),
      normalized
    });
  }

  return normalizedSignals;
}

function modelSignalMatchesKeyword(signal: string, keyword: string): boolean {
  return signal.includes(keyword) || keyword.includes(signal);
}
