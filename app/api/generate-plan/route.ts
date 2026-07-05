import { NextResponse } from "next/server";
import { generateCreatorPlan } from "../../../src/application/useCases/generateCreatorPlan";
import { defaultInput } from "../../../src/domain/sampleInputs";
import type { MvpInput } from "../../../src/domain/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<MvpInput> | null;
  const input: MvpInput = {
    ...defaultInput,
    ...(body ?? {})
  };

  const plan = await generateCreatorPlan(input);

  return NextResponse.json(plan);
}
