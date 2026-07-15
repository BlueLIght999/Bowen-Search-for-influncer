import { NextResponse } from "next/server";
import { generateInterviewOutline } from "../../../src/application/useCases/generateInterviewOutline";
import { LocalKnowledgeRepository } from "../../../src/infrastructure/knowledge/LocalKnowledgeRepository";
import type { OutlineGenerationPort } from "../../../src/application/ports/OutlineGenerationPort";
import type { Category } from "../../../src/domain/types";

export const dynamic = "force-dynamic";

let knowledgeRepo: LocalKnowledgeRepository | null = null;

function getKnowledgeRepo(): LocalKnowledgeRepository {
  if (!knowledgeRepo) {
    knowledgeRepo = new LocalKnowledgeRepository();
  }
  return knowledgeRepo;
}

// 规则版 generator — 不依赖 LLM，直接降级到规则骨架
const rulesGenerator: OutlineGenerationPort = {
  async generate() {
    throw new Error("LLM not configured, using rules fallback");
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.topic || typeof body.topic !== "string") {
      return NextResponse.json(
        { error: "topic 参数必填且须为字符串" },
        { status: 400 }
      );
    }

    const result = await generateInterviewOutline({
      input: {
        topic: body.topic,
        guestProfile: body.guestProfile ?? "",
        creatorPositioning: body.creatorPositioning ?? "",
        category: (body.category ?? "通用") as Category,
        referenceTexts: body.referenceTexts,
      },
      deps: {
        outlineGenerator: rulesGenerator,
        knowledgeRepo: getKnowledgeRepo(),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: `提纲生成失败: ${message}` },
      { status: 500 }
    );
  }
}
