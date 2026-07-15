import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createVideoAnalysisJob,
  VideoAssetNotFoundError
} from "../../../src/application/useCases/createVideoAnalysisJob";
import { runVideoAnalysisJob } from "../../../src/application/useCases/runVideoAnalysisJob";
import { isCategory } from "../../../src/domain/categories";
import { defaultInput } from "../../../src/domain/sampleInputs";
import type { Category } from "../../../src/domain/types";
import { LocalDifferentiationClient } from "../../../src/infrastructure/differentiation/LocalDifferentiationClient";
import { LocalJsonJobRepository } from "../../../src/infrastructure/jobs/LocalJsonJobRepository";
import { localBackgroundTaskScheduler } from "../../../src/infrastructure/jobs/LocalBackgroundTaskScheduler";
import { LocalJsonlErrorLog } from "../../../src/infrastructure/logging/LocalJsonlErrorLog";
import { createKnowledgeRepository } from "../../../src/infrastructure/knowledge/createKnowledgeRepository";
import { LocalJsonModelRunRepository } from "../../../src/infrastructure/modelRuns/LocalJsonModelRunRepository";
import { LocalJsonSliceUnderstandingCache } from "../../../src/infrastructure/modelRuns/LocalJsonSliceUnderstandingCache";
import { LocalFrameCatalog } from "../../../src/infrastructure/media/LocalFrameCatalog";
import {
  FfmpegAudioExtractor,
  FfmpegFrameSampler,
  FfmpegMediaProbe
} from "../../../src/infrastructure/media/FfmpegMediaProcessing";
import { LocalMediaWorkspace } from "../../../src/infrastructure/media/LocalMediaWorkspace";
import { FakeContentReasoningClient } from "../../../src/infrastructure/multimodal/FakeContentReasoningClient";
import { FakeMultimodalUnderstandingClient } from "../../../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";
import { createOpenAiCompatibleMultimodalClients } from "../../../src/infrastructure/multimodal/OpenAiCompatibleMultimodalClients";
import { PaddleOcrClient } from "../../../src/infrastructure/ocr/PaddleOcrClient";
import { LocalJsonReportRepository } from "../../../src/infrastructure/reports/LocalJsonReportRepository";
import { LocalVideoStorage } from "../../../src/infrastructure/storage/LocalVideoStorage";
import { FunAsrTranscriptionClient } from "../../../src/infrastructure/transcription/FunAsrTranscriptionClient";
import { appendApiErrorLogSafely } from "../../../src/interface/http/errorLogging";
import { createTraceId } from "../../../src/interface/http/response";

export const dynamic = "force-dynamic";

interface CreateJobPayload {
  assetId?: unknown;
  category?: unknown;
  hotspot?: unknown;
  title?: unknown;
  transcript?: unknown;
  commentSignals?: unknown;
  creatorPositioning?: unknown;
  referenceTexts?: unknown;
}

export async function POST(request: Request) {
  const traceId = createTraceId(randomUUID());
  const payload = await request.json().catch(() => null) as CreateJobPayload | null;

  if (!payload) {
    return failure(400, traceId, "REQUEST_INVALID_JSON", "请求体必须是有效 JSON。");
  }

  const assetId = asString(payload.assetId);
  if (!assetId) {
    return failure(400, traceId, "REQUEST_VIDEO_ASSET_ID_REQUIRED", "缺少视频资产 ID。");
  }

  const categoryValue = asString(payload.category);
  const category: Category = isCategory(categoryValue)
    ? categoryValue
    : defaultInput.category;
  const title = asString(payload.title) || "上传视频分析";
  const storage = new LocalVideoStorage();
  const errorLog = new LocalJsonlErrorLog();
  const jobRepository = new LocalJsonJobRepository();

  try {
    const result = await createVideoAnalysisJob({
      request: {
        assetId,
        category,
        hotspot: asString(payload.hotspot) || title,
        title,
        fallbackTranscript: asString(payload.transcript),
        commentSignals: asString(payload.commentSignals),
        creatorPositioning:
          asString(payload.creatorPositioning) || `面向${category}受众的创作者`,
        referenceTexts: asStringArray(payload.referenceTexts)
      },
      traceId,
      storage,
      jobRepository,
      scheduler: localBackgroundTaskScheduler,
      runJob: async ({ request: jobRequest, initialJob, traceId: jobTraceId }) =>
        runVideoAnalysisJob({
          request: jobRequest,
          initialJob,
          traceId: jobTraceId,
          dependencies: {
            jobRepository,
            errorLog,
            reportRepository: new LocalJsonReportRepository(),
            videoStorage: storage,
            workspace: new LocalMediaWorkspace(),
            mediaProbe: new FfmpegMediaProbe(),
            audioExtractor: new FfmpegAudioExtractor(),
            frameSampler: new FfmpegFrameSampler(),
            frameCatalog: new LocalFrameCatalog(),
            transcriber: new FunAsrTranscriptionClient(),
            ocr: new PaddleOcrClient(),
            ...createMultimodalClients(),
            differentiator: new LocalDifferentiationClient(),
            knowledgeRepository: await createKnowledgeRepository(),
            modelRunRepository: new LocalJsonModelRunRepository(),
            sliceUnderstandingCache: new LocalJsonSliceUnderstandingCache()
          }
        })
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        traceId
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof VideoAssetNotFoundError) {
      return failure(
        404,
        traceId,
        "RESOURCE_VIDEO_ASSET_NOT_FOUND",
        "未找到对应的视频资产，请先上传视频。"
      );
    }

    const message = error instanceof Error ? error.message : "Video analysis job creation failed.";
    await appendApiErrorLogSafely(errorLog, {
      traceId,
      code: "SYSTEM_VIDEO_ANALYSIS_JOB_CREATION_FAILED",
      stage: "uploaded",
      message,
      detail: error instanceof Error ? { name: error.name, stack: error.stack } : error,
      timestamp: new Date().toISOString()
    });
    return failure(
      500,
      traceId,
      "SYSTEM_VIDEO_ANALYSIS_JOB_CREATION_FAILED",
      "视频分析任务创建失败，请稍后重试。"
    );
  }
}

function failure(status: number, traceId: string, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      traceId
    },
    { status }
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createMultimodalClients() {
  return createOpenAiCompatibleMultimodalClients() ?? {
    multimodalUnderstanding: new FakeMultimodalUnderstandingClient(),
    contentReasoner: new FakeContentReasoningClient()
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
