import type {
  AudioFileTranscriptionPort,
  AudioFileTranscriptionRequest,
  TranscriptionPort
} from "../../application/ports/TranscriptionPort";
import type { TranscriptionResult, VideoTrend } from "../../domain/types";

interface FunAsrTranscriptionClientOptions {
  endpoint?: string;
  timeoutMs?: number;
}

export class FunAsrTranscriptionClient implements TranscriptionPort, AudioFileTranscriptionPort {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: FunAsrTranscriptionClientOptions = {}) {
    this.endpoint = (options.endpoint ?? process.env.FUNASR_SERVICE_URL ?? "http://localhost:8765").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  async transcribe(video: VideoTrend): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          description: video.description,
          platform: video.platform
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`FunASR service failed: ${response.status}`);
      }

      const result = (await response.json()) as TranscriptionResult;
      return {
        ...result,
        source: "funasr",
        segments: result.segments ?? [],
        fullText: result.fullText ?? result.segments?.map((segment) => segment.text).join("\n") ?? ""
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async transcribeAudioFile(request: AudioFileTranscriptionRequest): Promise<TranscriptionResult> {
    const result = await this.postTranscription("/transcribe-file", {
      audioPath: request.audioPath,
      title: request.title,
      fallbackText: request.fallbackText
    });

    return normalizeTranscriptionResult(result);
  }

  private async postTranscription(path: string, body: unknown): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`FunASR service failed: ${response.status}`);
      }

      return (await response.json()) as TranscriptionResult;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeTranscriptionResult(result: TranscriptionResult): TranscriptionResult {
  const segments = result.segments ?? [];
  return {
    ...result,
    source: "funasr",
    language: result.language ?? "zh",
    segments,
    fullText: result.fullText ?? segments.map((segment) => segment.text).join("\n") ?? ""
  };
}
