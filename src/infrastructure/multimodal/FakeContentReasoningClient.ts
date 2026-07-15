import type {
  ContentReasoningPort,
  ContentReasoningRequest,
  ContentReasoningResult
} from "../../application/ports/ContentReasoningPort";
import type {
  MultimodalUnderstanding,
  MultimodalVideoContentType
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import type { ReasoningClaim } from "../../domain/multimodalIntelligence/VideoEvidence";

export class FakeContentReasoningClient implements ContentReasoningPort {
  getModelProviderProfile() {
    return {
      id: "fake_temporal_reasoning",
      provider: "fake",
      model: "fake-temporal-reasoner-v1",
      route: "cloud_frame_text" as const,
      requiresCloudUpload: false,
      maxFrames: 80,
      maxVideoSeconds: 120,
      qualityScore: 50,
      estimatedCost: 0
    };
  }

  async reason(
    request: ContentReasoningRequest
  ): Promise<ContentReasoningResult> {
    if (request.sliceObservations.length === 0) {
      return {
        status: "failed",
        reason: "No slice observations are available for video reasoning.",
        retryable: false
      };
    }

    return {
      status: "completed",
      understanding: createFakeUnderstanding(request)
    };
  }
}

function createFakeUnderstanding(
  request: ContentReasoningRequest
): MultimodalUnderstanding {
  const contentType = inferContentType(request);
  const hook = createClaim("fake_hook", request, "inference");
  const conflict = createClaim("fake_conflict", request, "inference");
  const ending = createClaim("fake_ending", request, "inference");

  return {
    jobId: request.jobId,
    videoId: request.videoId,
    contentType,
    scenes: request.sliceObservations,
    narrative: {
      premise: createClaim("fake_premise", request, "inference"),
      hook,
      conflict,
      reversal: createClaim("fake_reversal", request, "inference"),
      ending
    },
    visualCraft: {
      composition: [],
      shotVariety: [createClaim("fake_shot_variety", request, "inference")],
      continuity: [],
      subtitleLegibility: [
        createClaim("fake_subtitle_legibility", request, "inference")
      ],
      styleConsistency: [],
      pacing: [createClaim("fake_pacing", request, "inference")]
    },
    aiDrama:
      contentType === "ai_drama"
        ? {
            conflict: [conflict],
            reversals: [createClaim("fake_ai_reversal", request, "inference")],
            styleDrift: [],
            cliffhanger: ending,
            seriesPotential: createClaim(
              "fake_series_potential",
              request,
              "inference"
            )
          }
        : undefined,
    evidenceCoverage: request.coverage,
    execution: {
      provider: "fake",
      model: "fake-temporal-reasoner-v1",
      promptVersion: "fake-reasoning-v1",
      schemaVersion: "multimodal-video-v1",
      latencyMs: 0,
      status: "completed",
      partial: request.coverage.coverageRatio < 1,
      usage: {
        inputTokens: estimateReasoningInputTokens(request),
        outputTokens: 96
      }
    }
  };
}

function estimateReasoningInputTokens(request: ContentReasoningRequest): number {
  const summaries = request.sliceObservations
    .map((observation) => observation.summary)
    .join(" ");
  return Math.max(1, Math.ceil(summaries.length / 4)) +
    request.sliceObservations.length * 20;
}

function inferContentType(
  request: ContentReasoningRequest
): MultimodalVideoContentType {
  const signals = request.sliceObservations.flatMap(
    (observation) => observation.aiDramaSignals
  );
  return signals.some((signal) => signal !== "not_observed")
    ? "ai_drama"
    : "unknown";
}

function createClaim(
  id: string,
  request: ContentReasoningRequest,
  type: ReasoningClaim["type"]
): ReasoningClaim {
  const firstReference =
    request.sliceObservations[0].claims[0].evidenceRefs[0];

  return {
    id,
    type,
    statement: createStatement(id, request),
    confidence: Math.max(0.5, request.coverage.coverageRatio * 0.82),
    evidenceRefs: [firstReference],
    knowledgeIds: []
  };
}

function createStatement(
  id: string,
  request: ContentReasoningRequest
): string {
  const summaries = request.sliceObservations
    .map((observation) => observation.summary)
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");

  const labels: Record<string, string> = {
    fake_premise: "视频主要围绕已采样画面证据展开",
    fake_hook: "开场钩子来自首段可见冲突或字幕信息",
    fake_conflict: "核心冲突需要结合画面和文稿继续放大",
    fake_reversal: "反转点可以前置成更明确的观看理由",
    fake_ending: "结尾需要保留追问或续集悬念",
    fake_shot_variety: "分镜节奏来自抽帧中的镜头变化",
    fake_subtitle_legibility: "字幕可读性会影响静音观看理解",
    fake_pacing: "节奏判断基于当前抽样切片",
    fake_ai_reversal: "AI 漫剧反转点适合做成前三秒钩子",
    fake_series_potential: "该设定具备继续延展成系列内容的潜力"
  };

  return `${labels[id] ?? "演示模型结论"}：${summaries || "可用证据"}`;
}
