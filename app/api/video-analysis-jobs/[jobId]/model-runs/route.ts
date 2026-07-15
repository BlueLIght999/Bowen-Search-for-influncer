import { NextResponse } from "next/server";
import { listModelRunsForJob } from "../../../../../src/application/useCases/listModelRunsForJob";
import { LocalJsonModelRunRepository } from "../../../../../src/infrastructure/modelRuns/LocalJsonModelRunRepository";
import { LocalJsonlErrorLog } from "../../../../../src/infrastructure/logging/LocalJsonlErrorLog";
import {
  createTraceId,
  type ApiFailure,
  type ApiSuccess
} from "../../../../../src/interface/http/response";
import { appendApiErrorLogSafely } from "../../../../../src/interface/http/errorLogging";
import { isSafeVideoAnalysisJobId } from "../../../../../src/interface/http/jobId";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

type ModelRunsResponse = Awaited<ReturnType<typeof listModelRunsForJob>>;

export async function GET(_request: Request, context: RouteContext) {
  const traceId = createTraceId();
  const { jobId } = await context.params;

  if (!isSafeVideoAnalysisJobId(jobId)) {
    const body: ApiFailure = {
      success: false,
      error: {
        code: "PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID",
        message: "Video analysis job id is invalid."
      },
      traceId
    };
    return NextResponse.json(body, { status: 400 });
  }

  let result: ModelRunsResponse;
  try {
    result = await listModelRunsForJob({
      jobId,
      repository: new LocalJsonModelRunRepository()
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Model run query failed.";
    await appendApiErrorLogSafely(new LocalJsonlErrorLog(), {
      traceId,
      jobId,
      code: "SYSTEM_MODEL_RUN_QUERY_FAILED",
      stage: "querying_model_runs",
      message,
      detail:
        error instanceof Error
          ? { name: error.name, stack: error.stack }
          : error,
      timestamp: new Date().toISOString()
    });

    const body: ApiFailure = {
      success: false,
      error: {
        code: "SYSTEM_MODEL_RUN_QUERY_FAILED",
        message: "Model run query failed."
      },
      traceId
    };
    return NextResponse.json(body, { status: 500 });
  }

  const body: ApiSuccess<ModelRunsResponse> = {
    success: true,
    data: result,
    traceId
  };
  return NextResponse.json(body);
}
