import type { AudioFileTranscriptionPort } from "../ports/TranscriptionPort";
import type { TranscriptionResult } from "../../domain/types";

interface TranscribeUploadedAudioOptions {
  audioPath: string;
  title?: string;
  fallbackText: string;
  transcriber: AudioFileTranscriptionPort;
}

export async function transcribeUploadedAudio({
  audioPath,
  title,
  fallbackText,
  transcriber
}: TranscribeUploadedAudioOptions): Promise<TranscriptionResult> {
  try {
    return await transcriber.transcribeAudioFile({
      audioPath,
      title,
      fallbackText
    });
  } catch {
    return buildFallbackUploadedAudioTranscript({ title, fallbackText });
  }
}

function buildFallbackUploadedAudioTranscript({
  title,
  fallbackText
}: {
  title?: string;
  fallbackText: string;
}): TranscriptionResult {
  const fullText = [title ? `标题：${title}` : "", fallbackText].filter(Boolean).join("\n");

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
