export type EvidenceModalityStatus = "available" | "missing" | "failed";

export interface EvidenceModalityAvailability {
  status: EvidenceModalityStatus;
  reason?: string;
}

export interface TranscriptEvidence {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface FrameEvidence {
  id: string;
  timestampMs: number;
}

export interface OcrEvidence {
  id: string;
  frameId: string;
  timestampMs: number;
  text: string;
  confidence: number;
}

export interface TimelineSlice {
  id: string;
  startMs: number;
  endMs: number;
  frameIds: string[];
  transcriptSegmentIds: string[];
  ocrEvidenceIds: string[];
  samplingReason: "opening" | "scene_change" | "interval" | "ending";
}

export interface EvidenceRange {
  startMs: number;
  endMs: number;
}

export interface EvidenceCoverage {
  coveredRanges: EvidenceRange[];
  coveredDurationMs: number;
  coverageRatio: number;
  modalities: {
    transcript: EvidenceModalityAvailability;
    frames: EvidenceModalityAvailability;
    ocr: EvidenceModalityAvailability;
  };
}

export interface VideoEvidenceBundle {
  jobId: string;
  videoId: string;
  durationMs: number;
  modalities: EvidenceCoverage["modalities"];
  transcriptSegments: TranscriptEvidence[];
  frameEvidence: FrameEvidence[];
  ocrEvidence: OcrEvidence[];
  timelineSlices: TimelineSlice[];
  coverage: EvidenceCoverage;
}

export interface CreateVideoEvidenceBundleInput {
  jobId: string;
  videoId: string;
  durationMs: number;
  modalities: EvidenceCoverage["modalities"];
  transcriptSegments: TranscriptEvidence[];
  frameEvidence: FrameEvidence[];
  ocrEvidence: OcrEvidence[];
  timelineSlices: TimelineSlice[];
}

export interface ReasoningEvidenceRef {
  startMs: number;
  endMs: number;
  frameIds: string[];
  transcriptSegmentIds: string[];
  ocrEvidenceIds: string[];
}

export type ReasoningClaimType =
  | "observation"
  | "inference"
  | "recommendation";

export interface ReasoningClaim {
  id: string;
  type: ReasoningClaimType;
  statement: string;
  confidence: number;
  evidenceRefs: ReasoningEvidenceRef[];
  knowledgeIds: string[];
}

export class InvalidMultimodalEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMultimodalEvidenceError";
  }
}

export function createVideoEvidenceBundle(
  input: CreateVideoEvidenceBundleInput
): VideoEvidenceBundle {
  assertRequiredString("Video evidence job id", input.jobId);
  assertRequiredString("Video evidence video id", input.videoId);
  assertPositiveNumber("Video duration", input.durationMs);
  assertModalities(input.modalities);

  const transcriptIds = validateTranscriptEvidence(
    input.transcriptSegments,
    input.durationMs
  );
  const frameIds = validateFrameEvidence(
    input.frameEvidence,
    input.durationMs
  );
  const ocrIds = validateOcrEvidence(
    input.ocrEvidence,
    input.durationMs,
    frameIds
  );

  assertModalityConsistency(input);
  validateTimelineSlices(
    input.timelineSlices,
    input.durationMs,
    transcriptIds,
    frameIds,
    ocrIds
  );

  const coveredRanges = mergeRanges(
    input.timelineSlices.map(({ startMs, endMs }) => ({ startMs, endMs }))
  );
  const coveredDurationMs = coveredRanges.reduce(
    (total, range) => total + range.endMs - range.startMs,
    0
  );
  const modalities = cloneModalities(input.modalities);

  return {
    jobId: input.jobId,
    videoId: input.videoId,
    durationMs: input.durationMs,
    modalities,
    transcriptSegments: input.transcriptSegments.map((item) => ({ ...item })),
    frameEvidence: input.frameEvidence.map((item) => ({ ...item })),
    ocrEvidence: input.ocrEvidence.map((item) => ({ ...item })),
    timelineSlices: input.timelineSlices.map(cloneTimelineSlice),
    coverage: {
      coveredRanges,
      coveredDurationMs,
      coverageRatio: coveredDurationMs / input.durationMs,
      modalities: cloneModalities(modalities)
    }
  };
}

export function createReasoningClaim(
  input: ReasoningClaim,
  bundle: VideoEvidenceBundle
): ReasoningClaim {
  assertRequiredString("Reasoning claim id", input.id);
  assertRequiredString("Reasoning claim statement", input.statement);
  assertConfidence("Reasoning claim confidence", input.confidence);

  if (!Array.isArray(input.evidenceRefs) || !Array.isArray(input.knowledgeIds)) {
    throw new InvalidMultimodalEvidenceError(
      "Reasoning claim evidence and knowledge references must be arrays."
    );
  }

  if (
    (input.type === "observation" || input.type === "inference") &&
    input.evidenceRefs.length === 0
  ) {
    throw new InvalidMultimodalEvidenceError(
      `${capitalize(input.type)} claims require video evidence.`
    );
  }

  if (
    input.type === "recommendation" &&
    input.evidenceRefs.length === 0 &&
    input.knowledgeIds.length === 0
  ) {
    throw new InvalidMultimodalEvidenceError(
      "Recommendation claims require video evidence or retrieved knowledge."
    );
  }

  const knownFrameIds = new Set(bundle.frameEvidence.map(({ id }) => id));
  const knownTranscriptIds = new Set(
    bundle.transcriptSegments.map(({ id }) => id)
  );
  const knownOcrIds = new Set(bundle.ocrEvidence.map(({ id }) => id));

  input.evidenceRefs.forEach((reference) => {
    assertRange(
      reference.startMs,
      reference.endMs,
      "Reasoning evidence range"
    );
    if (reference.endMs > bundle.durationMs) {
      throw new InvalidMultimodalEvidenceError(
        "Reasoning evidence range must be within the video duration."
      );
    }
    assertKnownReferences(
      reference.frameIds,
      knownFrameIds,
      "Reasoning claim references unknown frame evidence"
    );
    assertKnownReferences(
      reference.transcriptSegmentIds,
      knownTranscriptIds,
      "Reasoning claim references unknown transcript evidence"
    );
    assertKnownReferences(
      reference.ocrEvidenceIds,
      knownOcrIds,
      "Reasoning claim references unknown OCR evidence"
    );
  });

  input.knowledgeIds.forEach((knowledgeId) =>
    assertRequiredString("Reasoning claim knowledge id", knowledgeId)
  );

  return {
    ...input,
    evidenceRefs: input.evidenceRefs.map(cloneReasoningEvidenceRef),
    knowledgeIds: [...input.knowledgeIds]
  };
}

function validateTranscriptEvidence(
  evidence: TranscriptEvidence[],
  durationMs: number
): Set<string> {
  assertArray("Transcript evidence", evidence);
  const ids = new Set<string>();

  evidence.forEach((item) => {
    assertUniqueId(ids, item.id, "transcript evidence");
    assertRange(
      item.startMs,
      item.endMs,
      `Transcript evidence range: ${item.id}`
    );
    if (item.endMs > durationMs) {
      throw new InvalidMultimodalEvidenceError(
        `Transcript evidence range must be within the video duration: ${item.id}`
      );
    }
    assertRequiredString("Transcript evidence text", item.text);
  });

  return ids;
}

function validateFrameEvidence(
  evidence: FrameEvidence[],
  durationMs: number
): Set<string> {
  assertArray("Frame evidence", evidence);
  const ids = new Set<string>();

  evidence.forEach((item) => {
    assertUniqueId(ids, item.id, "frame evidence");
    assertNonNegativeNumber(
      `Frame evidence timestamp: ${item.id}`,
      item.timestampMs
    );
    if (item.timestampMs > durationMs) {
      throw new InvalidMultimodalEvidenceError(
        `Frame evidence timestamp must be within the video duration: ${item.id}`
      );
    }
  });

  return ids;
}

function validateOcrEvidence(
  evidence: OcrEvidence[],
  durationMs: number,
  frameIds: Set<string>
): Set<string> {
  assertArray("OCR evidence", evidence);
  const ids = new Set<string>();

  evidence.forEach((item) => {
    assertUniqueId(ids, item.id, "OCR evidence");
    assertRequiredString("OCR evidence frame id", item.frameId);
    if (!frameIds.has(item.frameId)) {
      throw new InvalidMultimodalEvidenceError(
        `OCR evidence references unknown frame evidence: ${item.frameId}`
      );
    }
    assertNonNegativeNumber(
      `OCR evidence timestamp: ${item.id}`,
      item.timestampMs
    );
    if (item.timestampMs > durationMs) {
      throw new InvalidMultimodalEvidenceError(
        `OCR evidence timestamp must be within the video duration: ${item.id}`
      );
    }
    assertRequiredString("OCR evidence text", item.text);
    assertConfidence(`OCR evidence confidence: ${item.id}`, item.confidence);
  });

  return ids;
}

function validateTimelineSlices(
  slices: TimelineSlice[],
  durationMs: number,
  transcriptIds: Set<string>,
  frameIds: Set<string>,
  ocrIds: Set<string>
): void {
  assertArray("Timeline slices", slices);
  const sliceIds = new Set<string>();

  slices.forEach((slice) => {
    assertUniqueId(sliceIds, slice.id, "timeline slice");
    assertRange(
      slice.startMs,
      slice.endMs,
      `Timeline slice range: ${slice.id}`
    );
    if (slice.endMs > durationMs) {
      throw new InvalidMultimodalEvidenceError(
        `Timeline slice range must be within the video duration: ${slice.id}`
      );
    }
    assertKnownReferences(
      slice.frameIds,
      frameIds,
      "Timeline slice references unknown frame evidence"
    );
    assertKnownReferences(
      slice.transcriptSegmentIds,
      transcriptIds,
      "Timeline slice references unknown transcript evidence"
    );
    assertKnownReferences(
      slice.ocrEvidenceIds,
      ocrIds,
      "Timeline slice references unknown OCR evidence"
    );
  });
}

function assertModalities(modalities: EvidenceCoverage["modalities"]): void {
  if (!modalities || typeof modalities !== "object") {
    throw new InvalidMultimodalEvidenceError(
      "Video evidence modalities are required."
    );
  }

  (
    [
      ["transcript", modalities.transcript],
      ["frames", modalities.frames],
      ["ocr", modalities.ocr]
    ] as const
  ).forEach(([name, modality]) => {
    if (
      !modality ||
      !["available", "missing", "failed"].includes(modality.status)
    ) {
      throw new InvalidMultimodalEvidenceError(
        `Invalid evidence modality status: ${name}`
      );
    }
    if (
      modality.status !== "available" &&
      (!modality.reason || modality.reason.trim().length === 0)
    ) {
      throw new InvalidMultimodalEvidenceError(
        `Evidence modality reason is required when ${name} is ${modality.status}.`
      );
    }
  });
}

function assertModalityConsistency(
  input: CreateVideoEvidenceBundleInput
): void {
  if (
    input.modalities.transcript.status !== "available" &&
    input.transcriptSegments.length > 0
  ) {
    throw new InvalidMultimodalEvidenceError(
      `Transcript evidence must be empty when the transcript modality is ${input.modalities.transcript.status}.`
    );
  }
  if (
    input.modalities.frames.status !== "available" &&
    input.frameEvidence.length > 0
  ) {
    throw new InvalidMultimodalEvidenceError(
      `Frame evidence must be empty when the frames modality is ${input.modalities.frames.status}.`
    );
  }
  if (
    input.modalities.ocr.status !== "available" &&
    input.ocrEvidence.length > 0
  ) {
    throw new InvalidMultimodalEvidenceError(
      `OCR evidence must be empty when the ocr modality is ${input.modalities.ocr.status}.`
    );
  }
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

function assertKnownReferences(
  references: string[],
  knownIds: Set<string>,
  message: string
): void {
  assertArray("Evidence references", references);
  references.forEach((reference) => {
    assertRequiredString("Evidence reference", reference);
    if (!knownIds.has(reference)) {
      throw new InvalidMultimodalEvidenceError(`${message}: ${reference}`);
    }
  });
}

function assertUniqueId(
  ids: Set<string>,
  id: string,
  label: string
): void {
  assertRequiredString(`${capitalize(label)} id`, id);
  if (ids.has(id)) {
    throw new InvalidMultimodalEvidenceError(
      `Duplicate ${label} id: ${id}`
    );
  }
  ids.add(id);
}

function assertRange(startMs: number, endMs: number, label: string): void {
  assertNonNegativeNumber(`${label} start`, startMs);
  assertNonNegativeNumber(`${label} end`, endMs);
  if (endMs <= startMs) {
    const idSeparator = label.lastIndexOf(": ");
    const id = idSeparator >= 0 ? label.slice(idSeparator + 2) : "";
    const rangeLabel =
      label.startsWith("Timeline slice")
        ? "Timeline slice range"
        : label;
    throw new InvalidMultimodalEvidenceError(
      `${rangeLabel} must have a positive duration${id ? `: ${id}` : "."}`
    );
  }
}

function assertRequiredString(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidMultimodalEvidenceError(`${label} is required.`);
  }
}

function assertArray(label: string, value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new InvalidMultimodalEvidenceError(`${label} must be an array.`);
  }
}

function assertPositiveNumber(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be a positive finite number.`
    );
  }
}

function assertNonNegativeNumber(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be a non-negative finite number.`
    );
  }
}

function assertConfidence(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be between 0 and 1.`
    );
  }
}

function cloneModalities(
  modalities: EvidenceCoverage["modalities"]
): EvidenceCoverage["modalities"] {
  return {
    transcript: { ...modalities.transcript },
    frames: { ...modalities.frames },
    ocr: { ...modalities.ocr }
  };
}

function cloneTimelineSlice(slice: TimelineSlice): TimelineSlice {
  return {
    ...slice,
    frameIds: [...slice.frameIds],
    transcriptSegmentIds: [...slice.transcriptSegmentIds],
    ocrEvidenceIds: [...slice.ocrEvidenceIds]
  };
}

function cloneReasoningEvidenceRef(
  reference: ReasoningEvidenceRef
): ReasoningEvidenceRef {
  return {
    ...reference,
    frameIds: [...reference.frameIds],
    transcriptSegmentIds: [...reference.transcriptSegmentIds],
    ocrEvidenceIds: [...reference.ocrEvidenceIds]
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
