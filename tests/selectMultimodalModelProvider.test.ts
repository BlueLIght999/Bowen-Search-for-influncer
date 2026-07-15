import { describe, expect, it } from "vitest";
import {
  selectMultimodalModelProvider,
  type ModelPolicy,
  type ModelProviderProfile
} from "../src/application/useCases/selectMultimodalModelProvider";

const balancedPolicy: ModelPolicy = {
  mode: "balanced",
  allowCloudUpload: true,
  maxFrames: 64,
  maxVideoSeconds: 90,
  timeoutMs: 30_000,
  maxRetries: 1
};

const directVideoProvider: ModelProviderProfile = {
  id: "cloud_direct_quality",
  provider: "cloud-a",
  model: "direct-video-v1",
  route: "cloud_direct_video",
  requiresCloudUpload: true,
  maxFrames: 120,
  maxVideoSeconds: 180,
  qualityScore: 96,
  estimatedCost: 9
};

const frameTextProvider: ModelProviderProfile = {
  id: "cloud_frame_balanced",
  provider: "cloud-b",
  model: "frame-text-v1",
  route: "cloud_frame_text",
  requiresCloudUpload: true,
  maxFrames: 80,
  maxVideoSeconds: 120,
  qualityScore: 84,
  estimatedCost: 2
};

const localProvider: ModelProviderProfile = {
  id: "local_vlm",
  provider: "local",
  model: "vlm-local-v1",
  route: "local_vision_language",
  requiresCloudUpload: false,
  maxFrames: 48,
  maxVideoSeconds: 60,
  qualityScore: 70,
  estimatedCost: 0
};

describe("selectMultimodalModelProvider", () => {
  it("selects a frame-plus-text provider for balanced mode and applies policy input caps", () => {
    const selection = selectMultimodalModelProvider({
      policy: balancedPolicy,
      requestedInput: {
        frameCount: 100,
        videoSeconds: 140
      },
      candidates: [directVideoProvider, frameTextProvider]
    });

    expect(selection).toMatchObject({
      status: "selected",
      profile: {
        id: "cloud_frame_balanced",
        route: "cloud_frame_text"
      },
      effectiveInput: {
        frameCount: 64,
        videoSeconds: 90
      }
    });
  });

  it("routes to a local provider when cloud upload is disallowed", () => {
    const selection = selectMultimodalModelProvider({
      policy: {
        ...balancedPolicy,
        allowCloudUpload: false,
        mode: "local"
      },
      requestedInput: {
        frameCount: 24,
        videoSeconds: 45
      },
      candidates: [directVideoProvider, frameTextProvider, localProvider]
    });

    expect(selection).toMatchObject({
      status: "selected",
      profile: {
        id: "local_vlm",
        requiresCloudUpload: false,
        route: "local_vision_language"
      }
    });
  });

  it("honors the cost budget before quality ranking", () => {
    const selection = selectMultimodalModelProvider({
      policy: {
        ...balancedPolicy,
        mode: "quality",
        costBudget: 3
      },
      requestedInput: {
        frameCount: 40,
        videoSeconds: 50
      },
      candidates: [directVideoProvider, frameTextProvider]
    });

    expect(selection).toMatchObject({
      status: "selected",
      profile: {
        id: "cloud_frame_balanced"
      }
    });
  });

  it("returns rejected candidate reasons when no provider satisfies policy and capacity", () => {
    const selection = selectMultimodalModelProvider({
      policy: {
        ...balancedPolicy,
        maxFrames: 72,
        maxVideoSeconds: 110,
        costBudget: 1
      },
      requestedInput: {
        frameCount: 72,
        videoSeconds: 110
      },
      candidates: [frameTextProvider, localProvider]
    });

    expect(selection).toEqual({
      status: "unavailable",
      reason: "No multimodal provider satisfies the current model policy.",
      rejectedCandidates: [
        {
          id: "cloud_frame_balanced",
          reasons: ["estimated cost exceeds policy budget"]
        },
        {
          id: "local_vlm",
          reasons: [
            "provider cannot handle the effective frame count",
            "provider cannot handle the effective video duration"
          ]
        }
      ]
    });
  });
});
