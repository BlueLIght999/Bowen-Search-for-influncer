import type { KnowledgeItem, MvpInput } from "../domain/types";
import { bowenStrategies } from "../knowledge/bowenStrategies";

export function retrieveKnowledge(input: MvpInput): KnowledgeItem[] {
  const haystack = `${input.category} ${input.hotspot} ${input.creatorPositioning} ${input.sampleText} ${input.commentSignals}`;

  const scored = bowenStrategies.map((item) => {
    const categoryScore = item.category === input.category ? 3 : item.category === "通用" ? 1 : 0;
    const keywordScore = item.appliesWhen.filter((keyword) => haystack.includes(keyword)).length;
    return { item, score: categoryScore + keywordScore };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ item }) => item);
}
