export type ModelPolicyMode = "quality" | "balanced" | "local";

export type ModelProviderRoute =
  | "cloud_direct_video"
  | "cloud_frame_text"
  | "local_vision_language";

export interface ModelPolicy {
  mode: ModelPolicyMode;
  allowCloudUpload: boolean;
  maxFrames: number;
  maxVideoSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  costBudget?: number;
}

export interface ModelProviderProfile {
  id: string;
  provider: string;
  model: string;
  route: ModelProviderRoute;
  requiresCloudUpload: boolean;
  maxFrames: number;
  maxVideoSeconds: number;
  qualityScore: number;
  estimatedCost: number;
}

export interface RequestedMultimodalInput {
  frameCount: number;
  videoSeconds: number;
}

export interface EffectiveMultimodalInput {
  frameCount: number;
  videoSeconds: number;
}
