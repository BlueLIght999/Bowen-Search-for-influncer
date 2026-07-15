import { NextResponse } from "next/server";
import { LocalJsonReportRepository } from "../../../../../src/infrastructure/reports/LocalJsonReportRepository";
import { LocalJsonlErrorLog } from "../../../../../src/infrastructure/logging/LocalJsonlErrorLog";
import {
  createTraceId,
  type ApiFailure,
  type ApiSuccess
} from "../../../../../src/interface/http/response";
import { appendApiErrorLogSafely } from "../../../../../src/interface/http/errorLogging";
import { isSafeVideoAnalysisJobId } from "../../../../../src/interface/http/jobId";
import type { VideoAnalysisReport } from "../../../../../src/domain/types";

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

  let report: VideoAnalysisReport | null;

  try {
    report = await new LocalJsonReportRepository().findByJobId(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video analysis report query failed.";
    await appendApiErrorLogSafely(new LocalJsonlErrorLog(), {
      traceId,
      jobId,
      code: "SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED",
      stage: "querying_report",
      message,
      detail: error instanceof Error ? { name: error.name, stack: error.stack } : error,
      timestamp: new Date().toISOString()
    });

    const body: ApiFailure = {
      success: false,
      error: {
        code: "SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED",
        message: "视频分析报告查询失败，请稍后重试。"
      },
      traceId
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!report) {
    const body: ApiFailure = {
      success: false,
      error: {
        code: "RESOURCE_VIDEO_ANALYSIS_REPORT_NOT_FOUND",
        message: "分析报告尚未生成或对应任务不存在。"
      },
      traceId
    };
    return NextResponse.json(body, { status: 404 });
  }

  const body: ApiSuccess<VideoAnalysisReport> = {
    success: true,
    data: report,
    traceId
  };
  return NextResponse.json(body);
}
