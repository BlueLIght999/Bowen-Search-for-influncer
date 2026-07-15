import type {
  ModelExecutionSummary,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import { createSliceVisualObservation } from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import {
  InvalidMultimodalEvidenceError,
  type EvidenceRange,
  type TimelineSlice,
  type VideoEvidenceBundle
} from "../../domain/multimodalIntelligence/VideoEvidence";
import {
  createModelRunCacheKey,
  hashModelRunInput
} from "../modelRunCacheKey";
import type {
  MultimodalFrameAsset,
  MultimodalUnderstandingPort
} from "../ports/MultimodalUnderstandingPort";
import type {
  CachedSliceUnderstanding,
  SliceUnderstandingCachePort,
  SliceUnderstandingModelProfile
} from "../ports/SliceUnderstandingCachePort";
import type { ModelRunCacheStatus } from "../ports/ModelRunRepositoryPort";

export type SliceUnderstandingFailureCode =
  | "SOURCE_MULTIMODAL_MODEL_UNAVAILABLE"
  | "ANALYSIS_MULTIMODAL_OUTPUT_INVALID";

export interface SliceUnderstandingFailure {
  sliceId: string;
  code: SliceUnderstandingFailureCode;
  reason: string;
  retryable?: boolean;
}

export interface SliceUnderstandingCoverage {
  coveredRanges: EvidenceRange[];
  coveredDurationMs: number;
  coverageRatio: number;
}

export interface SliceUnderstandingCacheStats {
  hits: number;
  misses: number;
  writes: number;
  readFailures: number;
  writeFailures: number;
}

export interface SliceUnderstandingCacheOutcome {
  sliceId: string;
  status: ModelRunCacheStatus;
  inputHash: string;
  cacheKey: string;
  savedModelCall: boolean;
  readFailed?: boolean;
  writeFailed?: boolean;
  cachedAt?: string;
}

export interface UnderstandVideoSlicesInput {
  evidenceBundle: VideoEvidenceBundle;
  frameAssets: MultimodalFrameAsset[];
  multimodal: MultimodalUnderstandingPort;
  cache?: SliceUnderstandingCachePort;
  now?: () => string;
}

export interface UnderstandVideoSlicesResult {
  status: "completed" | "partial" | "failed";
  observations: SliceVisualObservation[];
  failures: SliceUnderstandingFailure[];
  executions: ModelExecutionSummary[];
  coverage: SliceUnderstandingCoverage;
  cacheStats: SliceUnderstandingCacheStats;
  cacheOutcomes: SliceUnderstandingCacheOutcome[];
}

export async function understandVideoSlices({
  evidenceBundle,
  frameAssets,
  multimodal,
  cache,
  now = () => new Date().toISOString()
}: UnderstandVideoSlicesInput): Promise<UnderstandVideoSlicesResult> {
  const observations: SliceVisualObservation[] = [];
  const failures: SliceUnderstandingFailure[] = [];
  const executions: ModelExecutionSummary[] = [];
  const cacheOutcomes: SliceUnderstandingCacheOutcome[] = [];
  const cacheStats = createEmptyCacheStats();
  const cacheProfile = cache ? multimodal.getSliceModelProfile?.() : undefined;

  for (const slice of evidenceBundle.timelineSlices) {
    const cacheContext =
      cache && cacheProfile
        ? createSliceCacheContext(evidenceBundle, slice, cacheProfile)
        : undefined;
    let cacheOutcome:
      | Omit<SliceUnderstandingCacheOutcome, "status">
      & { status: ModelRunCacheStatus }
      | undefined;

    if (cache && cacheContext) {
      const cached = await readCachedSlice({
        cache,
        cacheKey: cacheContext.cacheKey,
        evidenceBundle,
        cacheStats
      });
      if (cached.status === "hit") {
        observations.push(cached.observation);
        executions.push(cached.execution);
        cacheOutcomes.push({
          sliceId: slice.id,
          status: "hit",
          inputHash: cacheContext.inputHash,
          cacheKey: cacheContext.cacheKey,
          savedModelCall: true,
          cachedAt: cached.cachedAt
        });
        continue;
      }

      cacheOutcome = {
        sliceId: slice.id,
        status: cached.status,
        inputHash: cacheContext.inputHash,
        cacheKey: cacheContext.cacheKey,
        savedModelCall: false,
        readFailed: cached.status === "read_failed"
      };
    }

    try {
      const result = await multimodal.understandSlice({
        jobId: evidenceBundle.jobId,
        videoId: evidenceBundle.videoId,
        evidenceBundle,
        slice,
        frameAssets: getFrameAssetsForSlice(frameAssets, slice.frameIds)
      });

      if (result.status === "failed") {
        if (result.execution) {
          executions.push(result.execution);
        }
        failures.push({
          sliceId: slice.id,
          code: "SOURCE_MULTIMODAL_MODEL_UNAVAILABLE",
          reason: result.reason,
          retryable: result.retryable
        });
        continue;
      }

      const observation = createSliceVisualObservation(
        result.observation,
        evidenceBundle
      );
      observations.push(observation);
      executions.push(result.execution);
      if (cache && cacheContext) {
        const writeStatus = await writeCachedSlice({
          cache,
          record: {
            cacheKey: cacheContext.cacheKey,
            inputHash: cacheContext.inputHash,
            observation,
            execution: result.execution,
            cachedAt: now()
          },
          cacheStats
        });
        if (cacheOutcome) {
          cacheOutcome = {
            ...cacheOutcome,
            status:
              writeStatus === "write_failed"
                ? "write_failed"
                : cacheOutcome.status,
            writeFailed: writeStatus === "write_failed"
          };
        }
      }
      if (cacheOutcome) {
        cacheOutcomes.push(cacheOutcome);
      }
    } catch (error) {
      failures.push({
        sliceId: slice.id,
        code:
          error instanceof InvalidMultimodalEvidenceError
            ? "ANALYSIS_MULTIMODAL_OUTPUT_INVALID"
            : "SOURCE_MULTIMODAL_MODEL_UNAVAILABLE",
        reason:
          error instanceof Error
            ? error.message
            : "Multimodal slice understanding failed."
      });
    }
  }

  const coverage = calculateCoverage(observations, evidenceBundle.durationMs);
  const status =
    observations.length === 0
      ? "failed"
      : failures.length > 0
        ? "partial"
        : "completed";

  return {
    status,
    observations,
    failures,
    executions,
    coverage,
    cacheStats,
    cacheOutcomes
  };
}

function createEmptyCacheStats(): SliceUnderstandingCacheStats {
  return {
    hits: 0,
    misses: 0,
    writes: 0,
    readFailures: 0,
    writeFailures: 0
  };
}

async function readCachedSlice({
  cache,
  cacheKey,
  evidenceBundle,
  cacheStats
}: {
  cache: SliceUnderstandingCachePort;
  cacheKey: string;
  evidenceBundle: VideoEvidenceBundle;
  cacheStats: SliceUnderstandingCacheStats;
}): Promise<{
  status: "hit";
  observation: SliceVisualObservation;
  execution: ModelExecutionSummary;
  cachedAt: string;
} | { status: "miss" | "read_failed" }> {
  try {
    const cached = await cache.findByCacheKey(cacheKey);
    if (!cached) {
      cacheStats.misses += 1;
      return { status: "miss" };
    }

    cacheStats.hits += 1;
    return {
      status: "hit",
      observation: createSliceVisualObservation(
        cached.observation,
        evidenceBundle
      ),
      execution: cached.execution,
      cachedAt: cached.cachedAt
    };
  } catch {
    cacheStats.readFailures += 1;
    cacheStats.misses += 1;
    return { status: "read_failed" };
  }
}

async function writeCachedSlice({
  cache,
  record,
  cacheStats
}: {
  cache: SliceUnderstandingCachePort;
  record: CachedSliceUnderstanding;
  cacheStats: SliceUnderstandingCacheStats;
}): Promise<"miss" | "write_failed"> {
  try {
    await cache.save(record);
    cacheStats.writes += 1;
    return "miss";
  } catch {
    cacheStats.writeFailures += 1;
    return "write_failed";
  }
}

function createSliceCacheContext(
  evidenceBundle: VideoEvidenceBundle,
  slice: TimelineSlice,
  profile: SliceUnderstandingModelProfile
): {
  inputHash: string;
  cacheKey: string;
} {
  const inputHash = hashModelRunInput({
    videoId: evidenceBundle.videoId,
    durationMs: evidenceBundle.durationMs,
    slice: {
      id: slice.id,
      startMs: slice.startMs,
      endMs: slice.endMs,
      frameIds: slice.frameIds,
      transcriptSegmentIds: slice.transcriptSegmentIds,
      ocrEvidenceIds: slice.ocrEvidenceIds,
      samplingReason: slice.samplingReason
    },
    transcriptSegments: evidenceBundle.transcriptSegments
      .filter((segment) => slice.transcriptSegmentIds.includes(segment.id))
      .map(({ id, startMs, endMs, text }) => ({ id, startMs, endMs, text })),
    ocrEvidence: evidenceBundle.ocrEvidence
      .filter((item) => slice.ocrEvidenceIds.includes(item.id))
      .map(({ id, timestampMs, text, confidence }) => ({
        id,
        timestampMs,
        text,
        confidence
      })),
    frameEvidence: evidenceBundle.frameEvidence
      .filter((frame) => slice.frameIds.includes(frame.id))
      .map(({ id, timestampMs }) => ({ id, timestampMs }))
  });

  return {
    inputHash,
    cacheKey: createModelRunCacheKey({
      inputHash,
      model: profile.model,
      promptVersion: profile.promptVersion,
      schemaVersion: profile.schemaVersion
    })
  };
}

function getFrameAssetsForSlice(
  frameAssets: MultimodalFrameAsset[],
  frameIds: string[]
): MultimodalFrameAsset[] {
  const requestedIds = new Set(frameIds);
  return frameAssets.filter((frame) => requestedIds.has(frame.id));
}

function calculateCoverage(
  observations: SliceVisualObservation[],
  durationMs: number
): SliceUnderstandingCoverage {
  const coveredRanges = mergeRanges(
    observations.map(({ startMs, endMs }) => ({ startMs, endMs }))
  );
  const coveredDurationMs = coveredRanges.reduce(
    (total, range) => total + range.endMs - range.startMs,
    0
  );

  return {
    coveredRanges,
    coveredDurationMs,
    coverageRatio: durationMs > 0 ? coveredDurationMs / durationMs : 0
  };
}

function mergeRanges(ranges: EvidenceRange[]): EvidenceRange[] {
  const sorted = ranges
    .map((range) => ({ ...range }))
    .sort((left, right) => left.startMs - right.startMs);
  const merged: EvidenceRange[] = [];

  sorted.forEach((range) => {
    const previous = merged.at(-1);
    if (!previous || range.startMs > previous.endMs) {
      merged.push(range);
      return;
    }
    previous.endMs = Math.max(previous.endMs, range.endMs);
  });

  return merged;
}
