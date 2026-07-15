import type { GeneratedPlan, MvpInput } from "../../domain/types";
import { generatePlan } from "../../engine/generatePlan";
import { retrieveKnowledge } from "../../engine/retrieveKnowledge";
import { bowenStrategies } from "../../knowledge/bowenStrategies";

export async function generateCreatorPlan(input: MvpInput): Promise<GeneratedPlan> {
  const knowledgeItems = retrieveKnowledge(input, bowenStrategies);
  return generatePlan(input, knowledgeItems);
}
