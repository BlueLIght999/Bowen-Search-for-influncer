import type { FrameSampleAsset } from "../../application/ports/FrameCatalogPort";
import type { OcrPort } from "../../application/ports/OcrPort";
import type { SubtitleSignal } from "../../domain/types";

interface PaddleOcrClientOptions {
  endpoint?: string;
  timeoutMs?: number;
}

interface PaddleOcrResponse {
  signals?: unknown;
}

export class PaddleOcrClient implements OcrPort {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: PaddleOcrClientOptions = {}) {
    this.endpoint = (options.endpoint ?? process.env.PADDLEOCR_SERVICE_URL ?? "http://localhost:8770").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async recognizeFrames(frames: FrameSampleAsset[]): Promise<SubtitleSignal[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/recognize-frames`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ frames }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`PaddleOCR service failed: ${response.status}`);
      }

      const result = (await response.json()) as PaddleOcrResponse;
      if (!Array.isArray(result.signals)) {
        throw new Error("Invalid PaddleOCR response: signals must be an array.");
      }

      return result.signals
        .filter(isSubtitleSignal)
        .map((signal) => ({
          frameIndex: signal.frameIndex,
          text: signal.text,
          confidence: signal.confidence
        }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isSubtitleSignal(value: unknown): value is SubtitleSignal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const signal = value as Record<string, unknown>;
  return (
    typeof signal.frameIndex === "number" &&
    typeof signal.text === "string" &&
    typeof signal.confidence === "number"
  );
}
