import { NextResponse } from "next/server";
import { retrieveInterviewKnowledge } from "../../../src/application/useCases/retrieveInterviewKnowledge";
import { LocalKnowledgeRepository } from "../../../src/infrastructure/knowledge/LocalKnowledgeRepository";
import { InterviewKnowledgeRepository } from "../../../src/infrastructure/interview/InterviewKnowledgeRepository";
import type { RetrievedKnowledge } from "../../../src/domain/types";
import type { KnowledgeQuery, KnowledgeRepositoryPort } from "../../../src/application/ports/KnowledgeRepositoryPort";
import { join } from "path";

export const dynamic = "force-dynamic";

const CASES_DIR = join(process.cwd(), "storage", "interview-collector", "raw");

/**
 * 组合仓储：先从案例 JSON 检索，再从静态策略知识检索，合并去重
 */
class CombinedKnowledgeRepository implements KnowledgeRepositoryPort {
  private caseRepo: InterviewKnowledgeRepository;
  private localRepo: LocalKnowledgeRepository;

  constructor() {
    this.caseRepo = new InterviewKnowledgeRepository(CASES_DIR);
    this.localRepo = new LocalKnowledgeRepository();
  }

  async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]> {
    const [caseResults, localResults] = await Promise.all([
      this.caseRepo.retrieve(query),
      this.localRepo.retrieve(query),
    ]);

    // 合并去重（按 item.title 去重）
    const seen = new Set<string>();
    const merged: RetrievedKnowledge[] = [];
    for (const r of [...caseResults, ...localResults]) {
      const key = r.item?.title ?? "";
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
    return merged;
  }

  get caseCount(): number {
    return this.caseRepo.itemCount;
  }
}

let combinedRepo: CombinedKnowledgeRepository | null = null;

function getRepository(): KnowledgeRepositoryPort {
  if (!combinedRepo) {
    combinedRepo = new CombinedKnowledgeRepository();
  }
  return combinedRepo;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") ?? "";
  const guestProfile = searchParams.get("guestProfile") ?? "";
  const creatorPositioning = searchParams.get("creatorPositioning") ?? "";
  const sampleText = searchParams.get("sampleText") ?? "";

  if (!topic && !sampleText) {
    return NextResponse.json(
      { error: "至少需要提供 topic 或 sampleText 参数" },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const results = await retrieveInterviewKnowledge(
    { topic, guestProfile, creatorPositioning, sampleText },
    repo
  );

  const caseCount = combinedRepo?.caseCount ?? 0;
  const sourceLabel = results.length > 0
    ? `cases:${caseCount} + strategies`
    : "empty";

  return NextResponse.json({
    items: results,
    count: results.length,
    source: sourceLabel,
  });
}
