import { NextResponse } from "next/server";
import { diagnoseInterviewVideo } from "../../../src/application/useCases/diagnoseInterviewVideo";
import { LocalKnowledgeRepository } from "../../../src/infrastructure/knowledge/LocalKnowledgeRepository";
import type { InterviewAnalysisPort } from "../../../src/application/ports/InterviewAnalysisPort";
import type { Category } from "../../../src/domain/types";

export const dynamic = "force-dynamic";

// 延迟初始化知识库
let knowledgeRepo: LocalKnowledgeRepository | null = null;

function getKnowledgeRepo(): LocalKnowledgeRepository {
  if (!knowledgeRepo) {
    knowledgeRepo = new LocalKnowledgeRepository();
  }
  return knowledgeRepo;
}

// 规则版 analyzer — 不依赖 LLM，直接用引擎结果
const rulesAnalyzer: InterviewAnalysisPort = {
  async analyze() {
    // 规则版直接抛错，让用例降级到 rules_fallback
    throw new Error("LLM not configured, using rules fallback");
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 参数校验
    if (!body.transcript || typeof body.transcript !== "string") {
      return NextResponse.json(
        { error: "transcript 参数必填且须为字符串" },
        { status: 400 }
      );
    }

    const result = await diagnoseInterviewVideo({
      input: {
        category: (body.category ?? "通用") as Category,
        topic: body.topic ?? "",
        creatorPositioning: body.creatorPositioning ?? "",
        guestProfile: body.guestProfile ?? "",
        transcript: body.transcript,
        commentSignals: body.commentSignals ?? "",
      },
      deps: {
        analyzer: rulesAnalyzer,
        knowledgeRepo: getKnowledgeRepo(),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: `访谈诊断失败: ${message}` },
      { status: 500 }
    );
  }
}
