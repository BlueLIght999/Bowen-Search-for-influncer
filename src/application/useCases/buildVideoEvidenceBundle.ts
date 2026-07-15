import type { FrameSampleAsset } from "../ports/FrameCatalogPort";
import type { FrameSamplingResult } from "../ports/MediaProcessingPort";
import type { OcrProcessingResult } from "../ports/OcrPort";
import type { TranscriptionResult } from "../../domain/types";
import {
  createVideoEvidenceBundle,
  type CreateVideoEvidenceBundleInput,
  type EvidenceModalityAvailability,
  type TimelineSlice,
  type VideoEvidenceBundle
} from "../../domain/multimodalIntelligence/VideoEvidence";

export interface ModelFrameAsset {
  id: string;
  frameIndex: number;
  timestampMs: number;
  path: string;
}

interface BuildVideoEvidenceBundleInput {
  jobId: string;
  videoId: string;
  durationSeconds: number;
  transcription: TranscriptionResult;
  frames: FrameSampleAsset[];
  frameSampling: FrameSamplingResult;
  ocr: OcrProcessingResult;
  sliceDurationSeconds?: number;
}

export interface BuildVideoEvidenceBundleResult {
  bundle: VideoEvidenceBundle;
  frameAssets: ModelFrameAsset[];
}

export function buildVideoEvidenceBundle({
  jobId,
  videoId,
  durationSeconds,
  transcription,
  frames,
  frameSampling,
  ocr,
  sliceDurationSeconds = 20
}: BuildVideoEvidenceBundleInput): BuildVideoEvidenceBundleResult {
  assertPositiveFinite("Video duration", durationSeconds);
  assertPositiveFinite("Timeline slice duration", sliceDurationSeconds);
  const durationMs = secondsToMilliseconds(durationSeconds);
  const frameAssets = frames.map((frame) => ({
    id: `frame_${frame.index}`,
    frameIndex: frame.index,
    timestampMs: secondsToMilliseconds(frame.timestampSeconds),
    path: frame.path
  }));
  const framesByIndex = new Map(
    frameAssets.map((frame) => [frame.frameIndex, frame])
  );
  const transcriptSegments = normalizeTranscriptSegments(
    transcription,
    durationMs
  );
  const ocrEvidence = ocr.signals.map((signal, index) => {
    const frame = framesByIndex.get(signal.frameIndex);
    if (!frame) {
      throw new Error(
        `OCR signal references an unknown sampled frame: ${signal.frameIndex}`
      );
    }
    return {
      id: `ocr_${index + 1}`,
      frameId: frame.id,
      timestampMs: frame.timestampMs,
      text: signal.text,
      confidence: signal.confidence
    };
  });
  const timelineSlices = createTimelineSlices({
    durationMs,
    sliceDurationMs: secondsToMilliseconds(sliceDurationSeconds),
    frameAssets,
    transcriptSegments,
    ocrEvidence
  });
  const modalities = {
    transcript: getTranscriptModality(transcription),
    frames: getFrameModality(frames, frameSampling),
    ocr: getOcrModality(ocr)
  };
  const bundleInput: CreateVideoEvidenceBundleInput = {
    jobId,
    videoId,
    durationMs,
    modalities,
    transcriptSegments,
    frameEvidence: frameAssets.map(({ id, timestampMs }) => ({
      id,
      timestampMs
    })),
    ocrEvidence,
    timelineSlices
  };

  return {
    bundle: createVideoEvidenceBundle(bundleInput),
    frameAssets
  };
}

function normalizeTranscriptSegments(
  transcription: TranscriptionResult,
  durationMs: number
): CreateVideoEvidenceBundleInput["transcriptSegments"] {
  const sourceSegments =
    transcription.segments.length > 0
      ? transcription.segments
      : [
          {
            start: 0,
            end: durationMs / 1000,
            text: transcription.fullText
          }
        ];

  return sourceSegments.map((segment, index) => {
    const startMs = Math.max(
      0,
      Math.min(durationMs, secondsToMilliseconds(segment.start))
    );
    let endMs = Math.max(
      0,
      Math.min(durationMs, secondsToMilliseconds(segment.end))
    );
    if (endMs <= startMs) {
      endMs =
        transcription.source === "fallback"
          ? durationMs
          : Math.min(durationMs, startMs + 1);
    }
    if (endMs <= startMs) {
      throw new Error(
        `Transcription segment has no usable duration: ${index + 1}`
      );
    }

    return {
      id: `transcript_${index + 1}`,
      startMs,
      endMs,
      text: segment.text || transcription.fullText
    };
  });
}

function createTimelineSlices({
  durationMs,
  sliceDurationMs,
  frameAssets,
  transcriptSegments,
  ocrEvidence
}: {
  durationMs: number;
  sliceDurationMs: number;
  frameAssets: ModelFrameAsset[];
  transcriptSegments: CreateVideoEvidenceBundleInput["transcriptSegments"];
  ocrEvidence: CreateVideoEvidenceBundleInput["ocrEvidence"];
}): TimelineSlice[] {
  const slices: TimelineSlice[] = [];

  for (
    let startMs = 0, index = 0;
    startMs < durationMs;
    startMs += sliceDurationMs, index += 1
  ) {
    const endMs = Math.min(durationMs, startMs + sliceDurationMs);
    const isFinalSlice = endMs === durationMs && index > 0;
    slices.push({
      id: `slice_${index + 1}`,
      startMs,
      endMs,
      frameIds: frameAssets
        .filter((frame) => isTimestampInSlice(frame.timestampMs, startMs, endMs, durationMs))
        .map((frame) => frame.id),
      transcriptSegmentIds: transcriptSegments
        .filter(
          (segment) =>
            segment.startMs < endMs && segment.endMs > startMs
        )
        .map((segment) => segment.id),
      ocrEvidenceIds: ocrEvidence
        .filter((item) => isTimestampInSlice(item.timestampMs, startMs, endMs, durationMs))
        .map((item) => item.id),
      samplingReason:
        index === 0 ? "opening" : isFinalSlice ? "ending" : "interval"
    });
  }

  return slices;
}

function getTranscriptModality(
  transcription: TranscriptionResult
): EvidenceModalityAvailability {
  return transcription.source === "fallback"
    ? {
        status: "available",
        reason: "Fallback transcript was used."
      }
    : { status: "available" };
}

function getFrameModality(
  frames: FrameSampleAsset[],
  frameSampling: FrameSamplingResult
): EvidenceModalityAvailability {
  if (frames.length > 0) {
    return { status: "available" };
  }
  if (frameSampling.status === "failed") {
    return {
      status: "failed",
      reason: frameSampling.reason || "Frame sampling failed."
    };
  }
  return {
    status: "missing",
    reason: "Frame sampling produced no usable frames."
  };
}

function getOcrModality(
  ocr: OcrProcessingResult
): EvidenceModalityAvailability {
  if (ocr.status === "completed") {
    return { status: "available" };
  }
  return {
    status: ocr.status === "failed" ? "failed" : "missing",
    reason:
      ocr.reason ||
      (ocr.status === "failed"
        ? "OCR processing failed."
        : "OCR processing was skipped.")
  };
}

function isTimestampInSlice(
  timestampMs: number,
  startMs: number,
  endMs: number,
  durationMs: number
): boolean {
  return (
    timestampMs >= startMs &&
    (timestampMs < endMs ||
      (endMs === durationMs && timestampMs === durationMs))
  );
}

function secondsToMilliseconds(seconds: number): number {
  return Math.round(seconds * 1000);
}

function assertPositiveFinite(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}
