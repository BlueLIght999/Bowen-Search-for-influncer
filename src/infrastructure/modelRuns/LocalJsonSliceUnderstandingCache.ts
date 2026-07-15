import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CachedSliceUnderstanding,
  SliceUnderstandingCachePort
} from "../../application/ports/SliceUnderstandingCachePort";

export class LocalJsonSliceUnderstandingCache
  implements SliceUnderstandingCachePort
{
  constructor(private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage") {}

  async findByCacheKey(cacheKey: string): Promise<CachedSliceUnderstanding | null> {
    const safeCacheKey = toSafeSliceCacheKey(cacheKey);
    try {
      const record = JSON.parse(
        await readFile(this.cachePath(safeCacheKey), "utf8")
      ) as CachedSliceUnderstanding;
      assertValidCachedSliceUnderstanding(record, safeCacheKey);
      return record;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }

  async save(record: CachedSliceUnderstanding): Promise<void> {
    assertValidCachedSliceUnderstanding(record);
    await mkdir(this.cacheDirectory(), { recursive: true });
    const targetPath = this.cachePath(record.cacheKey);
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    await rename(temporaryPath, targetPath);
  }

  private cacheDirectory(): string {
    return join(this.rootDir, "slice-understanding-cache");
  }

  private cachePath(cacheKey: string): string {
    return join(this.cacheDirectory(), `${toSafeSliceCacheKey(cacheKey)}.json`);
  }
}

function assertValidCachedSliceUnderstanding(
  record: CachedSliceUnderstanding,
  expectedCacheKey?: string
): void {
  const candidate = asRecord(record, "Slice cache record must be an object.");
  assertRequiredString(candidate.cacheKey, "Slice cache key is required.");
  toSafeSliceCacheKey(String(candidate.cacheKey));
  if (
    expectedCacheKey !== undefined &&
    String(candidate.cacheKey) !== expectedCacheKey
  ) {
    throw new Error(
      `Slice cache key mismatch: expected ${expectedCacheKey} but found ${String(candidate.cacheKey)}.`
    );
  }

  assertRequiredString(candidate.inputHash, "Slice cache input hash is required.");
  assertValidIsoString(candidate.cachedAt, "Slice cache timestamp must be a valid ISO string.");
  assertValidObservation(candidate.observation);
  assertValidExecution(candidate.execution);
}

function assertValidObservation(value: unknown): void {
  const observation = asRecord(value, "Slice cache observation must be an object.");
  assertRequiredString(observation.id, "Slice observation id is required.");
  assertRequiredString(observation.sliceId, "Slice observation slice id is required.");
  assertNonNegativeFiniteNumber(observation.startMs, "Slice observation start must be a non-negative finite number.");
  assertNonNegativeFiniteNumber(observation.endMs, "Slice observation end must be a non-negative finite number.");
  assertRequiredString(observation.summary, "Slice observation summary is required.");
  assertStringArray(observation.visibleSubjects, "Slice observation visible subjects must be a string array.");
  assertStringArray(observation.actions, "Slice observation actions must be a string array.");
  assertStringArray(observation.shotTypes, "Slice observation shot types must be a string array.");
  assertStringArray(observation.aiDramaSignals, "Slice observation AI drama signals must be a string array.");
  assertNonNegativeFiniteNumber(observation.confidence, "Slice observation confidence must be a non-negative finite number.");
  if (!Array.isArray(observation.claims)) {
    throw new Error("Slice observation claims must be an array.");
  }
}

function assertValidExecution(value: unknown): void {
  const execution = asRecord(value, "Slice cache execution must be an object.");
  assertRequiredString(execution.provider, "Slice cache provider is required.");
  assertRequiredString(execution.model, "Slice cache model is required.");
  assertRequiredString(execution.promptVersion, "Slice cache prompt version is required.");
  assertRequiredString(execution.schemaVersion, "Slice cache schema version is required.");
  assertNonNegativeFiniteNumber(execution.latencyMs, "Slice cache latency must be a non-negative finite number.");
  if (execution.status !== "completed" && execution.status !== "failed") {
    throw new Error(`Invalid slice cache execution status: ${String(execution.status)}`);
  }
  if (typeof execution.partial !== "boolean") {
    throw new Error("Slice cache partial flag must be a boolean.");
  }
}

function toSafeSliceCacheKey(cacheKey: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(cacheKey)) {
    throw new Error(
      "Slice cache key can only contain letters, numbers, underscores, and hyphens."
    );
  }
  return cacheKey;
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

function assertStringArray(value: unknown, message: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(message);
  }
}

function assertNonNegativeFiniteNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
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
