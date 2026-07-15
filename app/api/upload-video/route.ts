import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  runVideoAnalysisJob,
  VideoAnalysisJobExecutionError
} from "../../../src/application/useCases/runVideoAnalysisJob";
import { isCategory } from "../../../src/domain/categories";
import { defaultInput } from "../../../src/domain/sampleInputs";
import type { Category } from "../../../src/domain/types";
import { LocalDifferentiationClient } from "../../../src/infrastructure/differentiation/LocalDifferentiationClient";
import {
  FfmpegAudioExtractor,
  FfmpegFrameSampler,
  FfmpegMediaProbe
} from "../../../src/infrastructure/media/FfmpegMediaProcessing";
import { LocalFrameCatalog } from "../../../src/infrastructure/media/LocalFrameCatalog";
import { LocalMediaWorkspace } from "../../../src/infrastructure/media/LocalMediaWorkspace";
import { PaddleOcrClient } from "../../../src/infrastructure/ocr/PaddleOcrClient";
import { FunAsrTranscriptionClient } from "../../../src/infrastructure/transcription/FunAsrTranscriptionClient";
import { LocalVideoStorage } from "../../../src/infrastructure/storage/LocalVideoStorage";
import { LocalJsonJobRepository } from "../../../src/infrastructure/jobs/LocalJsonJobRepository";
import { LocalJsonlErrorLog } from "../../../src/infrastructure/logging/LocalJsonlErrorLog";
import { LocalJsonModelRunRepository } from "../../../src/infrastructure/modelRuns/LocalJsonModelRunRepository";
import { LocalJsonSliceUnderstandingCache } from "../../../src/infrastructure/modelRuns/LocalJsonSliceUnderstandingCache";
import { LocalJsonReportRepository } from "../../../src/infrastructure/reports/LocalJsonReportRepository";
import { createKnowledgeRepository } from "../../../src/infrastructure/knowledge/createKnowledgeRepository";
import { FakeContentReasoningClient } from "../../../src/infrastructure/multimodal/FakeContentReasoningClient";
import { FakeMultimodalUnderstandingClient } from "../../../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";
import { createOpenAiCompatibleMultimodalClients } from "../../../src/infrastructure/multimodal/OpenAiCompatibleMultimodalClients";
import { appendApiErrorLogSafely } from "../../../src/interface/http/errorLogging";
import { createTraceId } from "../../../src/interface/http/response";

export const dynamic = "force-dynamic";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

const SUPPORTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
  "video/x-m4v",
  "video/mpeg",
  "video/avi"
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpeg", "mpg"]);

export async function POST(request: Request) {
  const requestTraceId = createTraceId(randomUUID());
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return failure(400, requestTraceId, "REQUEST_INVALID_MULTIPART", "无效的上传表单。");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return failure(400, requestTraceId, "REQUEST_VIDEO_FILE_REQUIRED", "缺少视频文件。");
  }

  const format = getVideoFormat(file.name);
  if (!isSupportedVideo(file, format)) {
    return failure(
      415,
      requestTraceId,
      "REQUEST_UNSUPPORTED_VIDEO_FORMAT",
      "仅支持 mp4、mov、webm、mkv、avi、m4v、mpeg 或 mpg 视频。"
    );
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return failure(
      413,
      requestTraceId,
      "REQUEST_VIDEO_FILE_TOO_LARGE",
      "视频文件不能超过 500MB。"
    );
  }

  const categoryValue = asString(formData.get("category"));
  const category: Category = isCategory(categoryValue) ? categoryValue : defaultInput.category;
  const providedTitle = asString(formData.get("title"));
  const title = providedTitle || stripExtension(file.name) || "上传视频分析";
  const providedTranscript = asString(formData.get("transcript"));
  const referenceTexts = parseReferenceTexts(asString(formData.get("referenceTexts")));
  const transcript = providedTranscript || buildUploadTranscript({ file, format, title });
  const uploadedAt = new Date().toISOString();
  const assetId = `video_${randomUUID()}`;
  const jobId = `job_${randomUUID()}`;
  const hotspot = asString(formData.get("hotspot")) || title;
  const creatorPositioning =
    asString(formData.get("creatorPositioning")) || `面向${category}受众的创作者`;
  const traceId = createTraceId(`${jobId}:${uploadedAt}`);
  const errorLog = new LocalJsonlErrorLog();
  const multimodalClients = createMultimodalClients();

  try {
    const result = await runVideoAnalysisJob({
      request: {
        assetId,
        jobId,
        fileName: file.name,
        data: Buffer.from(await file.arrayBuffer()),
        category,
        hotspot,
        title,
        fallbackTranscript: transcript,
        commentSignals: asString(formData.get("commentSignals")),
        creatorPositioning,
        referenceTexts
      },
      dependencies: {
        jobRepository: new LocalJsonJobRepository(),
        errorLog,
        reportRepository: new LocalJsonReportRepository(),
        videoStorage: new LocalVideoStorage(),
        workspace: new LocalMediaWorkspace(),
        mediaProbe: new FfmpegMediaProbe(),
        audioExtractor: new FfmpegAudioExtractor(),
        frameSampler: new FfmpegFrameSampler(),
        frameCatalog: new LocalFrameCatalog(),
        transcriber: new FunAsrTranscriptionClient(),
        ocr: new PaddleOcrClient(),
        multimodalUnderstanding: multimodalClients.multimodalUnderstanding,
        contentReasoner: multimodalClients.contentReasoner,
        differentiator: new LocalDifferentiationClient(),
        knowledgeRepository: await createKnowledgeRepository(),
        modelRunRepository: new LocalJsonModelRunRepository(),
        sliceUnderstandingCache: new LocalJsonSliceUnderstandingCache()
      },
      traceId
    });

    return NextResponse.json({
      traceId,
      asset: {
        ...result.asset,
        format,
        mimeType: file.type || "unknown",
        size: file.size
      },
      job: result.job,
      mediaProcessing: result.mediaProcessing,
      transcription: result.transcription,
      ocr: result.ocr,
      frameSamples: result.frameSamples,
      videoObservation: result.videoObservation,
      uploadedVideo: {
        fileName: file.name,
        format,
        mimeType: file.type || "unknown",
        size: file.size
      },
      prefill: {
        title,
        transcript: result.transcription.fullText,
        category,
        hotspot
      },
      analysis: result.analysis
    });
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : "Unexpected video analysis failure.";
    await appendApiErrorLogSafely(errorLog, {
      traceId,
      jobId,
      code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
      stage:
        error instanceof VideoAnalysisJobExecutionError
          ? error.job.failure?.stage ?? error.job.status
          : "uploaded",
      message: originalMessage,
      detail: serializeErrorDetail(error),
      timestamp: new Date().toISOString()
    });
    const message =
      error instanceof VideoAnalysisJobExecutionError
        ? "视频分析任务执行失败，请检查存储空间或服务状态后重试。"
        : "视频分析任务发生未预期错误，请稍后重试。";
    return failure(500, traceId, "SYSTEM_VIDEO_ANALYSIS_FAILED", message);
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

function isSupportedVideo(file: File, format: string): boolean {
  return SUPPORTED_VIDEO_TYPES.has(file.type) || SUPPORTED_VIDEO_EXTENSIONS.has(format);
}

function getVideoFormat(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseReferenceTexts(value: string): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function createMultimodalClients() {
  return createOpenAiCompatibleMultimodalClients() ?? {
    multimodalUnderstanding: new FakeMultimodalUnderstandingClient(),
    contentReasoner: new FakeContentReasoningClient()
  };
}

function buildUploadTranscript({ file, format, title }: { file: File; format: string; title: string }): string {
  return [
    `已上传视频：${file.name}`,
    `视频标题：${title}`,
    `视频格式：${format || file.type || "unknown"}`,
    `文件大小：${Math.max(1, Math.round(file.size / 1024))}KB`,
    "P0 本地演示会先基于文件元数据和用户补充文稿生成分析。",
    "接入 ffmpeg 与 FunASR 后，这里会替换为真实视频转写文稿。"
  ].join("\n");
}

function serializeErrorDetail(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}
