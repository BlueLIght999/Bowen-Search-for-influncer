import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VideoAnalysisReport } from "../src/domain/types";
import { LocalJsonReportRepository } from "../src/infrastructure/reports/LocalJsonReportRepository";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

const report: VideoAnalysisReport = {
  jobId: "job_123",
  status: "completed",
  video: {
    id: "video_123",
    filename: "demo.mp4"
  },
  transcript: {
    text: "demo transcript",
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

describe("LocalJsonReportRepository", () => {
  it("persists and restores a report by job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await repository.save(report);

    await expect(repository.findByJobId("job_123")).resolves.toEqual(report);
  });

  it("returns null for a missing report", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(repository.findByJobId("missing")).resolves.toBeNull();
  });

  it("rejects unsafe job ids instead of silently sanitizing report paths", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(
      repository.save({
        ...report,
        jobId: "job/123"
      })
    ).rejects.toThrow(
      "Job id can only contain letters, numbers, underscores, and hyphens."
    );
    await expect(repository.findByJobId("job/123")).rejects.toThrow(
      "Job id can only contain letters, numbers, underscores, and hyphens."
    );
  });

  it("rejects persisted reports whose content job id does not match the requested job id", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    await mkdir(join(tempRoot, "reports"), { recursive: true });
    await writeFile(
      join(tempRoot, "reports", "job_123.json"),
      JSON.stringify({
        ...report,
        jobId: "job_other"
      }),
      "utf8"
    );
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(repository.findByJobId("job_123")).rejects.toThrow(
      "Report job id mismatch: expected job_123 but found job_other."
    );
  });

  it("rejects saving reports with an invalid status", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(
      repository.save({
        ...report,
        status: "draft"
      } as never)
    ).rejects.toThrow("Invalid video analysis report status: draft");
  });

  it("rejects reports missing required evaluation fields", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(
      repository.save({
        ...report,
        evaluation: {
          ...report.evaluation,
          scoreReasons: undefined
        }
      } as never)
    ).rejects.toThrow("Video analysis report evaluation score reason is required: scriptQuality");
  });

  it("rejects persisted reports with invalid score ranges", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    await mkdir(join(tempRoot, "reports"), { recursive: true });
    await writeFile(
      join(tempRoot, "reports", "job_123.json"),
      JSON.stringify({
        ...report,
        evaluation: {
          ...report.evaluation,
          scores: {
            ...report.evaluation.scores,
            viralPotential: 123
          }
        }
      }),
      "utf8"
    );
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(repository.findByJobId("job_123")).rejects.toThrow(
      "Video analysis report evaluation score must be between 0 and 100: viralPotential"
    );
  });

  it("rejects reports with malformed keyword recommendations", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-reports-"));
    const repository = new LocalJsonReportRepository(tempRoot);

    await expect(
      repository.save({
        ...report,
        evaluation: {
          ...report.evaluation,
          keywordRecommendations: [
            {
              dimension: "scriptQuality",
              label: "脚本优秀度",
              keywords: "身份反转",
              reason: "should be an array"
            }
          ]
        }
      } as never)
    ).rejects.toThrow(
      "Video analysis report keyword recommendation keywords must be an array: scriptQuality"
    );
  });
});
