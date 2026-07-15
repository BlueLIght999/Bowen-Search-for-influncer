import { NextResponse } from "next/server";
import { analyzeUploadedVideo } from "../../../src/application/useCases/analyzeUploadedVideo";
import { isCategory } from "../../../src/domain/categories";
import type { Category, UploadedVideoInput, VideoTrend } from "../../../src/domain/types";
import { LocalDifferentiationClient } from "../../../src/infrastructure/differentiation/LocalDifferentiationClient";
import { RemoteDifferentiationClient } from "../../../src/infrastructure/differentiation/RemoteDifferentiationClient";
import { createKnowledgeRepository } from "../../../src/infrastructure/knowledge/createKnowledgeRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    category?: string;
    hotspot?: string;
    title?: string;
    transcript?: string;
    commentSignals?: string;
    creatorPositioning?: string;
    referenceTexts?: string[];
  } | null;

  if (!body || (!body.transcript && !body.title)) {
    return NextResponse.json(
      { error: "Missing transcript or title" },
      { status: 400 }
    );
  }

  const category: Category = isCategory(body.category ?? null) ? (body.category as Category) : "AI科技";

  const input: UploadedVideoInput = {
    category,
    hotspot: body.hotspot || body.title || "上传视频分析",
    title: body.title || "",
    transcript: body.transcript || "",
    commentSignals: body.commentSignals || "",
    creatorPositioning: body.creatorPositioning || `面向${category}受众的创作者`
  };

  // 先尝试远程 P0 算法服务，失败回退本地
  const remoteClient = new RemoteDifferentiationClient();
  const localClient = new LocalDifferentiationClient();
  const knowledgeRepository = await createKnowledgeRepository();

  const referenceTexts = body.referenceTexts ?? [];

  try {
    const result = await analyzeUploadedVideo({
      input,
      differentiator: remoteClient,
      knowledgeRepository,
      referenceTexts
    });
    return NextResponse.json(result);
  } catch {
    // 远程服务不可用 → 本地回退
    const result = await analyzeUploadedVideo({
      input,
      differentiator: localClient,
      knowledgeRepository,
      referenceTexts
    });
    return NextResponse.json(result);
  }
}
