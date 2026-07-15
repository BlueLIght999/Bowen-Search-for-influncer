export interface AudioExtractionRequest {
  videoPath: string;
  outputPath: string;
}

export interface AudioExtractionResult {
  status: "completed" | "failed";
  audioPath?: string;
  reason?: string;
}

export interface FrameSamplingRequest {
  videoPath: string;
  outputPattern: string;
  everySeconds: number;
}

export interface FrameSamplingResult {
  status: "completed" | "failed";
  outputPattern?: string;
  everySeconds: number;
  reason?: string;
}

export interface MediaProbeRequest {
  videoPath: string;
}

export type MediaProbeResult =
  | {
      status: "completed";
      durationSeconds: number;
      width?: number;
      height?: number;
      frameRate?: number;
    }
  | {
      status: "failed";
      reason: string;
    };

export interface AudioExtractorPort {
  extractAudio(request: AudioExtractionRequest): Promise<AudioExtractionResult>;
}

export interface FrameSamplerPort {
  sampleFrames(request: FrameSamplingRequest): Promise<FrameSamplingResult>;
}

export interface MediaProbePort {
  probe(request: MediaProbeRequest): Promise<MediaProbeResult>;
}
