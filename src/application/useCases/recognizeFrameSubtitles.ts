import type { FrameSampleAsset } from "../ports/FrameCatalogPort";
import type {
  OcrPort,
  OcrProcessingResult
} from "../ports/OcrPort";
import type { SubtitleSignal } from "../../domain/types";

interface RecognizeFrameSubtitlesInput {
  frames: FrameSampleAsset[];
  ocr: OcrPort;
}

export async function recognizeFrameSubtitles({
  frames,
  ocr
}: RecognizeFrameSubtitlesInput): Promise<OcrProcessingResult> {
  if (frames.length === 0) {
    return {
      status: "skipped",
      source: "fallback",
      signals: [],
      reason: "No sampled frames are available for OCR."
    };
  }

  try {
    const signals = normalizeSignals(await ocr.recognizeFrames(frames));
    return {
      status: "completed",
      source: "paddleocr",
      signals
    };
  } catch (error) {
    return {
      status: "failed",
      source: "fallback",
      signals: [],
      reason: error instanceof Error ? error.message : "OCR service failed."
    };
  }
}

function normalizeSignals(signals: SubtitleSignal[]): SubtitleSignal[] {
  const seen = new Set<string>();

  return signals.flatMap((signal) => {
    const text = signal.text.trim();
    if (!text || seen.has(text)) {
      return [];
    }

    seen.add(text);
    return [
      {
        frameIndex: signal.frameIndex,
        text,
        confidence: Math.max(0, Math.min(1, signal.confidence))
      }
    ];
  });
}
