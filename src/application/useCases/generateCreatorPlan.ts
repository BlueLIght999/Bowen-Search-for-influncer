import type { GeneratedPlan, MvpInput } from "../../domain/types";
import { generatePlan } from "../../engine/generatePlan";

export async function generateCreatorPlan(input: MvpInput): Promise<GeneratedPlan> {
  return generatePlan(input);
}
