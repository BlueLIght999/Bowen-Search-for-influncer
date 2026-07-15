import type {
  MultimodalSliceUnderstandingRequest,
  MultimodalSliceUnderstandingResult,
  MultimodalUnderstandingPort
} from "../../application/ports/MultimodalUnderstandingPort";
import type { ReasoningEvidenceRef } from "../../domain/multimodalIntelligence/VideoEvidence";

export class FakeMultimodalUnderstandingClient implements MultimodalUnderstandingPort {
  getSliceModelProfile() {
    return {
      provider: "fake",
      model: "fake-frame-text-v1",
      promptVersion: "fake-slice-v1",
      schemaVersion: "multimodal-slice-v1"
    };
  }

  getModelProviderProfile() {
    return {
      id: "fake_frame_text",
      provider: "fake",
      model: "fake-frame-text-v1",
      route: "cloud_frame_text" as const,
      requiresCloudUpload: false,
      maxFrames: 80,
      maxVideoSeconds: 120,
      qualityScore: 50,
      estimatedCost: 0
    };
  }

  async understandSlice(
    request: MultimodalSliceUnderstandingRequest
  ): Promise<MultimodalSliceUnderstandingResult> {
    const evidenceRef = createEvidenceRef(request);
    if (
      evidenceRef.frameIds.length === 0 &&
      evidenceRef.transcriptSegmentIds.length === 0 &&
      evidenceRef.ocrEvidenceIds.length === 0
    ) {
      return {
        status: "failed",
        reason: "No timeline evidence is available for fake understanding.",
        retryable: false
      };
    }

    const transcriptText = request.slice.transcriptSegmentIds
      .map((id) =>
        request.evidenceBundle.transcriptSegments.find((item) => item.id === id)
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => item.text)
      .join(" ");
    const ocrText = request.slice.ocrEvidenceIds
      .map((id) =>
        request.evidenceBundle.ocrEvidence.find((item) => item.id === id)
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => item.text)
      .join(" ");
    const summary = [transcriptText, ocrText]
      .filter(Boolean)
      .join(" / ")
      .slice(0, 160);

    return {
      status: "completed",
      observation: {
        id: `fake_observation_${request.slice.id}`,
        sliceId: request.slice.id,
        startMs: request.slice.startMs,
        endMs: request.slice.endMs,
        summary: summary || `演示模型已读取 ${request.slice.id} 的可用画面证据。`,
        visibleSubjects:
          request.frameAssets.length > 0 ? ["抽样画面主体"] : [],
        actions: ["时间线内容复核"],
        shotTypes:
          request.frameAssets.length > 1 ? ["连续镜头"] : ["单帧镜头"],
        subtitleLegibility:
          request.slice.ocrEvidenceIds.length > 0 ? "clear" : "not_observed",
        aiDramaSignals: inferAiDramaSignals(transcriptText, ocrText),
        confidence: 0.72,
        claims: [
          {
            id: `fake_claim_${request.slice.id}`,
            type: "observation",
            statement:
              summary ||
              `演示模型观察到 ${request.slice.id} 的可用证据。`,
            confidence: 0.72,
            evidenceRefs: [evidenceRef],
            knowledgeIds: []
          }
        ]
      },
      execution: {
        provider: "fake",
        model: "fake-frame-text-v1",
        promptVersion: "fake-slice-v1",
        schemaVersion: "multimodal-slice-v1",
        latencyMs: 0,
        status: "completed",
        partial: false,
        usage: {
          inputTokens: estimateTokens(`${transcriptText} ${ocrText}`) +
            request.frameAssets.length * 50,
          outputTokens: estimateTokens(summary) + 24,
          imageCount: request.frameAssets.length,
          frameCount: request.frameAssets.length
        }
      }
    };
  }
}

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function createEvidenceRef(
  request: MultimodalSliceUnderstandingRequest
): ReasoningEvidenceRef {
  return {
    startMs: request.slice.startMs,
    endMs: request.slice.endMs,
    frameIds: [...request.slice.frameIds],
    transcriptSegmentIds: [...request.slice.transcriptSegmentIds],
    ocrEvidenceIds: [...request.slice.ocrEvidenceIds]
  };
}

function inferAiDramaSignals(transcriptText: string, ocrText: string): string[] {
  const text = `${transcriptText} ${ocrText}`.toLowerCase();
  const signals: string[] = [];

  if (text.includes("conflict") || text.includes("reversal")) {
    signals.push("conflict_or_reversal");
  }
  if (text.includes("ending") || text.includes("returns")) {
    signals.push("series_hook");
  }

  return signals.length > 0 ? signals : ["not_observed"];
}
