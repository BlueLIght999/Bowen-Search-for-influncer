import type { FrameSampleAsset } from "./FrameCatalogPort";
import type { SubtitleSignal } from "../../domain/types";

export interface OcrPort {
  recognizeFrames(frames: FrameSampleAsset[]): Promise<SubtitleSignal[]>;
}

export type OcrProcessingStatus = "completed" | "skipped" | "failed";
export type OcrSource = "paddleocr" | "fallback";

export interface OcrProcessingResult {
  status: OcrProcessingStatus;
  source: OcrSource;
  signals: SubtitleSignal[];
  reason?: string;
}
