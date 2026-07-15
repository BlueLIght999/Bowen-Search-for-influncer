import type {
  ModelExecutionSummary,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import type { SliceUnderstandingModelProfile } from "./SliceUnderstandingCachePort";
import type { ModelProviderProfile } from "../modelProviderPolicy";
import type {
  TimelineSlice,
  VideoEvidenceBundle
} from "../../domain/multimodalIntelligence/VideoEvidence";

export interface MultimodalFrameAsset {
  id: string;
  frameIndex: number;
  timestampMs: number;
  path: string;
}

export interface MultimodalSliceUnderstandingRequest {
  jobId: string;
  videoId: string;
  evidenceBundle: VideoEvidenceBundle;
  slice: TimelineSlice;
  frameAssets: MultimodalFrameAsset[];
}

export type MultimodalSliceUnderstandingResult =
  | {
      status: "completed";
      observation: SliceVisualObservation;
      execution: ModelExecutionSummary;
    }
  | {
      status: "failed";
      reason: string;
      retryable?: boolean;
      execution?: ModelExecutionSummary;
    };

export interface MultimodalUnderstandingPort {
  getSliceModelProfile?(): SliceUnderstandingModelProfile;
  getModelProviderProfile?(): ModelProviderProfile;

  understandSlice(
    request: MultimodalSliceUnderstandingRequest
  ): Promise<MultimodalSliceUnderstandingResult>;
}
