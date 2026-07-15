import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoAnalysisReport } from "../src/domain/types";
import { LocalJsonReportRepository } from "../src/infrastructure/reports/LocalJsonReportRepository";

let tempRoot: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function createReport(): VideoAnalysisReport {
  return {
    jobId: "job_123",
    status: "completed",
    video: {
      id: "video_123",
      filename: "demo.mp4"
    },
    transcript: {
      text: "demo",
      confidence: "medium"
    },
    understanding: {
      contentType: "mixed",
      scenes: [],
      visualTags: [],
      aiDramaSignals: [],
      subtitleSignals: [],
      evidenceConfidence: "low"
    },
    knowledgeEvidence: [],
    evaluation: {
      summary: "summary",
      scores: {
        scriptQuality: 70,
        hookStrength: 60,
        sceneDesign: 65,
        aestheticExperience: 66,
        emotionalRhythm: 64,
        differentiation: 72,
        viralPotential: 68
      },
      scoreReasons: {
        scriptQuality: "script reason",
        hookStrength: "hook reason",
        sceneDesign: "scene reason",
        aestheticExperience: "aesthetic reason",
        emotionalRhythm: "rhythm reason",
        differentiation: "differentiation reason",
        viralPotential: "viral reason"
      },
      keywordRecommendations: [],
      hitPatterns: [],
      missingPatterns: [],
      suggestions: []
    },
    generatedOutline: {
      titleOptions: ["title"],
      hook: "hook",
      scriptOutline: ["step"],
      sceneOutline: ["scene"],
      endingHook: "ending"
    }
  };
}

describe("GET /api/video-analysis-jobs/:jobId/report", () => {
  it("returns a persisted report", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await new LocalJsonReportRepository(tempRoot).save(createReport());

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/report"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe("job_123");
  });

  it("returns a structured 404 when the report is not ready", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/missing/report"),
      { params: Promise.resolve({ jobId: "missing" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_VIDEO_ANALYSIS_REPORT_NOT_FOUND");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 400 response for an invalid job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/!!!/report"),
      { params: Promise.resolve({ jobId: "!!!" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PARAM_VIDEO_ANALYSIS_JOB_ID_INVALID");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 500 when a persisted report belongs to another job", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await mkdir(join(tempRoot, "reports"), { recursive: true });
    await writeFile(
      join(tempRoot, "reports", "job_123.json"),
      JSON.stringify({
        ...createReport(),
        jobId: "job_other"
      }),
      "utf8"
    );

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/report"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED");
    expect(body.traceId).toMatch(/^trace_/);

    const [logLine] = (await readFile(join(tempRoot, "logs", "errors.jsonl"), "utf8"))
      .trim()
      .split("\n");
    expect(JSON.parse(logLine)).toMatchObject({
      traceId: body.traceId,
      jobId: "job_123",
      code: "SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED",
      stage: "querying_report",
      detail: {
        name: "Error"
      }
    });
  });

  it("returns a structured 500 when a persisted report is missing evaluation fields", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await mkdir(join(tempRoot, "reports"), { recursive: true });
    const corruptedReport = createReport() as never as Record<string, unknown>;
    const corruptedEvaluation = corruptedReport.evaluation as Record<string, unknown>;
    delete corruptedEvaluation.scoreReasons;
    await writeFile(
      join(tempRoot, "reports", "job_123.json"),
      JSON.stringify(corruptedReport),
      "utf8"
    );

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/report"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED");
    expect(body.traceId).toMatch(/^trace_/);
  });

  it("returns a structured 500 when a persisted report has malformed keyword recommendations", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-report-route-"));
    vi.stubEnv("BOWEN_STORAGE_ROOT", tempRoot);
    await mkdir(join(tempRoot, "reports"), { recursive: true });
    const corruptedReport = createReport() as never as Record<string, unknown>;
    const corruptedEvaluation = corruptedReport.evaluation as Record<string, unknown>;
    corruptedEvaluation.keywordRecommendations = [
      {
        dimension: "scriptQuality",
        label: "脚本优秀度",
        keywords: "身份反转",
        reason: "should be an array"
      }
    ];
    await writeFile(
      join(tempRoot, "reports", "job_123.json"),
      JSON.stringify(corruptedReport),
      "utf8"
    );

    const route = await import("../app/api/video-analysis-jobs/[jobId]/report/route");
    const response = await route.GET(
      new Request("http://localhost/api/video-analysis-jobs/job_123/report"),
      { params: Promise.resolve({ jobId: "job_123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SYSTEM_VIDEO_ANALYSIS_REPORT_QUERY_FAILED");
    expect(body.traceId).toMatch(/^trace_/);
  });
});
