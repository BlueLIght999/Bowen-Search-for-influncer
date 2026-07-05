import type { TranscriptionResult, VideoTrend } from "../../domain/types";

export interface TranscriptionPort {
  transcribe(video: VideoTrend): Promise<TranscriptionResult>;
}
