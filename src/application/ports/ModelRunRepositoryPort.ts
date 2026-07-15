import type {
  ModelPolicyMode,
  ModelProviderRoute
} from "../modelProviderPolicy";

export type ModelRunStage =
  | "visually_understanding"
  | "reasoning"
  | "evaluation";

export type ModelRunCacheStatus =
  | "hit"
  | "miss"
  | "read_failed"
  | "write_failed";

export interface ModelRunCacheMetadata {
  status: ModelRunCacheStatus;
  savedModelCall: boolean;
  readFailed?: boolean;
  writeFailed?: boolean;
  cachedAt?: string;
}

export interface ModelRunSelectionMetadata {
  policyMode: ModelPolicyMode;
  providerProfileId: string;
  route: ModelProviderRoute;
  effectiveFrameCount: number;
  effectiveVideoSeconds: number;
  estimatedCost: number;
  costBudget?: number;
  allowCloudUpload: boolean;
  requiresCloudUpload?: boolean;
  reason: string;
}

export interface ModelRunRecord {
  id: string;
  traceId: string;
  jobId: string;
  stage: ModelRunStage;
  sliceId?: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  cacheKey: string;
  startedAt: string;
  latencyMs: number;
  retryCount: number;
  status: "completed" | "failed";
  partial: boolean;
  cache?: ModelRunCacheMetadata;
  selection?: ModelRunSelectionMetadata;
  fallbackReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    frameCount?: number;
  };
}

export interface ModelRunRepositoryPort {
  save(run: ModelRunRecord): Promise<void>;
  findByJobId(jobId: string): Promise<ModelRunRecord[]>;
}
