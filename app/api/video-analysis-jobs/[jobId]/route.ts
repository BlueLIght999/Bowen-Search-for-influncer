import { NextResponse } from "next/server";
import { LocalJsonJobRepository } from "../../../../src/infrastructure/jobs/LocalJsonJobRepository";
import { LocalJsonlErrorLog } from "../../../../src/infrastructure/logging/LocalJsonlErrorLog";
import {
  createTraceId,
  type ApiFailure,
  type ApiSuccess
} from "../../../../src/interface/http/response";
import { appendApiErrorLogSafely } from "../../../../src/interface/http/errorLogging";
import { isSafeVideoAnalysisJobId } from "../../../../src/interface/http/jobId";
import type { VideoAnalysisJobSnapshot } from "../../../../src/domain/jobs/VideoAnalysisJob";
import {
  projectVideoAnalysisJobProgress,
  type VideoAnalysisJobProgress
} from "../../../../src/application/useCases/projectVideoAnalysisJobProgress";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const traceId = createTraceId();
  const { jobId } = await context.params;

  if (!isSafeVideoAnalysisJobId(jobId)) {
    const body: ApiFailure = {
      success: false,
      error: {
        code: "PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID",
        message: "视频分析任务 ID 格式不正确。"
      },
      traceId
    };
    return NextResponse.json(body, { status: 400 });
  }

  let job: VideoAnalysisJobSnapshot | null;
  let progress!: VideoAnalysisJobProgress;

  try {
    job = await new LocalJsonJobRepository().findById(jobId);
    if (job) {
      progress = projectVideoAnalysisJobProgress(job);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video analysis job query failed.";
    await appendApiErrorLogSafely(new LocalJsonlErrorLog(), {
      traceId,
      jobId,
      code: "SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED",
      stage: "querying_job",
      message,
      detail: error instanceof Error ? { name: error.name, stack: error.stack } : error,
      timestamp: new Date().toISOString()
    });

    const body: ApiFailure = {
      success: false,
      error: {
        code: "SYSTEM_VIDEO_ANALYSIS_JOB_QUERY_FAILED",
        message: "视频分析任务查询失败，请稍后重试。"
      },
      traceId
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!job) {
    const body: ApiFailure = {
      success: false,
      error: {
        code: "RESOURCE_VIDEO_ANALYSIS_JOB_NOT_FOUND",
        message: "未找到对应的视频分析任务。"
      },
      traceId
    };
    return NextResponse.json(body, { status: 404 });
  }

  const body: ApiSuccess<VideoAnalysisJobSnapshot & VideoAnalysisJobProgress> = {
    success: true,
    data: {
      ...job,
      ...progress
    },
    traceId
  };
  return NextResponse.json(body);
}
