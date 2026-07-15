import type {
  EffectiveMultimodalInput,
  ModelPolicy,
  ModelPolicyMode,
  ModelProviderProfile,
  ModelProviderRoute,
  RequestedMultimodalInput
} from "../modelProviderPolicy";

export type {
  EffectiveMultimodalInput,
  ModelPolicy,
  ModelPolicyMode,
  ModelProviderProfile,
  ModelProviderRoute,
  RequestedMultimodalInput
} from "../modelProviderPolicy";

export type MultimodalModelProviderSelection =
  | {
      status: "selected";
      profile: ModelProviderProfile;
      effectiveInput: EffectiveMultimodalInput;
      reason: string;
    }
  | {
      status: "unavailable";
      reason: string;
      rejectedCandidates: Array<{
        id: string;
        reasons: string[];
      }>;
    };

export function selectMultimodalModelProvider({
  policy,
  requestedInput,
  candidates
}: {
  policy: ModelPolicy;
  requestedInput: RequestedMultimodalInput;
  candidates: ModelProviderProfile[];
}): MultimodalModelProviderSelection {
  validatePolicy(policy);
  validateRequestedInput(requestedInput);

  const effectiveInput = {
    frameCount: Math.min(requestedInput.frameCount, policy.maxFrames),
    videoSeconds: Math.min(
      requestedInput.videoSeconds,
      policy.maxVideoSeconds
    )
  };
  const evaluated = candidates.map((candidate) => ({
    candidate,
    reasons: getRejectionReasons(candidate, policy, effectiveInput)
  }));
  const eligible = evaluated
    .filter(({ reasons }) => reasons.length === 0)
    .map(({ candidate }) => candidate)
    .sort((left, right) => compareProfiles(left, right, policy.mode));

  const [selected] = eligible;
  if (selected) {
    return {
      status: "selected",
      profile: selected,
      effectiveInput,
      reason: createSelectionReason(selected, policy)
    };
  }

  return {
    status: "unavailable",
    reason: "No multimodal provider satisfies the current model policy.",
    rejectedCandidates: evaluated.map(({ candidate, reasons }) => ({
      id: candidate.id,
      reasons
    }))
  };
}

function getRejectionReasons(
  candidate: ModelProviderProfile,
  policy: ModelPolicy,
  effectiveInput: EffectiveMultimodalInput
): string[] {
  const reasons: string[] = [];

  if (policy.mode === "local" && candidate.route !== "local_vision_language") {
    reasons.push("local mode requires a local provider");
  }

  if (!policy.allowCloudUpload && candidate.requiresCloudUpload) {
    reasons.push("cloud upload is not allowed by policy");
  }

  if (candidate.maxFrames < effectiveInput.frameCount) {
    reasons.push("provider cannot handle the effective frame count");
  }

  if (candidate.maxVideoSeconds < effectiveInput.videoSeconds) {
    reasons.push("provider cannot handle the effective video duration");
  }

  if (
    policy.costBudget !== undefined &&
    candidate.estimatedCost > policy.costBudget
  ) {
    reasons.push("estimated cost exceeds policy budget");
  }

  return reasons;
}

function compareProfiles(
  left: ModelProviderProfile,
  right: ModelProviderProfile,
  mode: ModelPolicyMode
): number {
  if (mode === "balanced") {
    return compareBalanced(left, right);
  }

  if (mode === "local") {
    return compareByQualityThenCost(left, right);
  }

  return compareQuality(left, right);
}

function compareBalanced(
  left: ModelProviderProfile,
  right: ModelProviderProfile
): number {
  const routePriority =
    getRoutePriority(right.route, "balanced") -
    getRoutePriority(left.route, "balanced");
  if (routePriority !== 0) {
    return routePriority;
  }

  const costPriority = left.estimatedCost - right.estimatedCost;
  if (costPriority !== 0) {
    return costPriority;
  }

  return compareByQualityThenId(left, right);
}

function compareQuality(
  left: ModelProviderProfile,
  right: ModelProviderProfile
): number {
  const qualityPriority = right.qualityScore - left.qualityScore;
  if (qualityPriority !== 0) {
    return qualityPriority;
  }

  const routePriority =
    getRoutePriority(right.route, "quality") -
    getRoutePriority(left.route, "quality");
  if (routePriority !== 0) {
    return routePriority;
  }

  return compareByCostThenId(left, right);
}

function compareByQualityThenCost(
  left: ModelProviderProfile,
  right: ModelProviderProfile
): number {
  const qualityPriority = right.qualityScore - left.qualityScore;
  if (qualityPriority !== 0) {
    return qualityPriority;
  }

  return compareByCostThenId(left, right);
}

function compareByQualityThenId(
  left: ModelProviderProfile,
  right: ModelProviderProfile
): number {
  const qualityPriority = right.qualityScore - left.qualityScore;
  if (qualityPriority !== 0) {
    return qualityPriority;
  }

  return left.id.localeCompare(right.id);
}

function compareByCostThenId(
  left: ModelProviderProfile,
  right: ModelProviderProfile
): number {
  const costPriority = left.estimatedCost - right.estimatedCost;
  if (costPriority !== 0) {
    return costPriority;
  }

  return left.id.localeCompare(right.id);
}

function getRoutePriority(
  route: ModelProviderRoute,
  mode: ModelPolicyMode
): number {
  const priorities: Record<ModelPolicyMode, Record<ModelProviderRoute, number>> = {
    quality: {
      cloud_direct_video: 3,
      cloud_frame_text: 2,
      local_vision_language: 1
    },
    balanced: {
      cloud_frame_text: 3,
      local_vision_language: 2,
      cloud_direct_video: 1
    },
    local: {
      local_vision_language: 3,
      cloud_frame_text: 0,
      cloud_direct_video: 0
    }
  };

  return priorities[mode][route];
}

function createSelectionReason(
  profile: ModelProviderProfile,
  policy: ModelPolicy
): string {
  if (policy.mode === "balanced") {
    return `Selected ${profile.route} for balanced quality, cost, and input-size policy.`;
  }

  if (policy.mode === "local") {
    return "Selected a local provider because policy requires local multimodal analysis.";
  }

  return "Selected the highest-quality provider that satisfies policy constraints.";
}

function validatePolicy(policy: ModelPolicy): void {
  assertNonNegativeInteger(policy.maxFrames, "Model policy maxFrames");
  assertNonNegativeNumber(policy.maxVideoSeconds, "Model policy maxVideoSeconds");
  assertNonNegativeInteger(policy.timeoutMs, "Model policy timeoutMs");
  assertNonNegativeInteger(policy.maxRetries, "Model policy maxRetries");
  if (policy.costBudget !== undefined) {
    assertNonNegativeNumber(policy.costBudget, "Model policy costBudget");
  }
}

function validateRequestedInput(input: RequestedMultimodalInput): void {
  assertNonNegativeInteger(input.frameCount, "Requested frame count");
  assertNonNegativeNumber(input.videoSeconds, "Requested video seconds");
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}
