import type {
  MultimodalEvidenceCoverage,
  MultimodalUnderstanding,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import type { ModelProviderProfile } from "../modelProviderPolicy";
import type { VideoEvidenceBundle } from "../../domain/multimodalIntelligence/VideoEvidence";

export interface ContentReasoningRequest {
  jobId: string;
  videoId: string;
  evidenceBundle: VideoEvidenceBundle;
  sliceObservations: SliceVisualObservation[];
  coverage: MultimodalEvidenceCoverage;
}

export type ContentReasoningResult =
  | {
      status: "completed";
      understanding: MultimodalUnderstanding;
    }
  | {
      status: "failed";
      reason: string;
      retryable?: boolean;
    };

export interface ContentReasoningPort {
  getModelProviderProfile?(): ModelProviderProfile;

  reason(request: ContentReasoningRequest): Promise<ContentReasoningResult>;
}
