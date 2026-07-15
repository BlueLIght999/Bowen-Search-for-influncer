import {
  createReasoningClaim,
  type EvidenceRange,
  InvalidMultimodalEvidenceError,
  type ReasoningClaim,
  type TimelineSlice,
  type VideoEvidenceBundle
} from "./VideoEvidence";

export type SubtitleLegibility =
  | "clear"
  | "partially_blocked"
  | "missing"
  | "not_observed";

export interface ModelExecutionSummary {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  latencyMs: number;
  status: "completed" | "failed";
  partial: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    frameCount?: number;
  };
}

export interface SliceVisualObservation {
  id: string;
  sliceId: string;
  startMs: number;
  endMs: number;
  summary: string;
  visibleSubjects: string[];
  actions: string[];
  shotTypes: string[];
  subtitleLegibility: SubtitleLegibility;
  aiDramaSignals: string[];
  confidence: number;
  claims: ReasoningClaim[];
}

export type MultimodalVideoContentType =
  | "ai_drama"
  | "talking_head"
  | "mixed"
  | "unknown";

export interface MultimodalEvidenceCoverage {
  coveredRanges: EvidenceRange[];
  coveredDurationMs: number;
  coverageRatio: number;
}

export interface MultimodalNarrative {
  premise: ReasoningClaim;
  hook?: ReasoningClaim;
  conflict?: ReasoningClaim;
  escalation?: ReasoningClaim;
  reversal?: ReasoningClaim;
  payoff?: ReasoningClaim;
  ending?: ReasoningClaim;
}

export interface MultimodalVisualCraft {
  composition: ReasoningClaim[];
  shotVariety: ReasoningClaim[];
  continuity: ReasoningClaim[];
  subtitleLegibility: ReasoningClaim[];
  styleConsistency: ReasoningClaim[];
  pacing: ReasoningClaim[];
}

export interface AiDramaUnderstanding {
  conflict: ReasoningClaim[];
  reversals: ReasoningClaim[];
  styleDrift: ReasoningClaim[];
  cliffhanger?: ReasoningClaim;
  seriesPotential?: ReasoningClaim;
}

export interface MultimodalUnderstanding {
  jobId: string;
  videoId: string;
  contentType: MultimodalVideoContentType;
  scenes: SliceVisualObservation[];
  narrative: MultimodalNarrative;
  visualCraft: MultimodalVisualCraft;
  aiDrama?: AiDramaUnderstanding;
  evidenceCoverage: MultimodalEvidenceCoverage;
  execution: ModelExecutionSummary;
}

export function createMultimodalUnderstanding(
  input: MultimodalUnderstanding,
  bundle: VideoEvidenceBundle
): MultimodalUnderstanding {
  if (input.jobId !== bundle.jobId || input.videoId !== bundle.videoId) {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal understanding must reference the same job and video as its evidence bundle."
    );
  }
  if (!isContentType(input.contentType)) {
    throw new InvalidMultimodalEvidenceError(
      `Invalid multimodal content type: ${input.contentType}`
    );
  }
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal understanding requires at least one scene observation."
    );
  }

  const scenes = input.scenes.map((scene) =>
    createSliceVisualObservation(scene, bundle)
  );

  return {
    jobId: input.jobId,
    videoId: input.videoId,
    contentType: input.contentType,
    scenes,
    narrative: validateNarrative(input.narrative, bundle),
    visualCraft: validateVisualCraft(input.visualCraft, bundle),
    aiDrama: input.aiDrama
      ? validateAiDrama(input.aiDrama, bundle)
      : undefined,
    evidenceCoverage: validateCoverage(input.evidenceCoverage, bundle),
    execution: validateExecution(input.execution)
  };
}

export function createSliceVisualObservation(
  input: SliceVisualObservation,
  bundle: VideoEvidenceBundle
): SliceVisualObservation {
  const slice = findSlice(bundle, input.sliceId);

  assertRequiredString("Slice observation id", input.id);
  assertRequiredString("Slice observation summary", input.summary);
  assertConfidence("Slice observation confidence", input.confidence);
  assertStringArray("Visible subjects", input.visibleSubjects);
  assertStringArray("Observed actions", input.actions);
  assertStringArray("Shot types", input.shotTypes);
  assertStringArray("AI drama signals", input.aiDramaSignals);

  if (!isSubtitleLegibility(input.subtitleLegibility)) {
    throw new InvalidMultimodalEvidenceError(
      `Invalid subtitle legibility: ${input.subtitleLegibility}`
    );
  }

  if (input.startMs !== slice.startMs || input.endMs !== slice.endMs) {
    throw new InvalidMultimodalEvidenceError(
      `Slice observation range must match its timeline slice: ${input.sliceId}`
    );
  }

  if (!Array.isArray(input.claims) || input.claims.length === 0) {
    throw new InvalidMultimodalEvidenceError(
      "Slice observations require at least one evidence-backed claim."
    );
  }

  const claims = input.claims.map((claim) => {
    const validated = createReasoningClaim(claim, bundle);
    assertClaimEvidenceIsInsideSlice(validated, slice);
    assertClaimReferencesCoverEvidence(validated, bundle);
    return validated;
  });

  return {
    ...input,
    visibleSubjects: [...input.visibleSubjects],
    actions: [...input.actions],
    shotTypes: [...input.shotTypes],
    aiDramaSignals: [...input.aiDramaSignals],
    claims
  };
}

function validateNarrative(
  narrative: MultimodalNarrative,
  bundle: VideoEvidenceBundle
): MultimodalNarrative {
  if (!narrative || typeof narrative !== "object") {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal narrative is required."
    );
  }

  return {
    premise: validateClaim(narrative.premise, bundle),
    hook: validateOptionalClaim(narrative.hook, bundle),
    conflict: validateOptionalClaim(narrative.conflict, bundle),
    escalation: validateOptionalClaim(narrative.escalation, bundle),
    reversal: validateOptionalClaim(narrative.reversal, bundle),
    payoff: validateOptionalClaim(narrative.payoff, bundle),
    ending: validateOptionalClaim(narrative.ending, bundle)
  };
}

function validateVisualCraft(
  visualCraft: MultimodalVisualCraft,
  bundle: VideoEvidenceBundle
): MultimodalVisualCraft {
  if (!visualCraft || typeof visualCraft !== "object") {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal visual craft is required."
    );
  }

  return {
    composition: validateClaimArray(visualCraft.composition, bundle),
    shotVariety: validateClaimArray(visualCraft.shotVariety, bundle),
    continuity: validateClaimArray(visualCraft.continuity, bundle),
    subtitleLegibility: validateClaimArray(
      visualCraft.subtitleLegibility,
      bundle
    ),
    styleConsistency: validateClaimArray(visualCraft.styleConsistency, bundle),
    pacing: validateClaimArray(visualCraft.pacing, bundle)
  };
}

function validateAiDrama(
  aiDrama: AiDramaUnderstanding,
  bundle: VideoEvidenceBundle
): AiDramaUnderstanding {
  return {
    conflict: validateClaimArray(aiDrama.conflict, bundle),
    reversals: validateClaimArray(aiDrama.reversals, bundle),
    styleDrift: validateClaimArray(aiDrama.styleDrift, bundle),
    cliffhanger: validateOptionalClaim(aiDrama.cliffhanger, bundle),
    seriesPotential: validateOptionalClaim(aiDrama.seriesPotential, bundle)
  };
}

function validateClaimArray(
  claims: ReasoningClaim[],
  bundle: VideoEvidenceBundle
): ReasoningClaim[] {
  if (!Array.isArray(claims)) {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal reasoning claim groups must be arrays."
    );
  }
  return claims.map((claim) => validateClaim(claim, bundle));
}

function validateOptionalClaim(
  claim: ReasoningClaim | undefined,
  bundle: VideoEvidenceBundle
): ReasoningClaim | undefined {
  return claim ? validateClaim(claim, bundle) : undefined;
}

function validateClaim(
  claim: ReasoningClaim,
  bundle: VideoEvidenceBundle
): ReasoningClaim {
  const validated = createReasoningClaim(claim, bundle);
  assertClaimReferencesCoverEvidence(validated, bundle);
  return validated;
}

function validateCoverage(
  coverage: MultimodalEvidenceCoverage,
  bundle: VideoEvidenceBundle
): MultimodalEvidenceCoverage {
  if (!coverage || typeof coverage !== "object") {
    throw new InvalidMultimodalEvidenceError(
      "Multimodal evidence coverage is required."
    );
  }
  assertNonNegativeNumber("Covered duration", coverage.coveredDurationMs);
  assertConfidence("Coverage ratio", coverage.coverageRatio);
  if (coverage.coveredDurationMs > bundle.durationMs) {
    throw new InvalidMultimodalEvidenceError(
      "Covered duration cannot exceed the video duration."
    );
  }
  if (!Array.isArray(coverage.coveredRanges)) {
    throw new InvalidMultimodalEvidenceError(
      "Covered ranges must be an array."
    );
  }
  coverage.coveredRanges.forEach((range) => {
    assertNonNegativeNumber("Covered range start", range.startMs);
    assertNonNegativeNumber("Covered range end", range.endMs);
    if (range.endMs <= range.startMs || range.endMs > bundle.durationMs) {
      throw new InvalidMultimodalEvidenceError(
        "Covered ranges must be positive and inside the video duration."
      );
    }
  });

  return {
    coveredRanges: coverage.coveredRanges.map((range) => ({ ...range })),
    coveredDurationMs: coverage.coveredDurationMs,
    coverageRatio: coverage.coverageRatio
  };
}

function validateExecution(
  execution: ModelExecutionSummary
): ModelExecutionSummary {
  if (!execution || typeof execution !== "object") {
    throw new InvalidMultimodalEvidenceError(
      "Model execution summary is required."
    );
  }
  assertRequiredString("Model provider", execution.provider);
  assertRequiredString("Model name", execution.model);
  assertRequiredString("Prompt version", execution.promptVersion);
  assertRequiredString("Schema version", execution.schemaVersion);
  assertNonNegativeNumber("Model latency", execution.latencyMs);
  if (!["completed", "failed"].includes(execution.status)) {
    throw new InvalidMultimodalEvidenceError(
      `Invalid model execution status: ${execution.status}`
    );
  }
  if (execution.usage !== undefined) {
    validateUsage(execution.usage);
  }

  return { ...execution };
}

function validateUsage(usage: ModelExecutionSummary["usage"]): void {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    throw new InvalidMultimodalEvidenceError(
      "Model usage must be an object."
    );
  }
  validateOptionalUsageCount("Input tokens", usage.inputTokens);
  validateOptionalUsageCount("Output tokens", usage.outputTokens);
  validateOptionalUsageCount("Image count", usage.imageCount);
  validateOptionalUsageCount("Frame count", usage.frameCount);
}

function validateOptionalUsageCount(label: string, value: unknown): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || Number(value) < 0)
  ) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be a non-negative integer.`
    );
  }
}

function findSlice(
  bundle: VideoEvidenceBundle,
  sliceId: string
): TimelineSlice {
  assertRequiredString("Slice observation slice id", sliceId);
  const slice = bundle.timelineSlices.find((item) => item.id === sliceId);
  if (!slice) {
    throw new InvalidMultimodalEvidenceError(
      `Slice observation references unknown timeline slice: ${sliceId}`
    );
  }
  return slice;
}

function assertClaimEvidenceIsInsideSlice(
  claim: ReasoningClaim,
  slice: TimelineSlice
): void {
  claim.evidenceRefs.forEach((reference) => {
    if (reference.startMs < slice.startMs || reference.endMs > slice.endMs) {
      throw new InvalidMultimodalEvidenceError(
        `Reasoning claim evidence must stay inside timeline slice: ${claim.id}`
      );
    }
  });
}

function assertClaimReferencesCoverEvidence(
  claim: ReasoningClaim,
  bundle: VideoEvidenceBundle
): void {
  const frames = new Map(bundle.frameEvidence.map((item) => [item.id, item]));
  const transcripts = new Map(
    bundle.transcriptSegments.map((item) => [item.id, item])
  );
  const ocr = new Map(bundle.ocrEvidence.map((item) => [item.id, item]));

  claim.evidenceRefs.forEach((reference) => {
    reference.frameIds.forEach((frameId) => {
      const frame = frames.get(frameId);
      if (
        frame &&
        (frame.timestampMs < reference.startMs ||
          frame.timestampMs > reference.endMs)
      ) {
        throw new InvalidMultimodalEvidenceError(
          `Reasoning claim frame evidence is outside its reference range: ${frameId}`
        );
      }
    });

    reference.transcriptSegmentIds.forEach((segmentId) => {
      const segment = transcripts.get(segmentId);
      if (
        segment &&
        (segment.endMs <= reference.startMs ||
          segment.startMs >= reference.endMs)
      ) {
        throw new InvalidMultimodalEvidenceError(
          `Reasoning claim transcript evidence is outside its reference range: ${segmentId}`
        );
      }
    });

    reference.ocrEvidenceIds.forEach((ocrId) => {
      const item = ocr.get(ocrId);
      if (
        item &&
        (item.timestampMs < reference.startMs ||
          item.timestampMs > reference.endMs)
      ) {
        throw new InvalidMultimodalEvidenceError(
          `Reasoning claim OCR evidence is outside its reference range: ${ocrId}`
        );
      }
    });
  });
}

function assertRequiredString(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidMultimodalEvidenceError(`${label} is required.`);
  }
}

function assertStringArray(label: string, value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be a string array.`
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

function assertNonNegativeNumber(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidMultimodalEvidenceError(
      `${label} must be a non-negative finite number.`
    );
  }
}

function isContentType(value: string): value is MultimodalVideoContentType {
  return ["ai_drama", "talking_head", "mixed", "unknown"].includes(value);
}

function isSubtitleLegibility(value: string): value is SubtitleLegibility {
  return [
    "clear",
    "partially_blocked",
    "missing",
    "not_observed"
  ].includes(value);
}
