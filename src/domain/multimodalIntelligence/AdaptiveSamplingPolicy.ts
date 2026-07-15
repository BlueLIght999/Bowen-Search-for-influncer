export interface AdaptiveSamplingPoint {
  timestampSeconds: number;
  reason: "opening" | "scene_change" | "interval" | "ending";
}

export interface AdaptiveSamplingPlanInput {
  durationSeconds: number;
  sceneBoundariesSeconds?: number[];
  maxFrames?: number;
}

interface SamplingCandidate extends AdaptiveSamplingPoint {
  priority: number;
}

const DENSE_INTERVAL_SECONDS = 0.5;
const MIDDLE_INTERVAL_SECONDS = 4;
const DENSE_REGION_SECONDS = 5;
const SCENE_OFFSET_SECONDS = 0.25;
const FINAL_FRAME_OFFSET_SECONDS = 0.05;
const DEFAULT_MAX_FRAMES = 80;

export function createAdaptiveSamplingPlan({
  durationSeconds,
  sceneBoundariesSeconds = [],
  maxFrames = DEFAULT_MAX_FRAMES
}: AdaptiveSamplingPlanInput): AdaptiveSamplingPoint[] {
  assertPositiveFinite("Video duration", durationSeconds);
  assertPositiveInteger("Maximum frame count", maxFrames);
  sceneBoundariesSeconds.forEach((boundary) => {
    if (
      !Number.isFinite(boundary) ||
      boundary < 0 ||
      boundary > durationSeconds
    ) {
      throw new Error(
        `Scene boundary must be within the video duration: ${boundary}`
      );
    }
  });

  const candidates: SamplingCandidate[] = [];
  addDenseRegion(candidates, 0, Math.min(DENSE_REGION_SECONDS, durationSeconds), "opening");
  addMiddleRegion(candidates, durationSeconds);
  addSceneBoundaries(candidates, durationSeconds, sceneBoundariesSeconds);
  addDenseRegion(
    candidates,
    Math.max(0, durationSeconds - DENSE_REGION_SECONDS),
    durationSeconds,
    "ending"
  );
  candidates.push({
    timestampSeconds: normalizeTimestamp(
      Math.max(0, durationSeconds - FINAL_FRAME_OFFSET_SECONDS)
    ),
    reason: "ending",
    priority: 0
  });

  const deduplicated = deduplicateCandidates(candidates);
  const selected =
    deduplicated.length <= maxFrames
      ? deduplicated
      : selectByPriority(deduplicated, maxFrames);

  return selected
    .sort((left, right) => left.timestampSeconds - right.timestampSeconds)
    .map(({ timestampSeconds, reason }) => ({ timestampSeconds, reason }));
}

function addDenseRegion(
  candidates: SamplingCandidate[],
  startSeconds: number,
  endSeconds: number,
  reason: "opening" | "ending"
): void {
  for (
    let timestamp = startSeconds;
    timestamp < endSeconds;
    timestamp += DENSE_INTERVAL_SECONDS
  ) {
    candidates.push({
      timestampSeconds: normalizeTimestamp(timestamp),
      reason,
      priority: 0
    });
  }
}

function addMiddleRegion(
  candidates: SamplingCandidate[],
  durationSeconds: number
): void {
  const startSeconds = Math.min(DENSE_REGION_SECONDS, durationSeconds);
  const endSeconds = Math.max(startSeconds, durationSeconds - DENSE_REGION_SECONDS);

  for (
    let timestamp = startSeconds;
    timestamp < endSeconds;
    timestamp += MIDDLE_INTERVAL_SECONDS
  ) {
    candidates.push({
      timestampSeconds: normalizeTimestamp(timestamp),
      reason: "interval",
      priority: 2
    });
  }
}

function addSceneBoundaries(
  candidates: SamplingCandidate[],
  durationSeconds: number,
  boundaries: number[]
): void {
  boundaries.forEach((boundary) => {
    [
      boundary - SCENE_OFFSET_SECONDS,
      boundary,
      boundary + SCENE_OFFSET_SECONDS
    ].forEach((timestamp) => {
      candidates.push({
        timestampSeconds: normalizeTimestamp(
          Math.min(
            Math.max(0, timestamp),
            Math.max(0, durationSeconds - FINAL_FRAME_OFFSET_SECONDS)
          )
        ),
        reason: "scene_change",
        priority: 1
      });
    });
  });
}

function deduplicateCandidates(
  candidates: SamplingCandidate[]
): SamplingCandidate[] {
  const byTimestamp = new Map<number, SamplingCandidate>();

  candidates.forEach((candidate) => {
    const existing = byTimestamp.get(candidate.timestampSeconds);
    if (!existing || candidate.priority < existing.priority) {
      byTimestamp.set(candidate.timestampSeconds, candidate);
    }
  });

  return [...byTimestamp.values()];
}

function selectByPriority(
  candidates: SamplingCandidate[],
  maxFrames: number
): SamplingCandidate[] {
  const selected: SamplingCandidate[] = [];

  for (const priority of [0, 1, 2]) {
    const remaining = maxFrames - selected.length;
    if (remaining <= 0) {
      break;
    }
    const group = candidates
      .filter((candidate) => candidate.priority === priority)
      .sort((left, right) => left.timestampSeconds - right.timestampSeconds);
    selected.push(
      ...(group.length <= remaining
        ? group
        : selectEvenlyDistributed(group, remaining))
    );
  }

  return selected;
}

function selectEvenlyDistributed<T>(items: T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [items[0]];
  }

  const selectedIndexes = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    selectedIndexes.add(
      Math.round((index * (items.length - 1)) / (count - 1))
    );
  }
  return [...selectedIndexes].map((index) => items[index]);
}

function normalizeTimestamp(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertPositiveFinite(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}
