import type {
  ModelExecutionSummary,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";

export interface SliceUnderstandingModelProfile {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface CachedSliceUnderstanding {
  cacheKey: string;
  inputHash: string;
  observation: SliceVisualObservation;
  execution: ModelExecutionSummary;
  cachedAt: string;
}

export interface SliceUnderstandingCachePort {
  findByCacheKey(cacheKey: string): Promise<CachedSliceUnderstanding | null>;
  save(record: CachedSliceUnderstanding): Promise<void>;
}
