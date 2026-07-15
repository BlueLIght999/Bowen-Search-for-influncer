import type { TranscriptionResult, VideoTrend } from "../../domain/types";

export interface TranscriptionPort {
  transcribe(video: VideoTrend): Promise<TranscriptionResult>;
}

export interface AudioFileTranscriptionRequest {
  audioPath: string;
  title?: string;
  fallbackText?: string;
}

export interface AudioFileTranscriptionPort {
  transcribeAudioFile(request: AudioFileTranscriptionRequest): Promise<TranscriptionResult>;
}
