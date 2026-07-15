import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ModelRunRecord,
  ModelRunRepositoryPort,
  ModelRunStage
} from "../../application/ports/ModelRunRepositoryPort";
import { toSafeJobFileStem } from "../jobs/jobIdPath";

export class LocalJsonModelRunRepository implements ModelRunRepositoryPort {
  constructor(private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage") {}

  async save(run: ModelRunRecord): Promise<void> {
    assertValidModelRunRecord(run);
    const jobDirectory = join(
      this.rootDir,
      "model-runs",
      toSafeJobFileStem(run.jobId)
    );
    await mkdir(jobDirectory, { recursive: true });

    const targetPath = join(jobDirectory, `${toSafeRunFileStem(run.id)}.json`);
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(run, null, 2)}\n`,
      "utf8"
    );
    await rename(temporaryPath, targetPath);
  }

  async findByJobId(jobId: string): Promise<ModelRunRecord[]> {
    const jobDirectory = join(
      this.rootDir,
      "model-runs",
      toSafeJobFileStem(jobId)
    );

    let files: string[];
    try {
      files = await readdir(jobDirectory);
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }

    const runs = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const run = JSON.parse(
            await readFile(join(jobDirectory, file), "utf8")
          ) as ModelRunRecord;
          assertValidModelRunRecord(run, jobId);
          return run;
        })
    );

    return runs.sort(compareModelRuns);
  }
}

function assertValidModelRunRecord(
  run: ModelRunRecord,
  expectedJobId?: string
): void {
  const candidate = asRecord(run, "Model run record must be an object.");
  assertRequiredString(candidate.id, "Model run id is required.");
  toSafeRunFileStem(String(candidate.id));
  assertRequiredString(candidate.traceId, "Model run trace id is required.");
  assertRequiredString(candidate.jobId, "Model run job id is required.");
  toSafeJobFileStem(String(candidate.jobId));

  if (expectedJobId !== undefined && candidate.jobId !== expectedJobId) {
    throw new Error(
      `Model run job id mismatch: expected ${expectedJobId} but found ${String(candidate.jobId)}.`
    );
  }

  if (!["visually_understanding", "reasoning", "evaluation"].includes(String(candidate.stage))) {
    throw new Error(`Invalid model run stage: ${String(candidate.stage)}`);
  }

  assertRequiredString(candidate.provider, "Model run provider is required.");
  assertRequiredString(candidate.model, "Model run model is required.");
  assertRequiredString(candidate.promptVersion, "Model run prompt version is required.");
  assertRequiredString(candidate.schemaVersion, "Model run schema version is required.");
  assertRequiredString(candidate.inputHash, "Model run input hash is required.");
  assertRequiredString(candidate.cacheKey, "Model run cache key is required.");
  assertValidIsoString(candidate.startedAt, "Model run start time must be a valid ISO string.");
  assertNonNegativeFiniteNumber(candidate.latencyMs, "Model run latency must be a non-negative finite number.");
  assertNonNegativeInteger(candidate.retryCount, "Model run retry count must be a non-negative integer.");

  if (candidate.status !== "completed" && candidate.status !== "failed") {
    throw new Error(`Invalid model run status: ${String(candidate.status)}`);
  }
  if (typeof candidate.partial !== "boolean") {
    throw new Error("Model run partial flag must be a boolean.");
  }
  if (candidate.cache !== undefined) {
    assertValidModelRunCache(candidate.cache);
  }
  if (candidate.selection !== undefined) {
    assertValidModelRunSelection(candidate.selection);
  }
  if (candidate.usage !== undefined) {
    assertValidModelRunUsage(candidate.usage);
  }
}

function assertValidModelRunCache(value: unknown): void {
  const cache = asRecord(value, "Model run cache metadata must be an object.");
  if (!["hit", "miss", "read_failed", "write_failed"].includes(String(cache.status))) {
    throw new Error(`Invalid model run cache status: ${String(cache.status)}`);
  }
  if (typeof cache.savedModelCall !== "boolean") {
    throw new Error("Model run cache savedModelCall flag must be a boolean.");
  }
  if (
    cache.readFailed !== undefined &&
    typeof cache.readFailed !== "boolean"
  ) {
    throw new Error("Model run cache readFailed flag must be a boolean.");
  }
  if (
    cache.writeFailed !== undefined &&
    typeof cache.writeFailed !== "boolean"
  ) {
    throw new Error("Model run cache writeFailed flag must be a boolean.");
  }
  if (cache.cachedAt !== undefined) {
    assertValidIsoString(cache.cachedAt, "Model run cache time must be a valid ISO string.");
  }
}

function assertValidModelRunUsage(value: unknown): void {
  const usage = asRecord(value, "Model run usage must be an object.");
  assertOptionalNonNegativeInteger(usage.inputTokens, "Model run input token usage must be a non-negative integer.");
  assertOptionalNonNegativeInteger(usage.outputTokens, "Model run output token usage must be a non-negative integer.");
  assertOptionalNonNegativeInteger(usage.imageCount, "Model run image usage must be a non-negative integer.");
  assertOptionalNonNegativeInteger(usage.frameCount, "Model run frame usage must be a non-negative integer.");
}

function assertValidModelRunSelection(value: unknown): void {
  const selection = asRecord(value, "Model run selection metadata must be an object.");
  if (!["quality", "balanced", "local"].includes(String(selection.policyMode))) {
    throw new Error(`Invalid model run selection policy mode: ${String(selection.policyMode)}.`);
  }
  assertRequiredString(selection.providerProfileId, "Model run selection provider profile id is required.");
  if (
    !["cloud_direct_video", "cloud_frame_text", "local_vision_language"].includes(
      String(selection.route)
    )
  ) {
    throw new Error(`Invalid model run selection route: ${String(selection.route)}.`);
  }
  assertNonNegativeInteger(selection.effectiveFrameCount, "Model run selection effective frame count must be a non-negative integer.");
  assertNonNegativeFiniteNumber(selection.effectiveVideoSeconds, "Model run selection effective video seconds must be a non-negative finite number.");
  assertNonNegativeFiniteNumber(selection.estimatedCost, "Model run selection estimated cost must be a non-negative finite number.");
  if (selection.costBudget !== undefined) {
    assertNonNegativeFiniteNumber(selection.costBudget, "Model run selection cost budget must be a non-negative finite number.");
  }
  if (typeof selection.allowCloudUpload !== "boolean") {
    throw new Error("Model run selection allowCloudUpload flag must be a boolean.");
  }
  if (
    selection.requiresCloudUpload !== undefined &&
    typeof selection.requiresCloudUpload !== "boolean"
  ) {
    throw new Error("Model run selection requiresCloudUpload flag must be a boolean.");
  }
  assertRequiredString(selection.reason, "Model run selection reason is required.");
}

function compareModelRuns(left: ModelRunRecord, right: ModelRunRecord): number {
  const timeDiff = Date.parse(left.startedAt) - Date.parse(right.startedAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  const stageDiff = stageOrder(left.stage) - stageOrder(right.stage);
  if (stageDiff !== 0) {
    return stageDiff;
  }
  return left.id.localeCompare(right.id);
}

function stageOrder(stage: ModelRunStage): number {
  if (stage === "visually_understanding") {
    return 1;
  }
  if (stage === "reasoning") {
    return 2;
  }
  return 3;
}

function toSafeRunFileStem(runId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    throw new Error(
      "Model run id can only contain letters, numbers, underscores, and hyphens."
    );
  }
  return runId;
}

function assertRequiredString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertValidIsoString(value: unknown, message: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(message);
  }
}

function assertNonNegativeFiniteNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }
}

function assertNonNegativeInteger(value: unknown, message: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(message);
  }
}

function assertOptionalNonNegativeInteger(value: unknown, message: string): void {
  if (value !== undefined) {
    assertNonNegativeInteger(value, message);
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
