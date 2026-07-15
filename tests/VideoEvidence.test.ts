import { describe, expect, it } from "vitest";
import {
  InvalidMultimodalEvidenceError,
  createReasoningClaim,
  createVideoEvidenceBundle
} from "../src/domain/multimodalIntelligence/VideoEvidence";

function validBundleInput() {
  return {
    jobId: "job_123",
    videoId: "video_123",
    durationMs: 60_000,
    modalities: {
      transcript: { status: "available" as const },
      frames: { status: "available" as const },
      ocr: { status: "available" as const }
    },
    transcriptSegments: [
      {
        id: "transcript_1",
        startMs: 0,
        endMs: 10_000,
        text: "开场直接提出冲突。"
      },
      {
        id: "transcript_2",
        startMs: 10_000,
        endMs: 30_000,
        text: "人物关系和反转逐步展开。"
      }
    ],
    frameEvidence: [
      { id: "frame_1", timestampMs: 0 },
      { id: "frame_2", timestampMs: 15_000 },
      { id: "frame_3", timestampMs: 29_000 }
    ],
    ocrEvidence: [
      {
        id: "ocr_1",
        frameId: "frame_1",
        timestampMs: 0,
        text: "她竟然回来了",
        confidence: 0.95
      }
    ],
    timelineSlices: [
      {
        id: "slice_1",
        startMs: 0,
        endMs: 20_000,
        frameIds: ["frame_1", "frame_2"],
        transcriptSegmentIds: ["transcript_1", "transcript_2"],
        ocrEvidenceIds: ["ocr_1"],
        samplingReason: "opening" as const
      },
      {
        id: "slice_2",
        startMs: 15_000,
        endMs: 30_000,
        frameIds: ["frame_2", "frame_3"],
        transcriptSegmentIds: ["transcript_2"],
        ocrEvidenceIds: [],
        samplingReason: "scene_change" as const
      }
    ]
  };
}

describe("VideoEvidenceBundle", () => {
  it("merges overlapping analyzed ranges when calculating coverage", () => {
    const bundle = createVideoEvidenceBundle(validBundleInput());

    expect(bundle.coverage).toEqual({
      coveredRanges: [{ startMs: 0, endMs: 30_000 }],
      coveredDurationMs: 30_000,
      coverageRatio: 0.5,
      modalities: {
        transcript: { status: "available" },
        frames: { status: "available" },
        ocr: { status: "available" }
      }
    });
  });

  it("rejects evidence timestamps outside the video duration", () => {
    const input = validBundleInput();
    input.frameEvidence[2].timestampMs = 60_001;

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "Frame evidence timestamp must be within the video duration: frame_3"
    );
  });

  it("rejects timeline slices whose ranges are invalid", () => {
    const input = validBundleInput();
    input.timelineSlices[0].endMs = input.timelineSlices[0].startMs;

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "Timeline slice range must have a positive duration: slice_1"
    );
  });

  it("rejects timeline slices that reference unknown evidence", () => {
    const input = validBundleInput();
    input.timelineSlices[0].frameIds.push("frame_missing");

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "Timeline slice references unknown frame evidence: frame_missing"
    );
  });

  it("rejects duplicate evidence ids across the bundle", () => {
    const input = validBundleInput();
    input.frameEvidence.push({ id: "frame_1", timestampMs: 20_000 });

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "Duplicate frame evidence id: frame_1"
    );
  });

  it("requires a reason when a modality is missing or failed", () => {
    const input = validBundleInput();
    input.modalities.ocr = { status: "failed" } as never;

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "Evidence modality reason is required when ocr is failed."
    );
  });

  it("rejects evidence when its modality is declared missing", () => {
    const input = validBundleInput();
    input.modalities.ocr = {
      status: "missing",
      reason: "No readable subtitles."
    };

    expect(() => createVideoEvidenceBundle(input)).toThrow(
      "OCR evidence must be empty when the ocr modality is missing."
    );
  });
});

describe("ReasoningClaim", () => {
  it("creates an evidence-backed observation with normalized references", () => {
    const bundle = createVideoEvidenceBundle(validBundleInput());

    const claim = createReasoningClaim(
      {
        id: "claim_hook",
        type: "observation",
        statement: "首帧字幕和人物表情共同建立了身份反转钩子。",
        confidence: 0.9,
        evidenceRefs: [
          {
            startMs: 0,
            endMs: 3_000,
            frameIds: ["frame_1"],
            transcriptSegmentIds: ["transcript_1"],
            ocrEvidenceIds: ["ocr_1"]
          }
        ],
        knowledgeIds: []
      },
      bundle
    );

    expect(claim).toMatchObject({
      id: "claim_hook",
      type: "observation",
      confidence: 0.9
    });
  });

  it.each(["observation", "inference"] as const)(
    "rejects %s claims without evidence",
    (type) => {
      const bundle = createVideoEvidenceBundle(validBundleInput());

      expect(() =>
        createReasoningClaim(
          {
            id: `claim_${type}`,
            type,
            statement: "This conclusion has no evidence.",
            confidence: 0.5,
            evidenceRefs: [],
            knowledgeIds: []
          },
          bundle
        )
      ).toThrow(InvalidMultimodalEvidenceError);
    }
  );

  it("allows recommendations backed by retrieved knowledge without video evidence", () => {
    const bundle = createVideoEvidenceBundle(validBundleInput());

    expect(
      createReasoningClaim(
        {
          id: "claim_recommendation",
          type: "recommendation",
          statement: "把最强冲突移入前三秒。",
          confidence: 0.8,
          evidenceRefs: [],
          knowledgeIds: ["knowledge_hook_1"]
        },
        bundle
      )
    ).toMatchObject({
      type: "recommendation",
      knowledgeIds: ["knowledge_hook_1"]
    });
  });

  it("rejects claim references that point outside the video duration", () => {
    const bundle = createVideoEvidenceBundle(validBundleInput());

    expect(() =>
      createReasoningClaim(
        {
          id: "claim_outside",
          type: "observation",
          statement: "Evidence is outside the video.",
          confidence: 0.5,
          evidenceRefs: [
            {
              startMs: 59_000,
              endMs: 61_000,
              frameIds: ["frame_3"],
              transcriptSegmentIds: [],
              ocrEvidenceIds: []
            }
          ],
          knowledgeIds: []
        },
        bundle
      )
    ).toThrow("Reasoning evidence range must be within the video duration.");
  });

  it("rejects claim references to unknown evidence ids", () => {
    const bundle = createVideoEvidenceBundle(validBundleInput());

    expect(() =>
      createReasoningClaim(
        {
          id: "claim_unknown",
          type: "inference",
          statement: "Unknown visual evidence.",
          confidence: 0.5,
          evidenceRefs: [
            {
              startMs: 0,
              endMs: 3_000,
              frameIds: ["frame_unknown"],
              transcriptSegmentIds: [],
              ocrEvidenceIds: []
            }
          ],
          knowledgeIds: []
        },
        bundle
      )
    ).toThrow("Reasoning claim references unknown frame evidence: frame_unknown");
  });
});
