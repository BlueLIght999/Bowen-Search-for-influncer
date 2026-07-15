import type {
  ContentReasoningPort,
  ContentReasoningResult
} from "../ports/ContentReasoningPort";
import type {
  MultimodalEvidenceCoverage,
  MultimodalUnderstanding,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import { createMultimodalUnderstanding } from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import {
  InvalidMultimodalEvidenceError,
  type VideoEvidenceBundle
} from "../../domain/multimodalIntelligence/VideoEvidence";

export type VideoReasoningFailureCode =
  | "ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT"
  | "SOURCE_VIDEO_REASONING_UNAVAILABLE"
  | "ANALYSIS_MULTIMODAL_OUTPUT_INVALID";

export interface ReasonAboutVideoInput {
  evidenceBundle: VideoEvidenceBundle;
  sliceObservations: SliceVisualObservation[];
  coverage: MultimodalEvidenceCoverage;
  reasoner: ContentReasoningPort;
}

export type ReasonAboutVideoResult =
  | {
      status: "completed";
      understanding: MultimodalUnderstanding;
    }
  | {
      status: "failed";
      code: VideoReasoningFailureCode;
      reason: string;
      retryable?: boolean;
    };

export async function reasonAboutVideo({
  evidenceBundle,
  sliceObservations,
  coverage,
  reasoner
}: ReasonAboutVideoInput): Promise<ReasonAboutVideoResult> {
  if (sliceObservations.length === 0) {
    return {
      status: "failed",
      code: "ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT",
      reason:
        "Video reasoning requires at least one validated slice observation."
    };
  }

  let result: ContentReasoningResult;
  try {
    result = await reasoner.reason({
      jobId: evidenceBundle.jobId,
      videoId: evidenceBundle.videoId,
      evidenceBundle,
      sliceObservations,
      coverage
    });
  } catch (error) {
    return {
      status: "failed",
      code: "SOURCE_VIDEO_REASONING_UNAVAILABLE",
      reason:
        error instanceof Error
          ? error.message
          : "Video reasoning model failed."
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      code: "SOURCE_VIDEO_REASONING_UNAVAILABLE",
      reason: result.reason,
      retryable: result.retryable
    };
  }

  try {
    return {
      status: "completed",
      understanding: createMultimodalUnderstanding(
        result.understanding,
        evidenceBundle
      )
    };
  } catch (error) {
    return {
      status: "failed",
      code:
        error instanceof InvalidMultimodalEvidenceError
          ? "ANALYSIS_MULTIMODAL_OUTPUT_INVALID"
          : "SOURCE_VIDEO_REASONING_UNAVAILABLE",
      reason:
        error instanceof Error
          ? error.message
          : "Video reasoning output validation failed."
    };
  }
}
