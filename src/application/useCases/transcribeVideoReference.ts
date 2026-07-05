import type { TranscriptionPort } from "../ports/TranscriptionPort";
import type { TranscriptionResult, VideoTrend } from "../../domain/types";

interface TranscribeVideoReferenceOptions {
  video: VideoTrend;
  transcriber: TranscriptionPort;
}

export async function transcribeVideoReference({
  video,
  transcriber
}: TranscribeVideoReferenceOptions): Promise<TranscriptionResult> {
  try {
    return await transcriber.transcribe(video);
  } catch {
    return buildFallbackTranscript(video);
  }
}

export function buildFallbackTranscript(video: VideoTrend): TranscriptionResult {
  const fullText = [`标题：${video.title}`, `简介：${video.description}`, `增长信号：${video.growthReason}`]
    .filter(Boolean)
    .join("\n");

  return {
    source: "fallback",
    language: "zh",
    fullText,
    segments: [
      {
        start: 0,
        end: 0,
        text: fullText
      }
    ]
  };
}
