import type { AnalysisJobStatus } from "../types";

export type AnalysisWorkflowVersion = 1 | 2;

export interface JobStatusHistoryEntry {
  status: AnalysisJobStatus;
  occurredAt: string;
}

export interface AnalysisJobFailure {
  stage: Exclude<AnalysisJobStatus, "completed" | "failed">;
  code: string;
  message: string;
  occurredAt: string;
}

export interface VideoAnalysisJobSnapshot {
  id: string;
  videoId: string;
  workflowVersion?: AnalysisWorkflowVersion;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  history: JobStatusHistoryEntry[];
  failure?: AnalysisJobFailure;
}

interface CreateVideoAnalysisJobInput {
  id: string;
  videoId: string;
  createdAt: string;
}

interface FailVideoAnalysisJobInput {
  code: string;
  message: string;
}

const JOB_FLOW_V1: AnalysisJobStatus[] = [
  "uploaded",
  "extracting_audio",
  "transcribing",
  "sampling_frames",
  "retrieving_knowledge",
  "evaluating",
  "completed"
];

const JOB_FLOW_V2: AnalysisJobStatus[] = [
  "uploaded",
  "extracting_audio",
  "transcribing",
  "sampling_frames",
  "visually_understanding",
  "reasoning",
  "retrieving_knowledge",
  "evaluating",
  "completed"
];

const JOB_STATUSES = new Set<AnalysisJobStatus>([
  ...JOB_FLOW_V1,
  ...JOB_FLOW_V2,
  "failed"
]);

export class InvalidJobTransitionError extends Error {
  constructor(from: AnalysisJobStatus, to: AnalysisJobStatus) {
    super(`Invalid video analysis job transition: ${from} -> ${to}`);
    this.name = "InvalidJobTransitionError";
  }
}

export class InvalidJobSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobSnapshotError";
  }
}

export class VideoAnalysisJobAggregate {
  private constructor(private snapshot: VideoAnalysisJobSnapshot) {}

  static create(input: CreateVideoAnalysisJobInput): VideoAnalysisJobAggregate {
    assertRequiredString("id", input.id);
    assertRequiredString("videoId", input.videoId);
    assertValidIsoTimestamp("createdAt", input.createdAt);
    return new VideoAnalysisJobAggregate({
      id: input.id,
      videoId: input.videoId,
      workflowVersion: 2,
      status: "uploaded",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      history: [
        {
          status: "uploaded",
          occurredAt: input.createdAt
        }
      ]
    });
  }

  static restore(snapshot: VideoAnalysisJobSnapshot): VideoAnalysisJobAggregate {
    assertValidVideoAnalysisJobSnapshot(snapshot);
    return new VideoAnalysisJobAggregate(cloneSnapshot(snapshot));
  }

  advance(status: AnalysisJobStatus, occurredAt: string): void {
    assertValidIsoTimestamp("transition timestamp", occurredAt);
    assertTimestampNotBeforeCurrentUpdatedAt(this.snapshot.updatedAt, occurredAt);
    const flow = getJobFlow(this.snapshot.workflowVersion);
    const currentIndex = flow.indexOf(this.snapshot.status);
    const nextIndex = flow.indexOf(status);

    if (currentIndex < 0 || nextIndex !== currentIndex + 1) {
      throw new InvalidJobTransitionError(this.snapshot.status, status);
    }

    this.snapshot = {
      ...this.snapshot,
      status,
      updatedAt: occurredAt,
      history: [
        ...this.snapshot.history,
        {
          status,
          occurredAt
        }
      ]
    };
  }

  fail(input: FailVideoAnalysisJobInput, occurredAt: string): void {
    assertValidIsoTimestamp("transition timestamp", occurredAt);
    assertTimestampNotBeforeCurrentUpdatedAt(this.snapshot.updatedAt, occurredAt);
    if (
      this.snapshot.status === "completed" ||
      this.snapshot.status === "failed"
    ) {
      throw new InvalidJobTransitionError(this.snapshot.status, "failed");
    }

    const stage = this.snapshot.status;
    this.snapshot = {
      ...this.snapshot,
      status: "failed",
      updatedAt: occurredAt,
      failure: {
        stage,
        code: input.code,
        message: input.message,
        occurredAt
      },
      history: [
        ...this.snapshot.history,
        {
          status: "failed",
          occurredAt
        }
      ]
    };
  }

  toSnapshot(): VideoAnalysisJobSnapshot {
    return cloneSnapshot(this.snapshot);
  }
}

export function assertValidVideoAnalysisJobSnapshot(snapshot: VideoAnalysisJobSnapshot): void {
  assertRequiredString("id", snapshot.id);
  assertRequiredString("videoId", snapshot.videoId);
  assertWorkflowVersion(snapshot.workflowVersion);
  assertKnownStatus("status", snapshot.status);
  assertValidIsoTimestamp("createdAt", snapshot.createdAt);
  assertValidIsoTimestamp("updatedAt", snapshot.updatedAt);

  if (!Array.isArray(snapshot.history) || snapshot.history.length === 0) {
    throw new InvalidJobSnapshotError("Job snapshot history must not be empty.");
  }

  const firstStatus = snapshot.history[0]?.status;
  assertKnownStatus("history status", firstStatus);
  if (firstStatus !== "uploaded") {
    throw new InvalidJobSnapshotError("Job snapshot history must start at uploaded.");
  }
  if (snapshot.createdAt !== snapshot.history[0].occurredAt) {
    throw new InvalidJobSnapshotError("Job snapshot createdAt must match the first history timestamp.");
  }

  for (let index = 0; index < snapshot.history.length; index += 1) {
    const entry = snapshot.history[index];
    assertKnownStatus("history status", entry.status);
    assertValidIsoTimestamp("history timestamp", entry.occurredAt);

    if (index > 0) {
      const previous = snapshot.history[index - 1];
      assertValidHistoricalTransition(
        previous.status,
        entry.status,
        snapshot.workflowVersion
      );
      if (toTimestampMs(entry.occurredAt) < toTimestampMs(previous.occurredAt)) {
        throw new InvalidJobSnapshotError("Job snapshot history timestamps must not move backwards.");
      }
    }
  }

  const latestStatus = snapshot.history[snapshot.history.length - 1].status;
  const latestOccurredAt = snapshot.history[snapshot.history.length - 1].occurredAt;
  if (snapshot.status !== latestStatus) {
    throw new InvalidJobSnapshotError("Job snapshot status must match the latest history status.");
  }
  if (snapshot.updatedAt !== latestOccurredAt) {
    throw new InvalidJobSnapshotError("Job snapshot updatedAt must match the latest history timestamp.");
  }

  if (snapshot.status === "failed") {
    if (!snapshot.failure) {
      throw new InvalidJobSnapshotError("Failed job snapshot must include failure details.");
    }
    if (!isFailureStage(snapshot.failure.stage, snapshot.workflowVersion)) {
      throw new InvalidJobSnapshotError(
        `Invalid video analysis job snapshot failure stage: ${String(snapshot.failure.stage)}`
      );
    }
    assertRequiredString("failure code", snapshot.failure.code);
    assertRequiredString("failure message", snapshot.failure.message);
    assertValidIsoTimestamp("failure occurredAt", snapshot.failure.occurredAt);
    const activeEntry = [...snapshot.history].reverse().find((entry) => entry.status !== "failed");
    if (!activeEntry || snapshot.failure.stage !== activeEntry.status) {
      throw new InvalidJobSnapshotError("Failure stage must match the last active history status.");
    }
    if (snapshot.failure.occurredAt !== latestOccurredAt) {
      throw new InvalidJobSnapshotError("Failure occurredAt must match the failed history timestamp.");
    }
  } else if (snapshot.failure) {
    throw new InvalidJobSnapshotError("Only failed job snapshots can include failure details.");
  }
}

function cloneSnapshot(snapshot: VideoAnalysisJobSnapshot): VideoAnalysisJobSnapshot {
  return {
    ...snapshot,
    history: snapshot.history.map((entry) => ({ ...entry })),
    failure: snapshot.failure ? { ...snapshot.failure } : undefined
  };
}

function assertKnownStatus(label: string, status: unknown): asserts status is AnalysisJobStatus {
  if (typeof status !== "string" || !JOB_STATUSES.has(status as AnalysisJobStatus)) {
    throw new InvalidJobSnapshotError(
      `Invalid video analysis job snapshot ${label}: ${String(status)}`
    );
  }
}

function assertWorkflowVersion(
  workflowVersion: unknown
): asserts workflowVersion is AnalysisWorkflowVersion | undefined {
  if (
    workflowVersion !== undefined &&
    workflowVersion !== 1 &&
    workflowVersion !== 2
  ) {
    throw new InvalidJobSnapshotError(
      `Invalid video analysis job workflow version: ${String(workflowVersion)}`
    );
  }
}

function assertRequiredString(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidJobSnapshotError(`Job snapshot ${label} is required.`);
  }
}

function assertValidIsoTimestamp(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new InvalidJobSnapshotError(`Job snapshot ${label} must be a valid ISO date string.`);
  }
}

function assertTimestampNotBeforeCurrentUpdatedAt(currentUpdatedAt: string, occurredAt: string): void {
  if (toTimestampMs(occurredAt) < toTimestampMs(currentUpdatedAt)) {
    throw new InvalidJobSnapshotError("Job transition timestamp must not be before the current updatedAt.");
  }
}

function toTimestampMs(value: string): number {
  return new Date(value).getTime();
}

function assertValidHistoricalTransition(
  from: AnalysisJobStatus,
  to: AnalysisJobStatus,
  workflowVersion: AnalysisWorkflowVersion | undefined
): void {
  if (to === "failed") {
    if (from === "completed" || from === "failed") {
      throw new InvalidJobSnapshotError(`Invalid video analysis job history transition: ${from} -> ${to}`);
    }
    return;
  }

  const flow = getJobFlow(workflowVersion);
  const fromIndex = flow.indexOf(from);
  const toIndex = flow.indexOf(to);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) {
    throw new InvalidJobSnapshotError(`Invalid video analysis job history transition: ${from} -> ${to}`);
  }
}

function getJobFlow(
  workflowVersion: AnalysisWorkflowVersion | undefined
): AnalysisJobStatus[] {
  return workflowVersion === 2 ? JOB_FLOW_V2 : JOB_FLOW_V1;
}

function isFailureStage(
  status: AnalysisJobStatus,
  workflowVersion: AnalysisWorkflowVersion | undefined
): status is Exclude<AnalysisJobStatus, "completed" | "failed"> {
  return getJobFlow(workflowVersion).some(
    (stage) => stage === status && stage !== "completed"
  );
}
