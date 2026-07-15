import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportRepositoryPort } from "../../application/ports/ReportRepositoryPort";
import type { VideoAnalysisReport } from "../../domain/types";
import { toSafeJobFileStem } from "../jobs/jobIdPath";

export class LocalJsonReportRepository implements ReportRepositoryPort {
  constructor(private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage") {}

  async save(report: VideoAnalysisReport): Promise<void> {
    assertValidVideoAnalysisReport(report);
    const reportsDirectory = join(this.rootDir, "reports");
    await mkdir(reportsDirectory, { recursive: true });

    const targetPath = join(
      reportsDirectory,
      `${toSafeJobFileStem(report.jobId)}.json`
    );
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    await rename(temporaryPath, targetPath);
  }

  async findByJobId(jobId: string): Promise<VideoAnalysisReport | null> {
    const targetPath = join(
      this.rootDir,
      "reports",
      `${toSafeJobFileStem(jobId)}.json`
    );

    try {
      const report = JSON.parse(await readFile(targetPath, "utf8")) as VideoAnalysisReport;
      assertValidVideoAnalysisReport(report, jobId);
      return report;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function assertValidVideoAnalysisReport(report: VideoAnalysisReport, expectedJobId?: string): void {
  const candidate = asRecord(report, "Video analysis report must be an object.");

  if (typeof candidate.jobId !== "string" || candidate.jobId.trim().length === 0) {
    throw new Error("Video analysis report job id is required.");
  }

  toSafeJobFileStem(candidate.jobId);

  if (expectedJobId !== undefined && candidate.jobId !== expectedJobId) {
    throw new Error(
      `Report job id mismatch: expected ${expectedJobId} but found ${candidate.jobId}.`
    );
  }

  if (candidate.status !== "completed" && candidate.status !== "failed") {
    throw new Error(`Invalid video analysis report status: ${String(candidate.status)}`);
  }

  assertReportVideo(candidate.video);
  assertReportTranscript(candidate.transcript);
  assertReportUnderstanding(candidate.understanding);
  assertArray(candidate.knowledgeEvidence, "Video analysis report knowledge evidence must be an array.");
  assertReportEvaluation(candidate.evaluation);
  assertGeneratedOutline(candidate.generatedOutline);
}

const requiredScoreKeys = [
  "scriptQuality",
  "hookStrength",
  "sceneDesign",
  "aestheticExperience",
  "emotionalRhythm",
  "differentiation",
  "viralPotential"
] as const;

const allowedKeywordRecommendationDimensions = [
  "scriptQuality",
  "hookStrength",
  "sceneDesign",
  "aestheticExperience",
  "emotionalRhythm",
  "differentiation",
  "viralPotential",
  "aiDramaFit"
] as const;

function assertReportVideo(value: unknown): void {
  const video = asRecord(value, "Video analysis report video must be an object.");
  assertRequiredString(video.id, "Video analysis report video id is required.");
  assertRequiredString(video.filename, "Video analysis report video filename is required.");
}

function assertReportTranscript(value: unknown): void {
  const transcript = asRecord(value, "Video analysis report transcript must be an object.");
  assertRequiredString(transcript.text, "Video analysis report transcript text is required.");
  if (!["high", "medium", "low"].includes(String(transcript.confidence))) {
    throw new Error(`Invalid video analysis report transcript confidence: ${String(transcript.confidence)}`);
  }
}

function assertReportUnderstanding(value: unknown): void {
  const understanding = asRecord(value, "Video analysis report understanding must be an object.");
  if (!["ai_drama", "talking_head", "mixed", "unknown"].includes(String(understanding.contentType))) {
    throw new Error(`Invalid video analysis report content type: ${String(understanding.contentType)}`);
  }
  assertArray(understanding.scenes, "Video analysis report scenes must be an array.");
  assertArray(understanding.visualTags, "Video analysis report visual tags must be an array.");
  assertArray(understanding.aiDramaSignals, "Video analysis report AI drama signals must be an array.");
  assertArray(understanding.subtitleSignals, "Video analysis report subtitle signals must be an array.");
  if (!["high", "medium", "low"].includes(String(understanding.evidenceConfidence))) {
    throw new Error(
      `Invalid video analysis report evidence confidence: ${String(understanding.evidenceConfidence)}`
    );
  }
}

function assertReportEvaluation(value: unknown): void {
  const evaluation = asRecord(value, "Video analysis report evaluation must be an object.");
  assertRequiredString(evaluation.summary, "Video analysis report evaluation summary is required.");

  const scores = asRecord(
    evaluation.scores,
    "Video analysis report evaluation scores must be an object."
  );
  for (const key of requiredScoreKeys) {
    assertScore(scores[key], key);
  }
  if (scores.aiDramaFit !== undefined) {
    assertScore(scores.aiDramaFit, "aiDramaFit");
  }

  const scoreReasons = isRecord(evaluation.scoreReasons) ? evaluation.scoreReasons : {};
  for (const key of requiredScoreKeys) {
    if (typeof scoreReasons[key] !== "string" || scoreReasons[key].trim().length === 0) {
      throw new Error(`Video analysis report evaluation score reason is required: ${key}`);
    }
  }
  if (scores.aiDramaFit !== undefined) {
    const aiDramaReason = scoreReasons.aiDramaFit;
    if (typeof aiDramaReason !== "string" || aiDramaReason.trim().length === 0) {
      throw new Error("Video analysis report evaluation score reason is required: aiDramaFit");
    }
  }

  assertArray(
    evaluation.keywordRecommendations,
    "Video analysis report keyword recommendations must be an array."
  );
  for (const item of evaluation.keywordRecommendations) {
    assertKeywordRecommendation(item);
  }
  assertArray(evaluation.hitPatterns, "Video analysis report hit patterns must be an array.");
  assertArray(evaluation.missingPatterns, "Video analysis report missing patterns must be an array.");
  assertArray(evaluation.suggestions, "Video analysis report suggestions must be an array.");
}

function assertKeywordRecommendation(value: unknown): void {
  const item = asRecord(
    value,
    "Video analysis report keyword recommendation must be an object."
  );
  const dimension = String(item.dimension);
  if (!allowedKeywordRecommendationDimensions.includes(
    dimension as (typeof allowedKeywordRecommendationDimensions)[number]
  )) {
    throw new Error(`Invalid video analysis report keyword recommendation dimension: ${dimension}`);
  }
  assertRequiredString(
    item.label,
    `Video analysis report keyword recommendation label is required: ${dimension}`
  );
  assertArray(
    item.keywords,
    `Video analysis report keyword recommendation keywords must be an array: ${dimension}`
  );
  if (!item.keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0)) {
    throw new Error(
      `Video analysis report keyword recommendation keywords must be non-empty strings: ${dimension}`
    );
  }
  assertRequiredString(
    item.reason,
    `Video analysis report keyword recommendation reason is required: ${dimension}`
  );
}

function assertGeneratedOutline(value: unknown): void {
  const outline = asRecord(value, "Video analysis report generated outline must be an object.");
  assertArray(outline.titleOptions, "Video analysis report title options must be an array.");
  assertRequiredString(outline.hook, "Video analysis report outline hook is required.");
  assertArray(outline.scriptOutline, "Video analysis report script outline must be an array.");
  assertArray(outline.sceneOutline, "Video analysis report scene outline must be an array.");
  assertRequiredString(outline.endingHook, "Video analysis report ending hook is required.");
}

function assertScore(value: unknown, key: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Video analysis report evaluation score must be a finite number: ${key}`);
  }
  if (value < 0 || value > 100) {
    throw new Error(`Video analysis report evaluation score must be between 0 and 100: ${key}`);
  }
}

function assertRequiredString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
