import type { Category, VideoAnalysisReport } from "../../domain/types";

const JOB_STATUSES = new Set([
  "uploaded",
  "extracting_audio",
  "transcribing",
  "sampling_frames",
  "visually_understanding",
  "reasoning",
  "retrieving_knowledge",
  "evaluating",
  "completed",
  "failed"
]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed"]);
const DEFAULT_MAX_POLLS = 600;

export interface VideoAnalysisPipelineJobInput {
  category: Category;
  title: string;
  hotspot: string;
  transcript: string;
  creatorPositioning: string;
  referenceTexts: string[];
}

export interface UploadedVideoAssetView {
  id: string;
  fileName: string;
  format: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedAt: string;
}

export interface VideoAnalysisJobProgressView {
  id: string;
  videoId?: string;
  status: string;
  progressPercent: number;
  currentStage: string;
  isTerminal: boolean;
  createdAt?: string;
  updatedAt?: string;
  failure?: {
    code: string;
    message: string;
  };
  traceId?: string;
}

export interface VideoAnalysisPipelineClientResult {
  asset: UploadedVideoAssetView;
  job: VideoAnalysisJobProgressView;
  report: VideoAnalysisReport;
}

export class VideoAnalysisPipelineClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly jobId?: string,
    readonly traceId?: string
  ) {
    super(message);
    this.name = "VideoAnalysisPipelineClientError";
  }
}

interface RunVideoAnalysisPipelineClientOptions {
  file: File;
  jobInput: VideoAnalysisPipelineJobInput;
  fetcher?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (progress: VideoAnalysisJobProgressView) => void;
}

export async function runVideoAnalysisPipelineClient({
  file,
  jobInput,
  fetcher = fetch,
  delay = defaultDelay,
  pollIntervalMs = 1000,
  maxPolls = DEFAULT_MAX_POLLS,
  onProgress
}: RunVideoAnalysisPipelineClientOptions): Promise<VideoAnalysisPipelineClientResult> {
  const asset = await uploadAsset(file, fetcher);
  let job = await createJob(asset.id, jobInput, fetcher);
  onProgress?.(job);

  for (let attempt = 0; attempt < maxPolls && !job.isTerminal; attempt += 1) {
    await delay(pollIntervalMs);
    job = await fetchJob(job.id, fetcher);
    onProgress?.(job);
  }

  if (!job.isTerminal) {
    job = await fetchJob(job.id, fetcher);
    onProgress?.(job);
  }

  if (!job.isTerminal) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_VIDEO_ANALYSIS_TIMEOUT",
      "视频分析任务超时，请稍后查看任务状态。",
      job.id
    );
  }

  if (job.status === "failed") {
    throw new VideoAnalysisPipelineClientError(
      job.failure?.code ?? "SYSTEM_VIDEO_ANALYSIS_FAILED",
      job.failure?.message ?? "视频分析任务失败。",
      job.id,
      job.traceId
    );
  }

  const report = await fetchReport(job.id, fetcher);
  return { asset, job, report };
}

async function uploadAsset(
  file: File,
  fetcher: typeof fetch
): Promise<UploadedVideoAssetView> {
  const formData = new FormData();
  formData.append("file", file);
  const body = await requestJsonEnvelope<{ asset: unknown }>(
    fetcher,
    "/api/video-assets",
    {
      method: "POST",
      body: formData
    }
  );
  return normalizeUploadedAsset(body.data.asset, body.traceId);
}

async function createJob(
  assetId: string,
  jobInput: VideoAnalysisPipelineJobInput,
  fetcher: typeof fetch
): Promise<VideoAnalysisJobProgressView> {
  const body = await requestJsonEnvelope<{ job: unknown }>(
    fetcher,
    "/api/video-analysis-jobs",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetId,
        category: jobInput.category,
        title: jobInput.title,
        hotspot: jobInput.hotspot,
        transcript: jobInput.transcript,
        creatorPositioning: jobInput.creatorPositioning,
        referenceTexts: jobInput.referenceTexts
      })
    }
  );
  return normalizeJobProgress(body.data.job, body.traceId);
}

async function fetchJob(
  jobId: string,
  fetcher: typeof fetch
): Promise<VideoAnalysisJobProgressView> {
  const body = await requestJsonEnvelope<unknown>(
    fetcher,
    `/api/video-analysis-jobs/${encodeURIComponent(jobId)}`,
    { cache: "no-store" }
  );
  return normalizeJobProgress(body.data, body.traceId);
}

async function fetchReport(
  jobId: string,
  fetcher: typeof fetch
): Promise<VideoAnalysisReport> {
  const body = await requestJsonEnvelope<VideoAnalysisReport>(
    fetcher,
    `/api/video-analysis-jobs/${encodeURIComponent(jobId)}/report`,
    { cache: "no-store" }
  );
  return normalizeReport(body.data, jobId, body.traceId);
}

async function requestJson<T>(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  return (await requestJsonEnvelope<T>(fetcher, input, init)).data;
}

async function requestJsonEnvelope<T>(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ data: T; traceId?: string }> {
  let response: Response;
  try {
    response = await fetcher(input, init);
  } catch {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_VIDEO_ANALYSIS_REQUEST_FAILED",
      "视频分析请求失败，请检查本地服务是否已启动。",
      undefined,
      undefined
    );
  }
  const payload = await response.json().catch(() => null) as
    | { success?: boolean; data?: T; error?: { code?: string; message?: string }; traceId?: string }
    | null;

  if (!response.ok || payload?.success === false) {
    throw new VideoAnalysisPipelineClientError(
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `请求失败：${response.status}`,
      undefined,
      payload?.traceId
    );
  }

  if (!payload || payload.success !== true || payload.data === undefined) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_API_RESPONSE",
      "接口响应格式不符合预期。"
    );
  }

  return { data: payload.data, traceId: payload.traceId };
}

function normalizeJobProgress(job: unknown, traceId?: string): VideoAnalysisJobProgressView {
  const raw = job as Partial<VideoAnalysisJobProgressView>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_JOB_PROGRESS",
      "任务进度响应缺少任务 ID。",
      undefined,
      raw.traceId ?? traceId
    );
  }
  const status = String(raw.status ?? "uploaded");
  if (!JOB_STATUSES.has(status)) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_JOB_PROGRESS",
      "任务进度响应包含未知状态。",
      id,
      raw.traceId ?? traceId
    );
  }
  const progressPercent =
    typeof raw.progressPercent === "number"
      ? raw.progressPercent
      : status === "completed"
        ? 100
        : 5;
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_JOB_PROGRESS",
      "任务进度响应包含非法进度值。",
      id,
      raw.traceId ?? traceId
    );
  }
  const expectedTerminal = TERMINAL_JOB_STATUSES.has(status);
  if (typeof raw.isTerminal === "boolean" && raw.isTerminal !== expectedTerminal) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_JOB_PROGRESS",
      "任务进度响应的终态标记与状态不一致。",
      id,
      raw.traceId ?? traceId
    );
  }
  return {
    id,
    videoId: raw.videoId,
    status,
    progressPercent,
    currentStage: String(raw.currentStage ?? status),
    isTerminal:
      typeof raw.isTerminal === "boolean"
        ? raw.isTerminal
        : expectedTerminal,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    failure: raw.failure,
    traceId: raw.traceId ?? traceId
  };
}

function normalizeUploadedAsset(asset: unknown, traceId?: string): UploadedVideoAssetView {
  const raw = asset as Partial<UploadedVideoAssetView>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_ASSET_RESPONSE",
      "视频上传响应缺少资产 ID。",
      undefined,
      traceId
    );
  }

  return {
    id,
    fileName: typeof raw.fileName === "string" ? raw.fileName : "",
    format: typeof raw.format === "string" ? raw.format : "",
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "unknown",
    size: typeof raw.size === "number" ? raw.size : 0,
    storagePath: typeof raw.storagePath === "string" ? raw.storagePath : "",
    uploadedAt: typeof raw.uploadedAt === "string" ? raw.uploadedAt : ""
  };
}

function normalizeReport(report: unknown, expectedJobId: string, traceId?: string): VideoAnalysisReport {
  const raw = report as Partial<VideoAnalysisReport>;
  if (raw.jobId !== expectedJobId) {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_REPORT_RESPONSE",
      "分析报告与当前任务不匹配。",
      expectedJobId,
      traceId
    );
  }
  if (raw.status !== "completed" && raw.status !== "failed") {
    throw new VideoAnalysisPipelineClientError(
      "SYSTEM_INVALID_REPORT_RESPONSE",
      "分析报告响应状态不符合预期。",
      expectedJobId,
      traceId
    );
  }
  return raw as VideoAnalysisReport;
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
