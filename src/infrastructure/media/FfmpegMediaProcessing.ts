import { spawn } from "node:child_process";
import type {
  AudioExtractionRequest,
  AudioExtractionResult,
  AudioExtractorPort,
  FrameSamplerPort,
  FrameSamplingRequest,
  FrameSamplingResult,
  MediaProbePort,
  MediaProbeRequest,
  MediaProbeResult
} from "../../application/ports/MediaProcessingPort";

interface CommandResult {
  exitCode: number;
  stdout?: string;
  stderr: string;
}

interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult>;
}

class NodeCommandRunner implements CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(command, args, {
          windowsHide: true
        });
      } catch (error) {
        resolve({
          exitCode: 1,
          stderr:
            error instanceof Error ? error.message : "Failed to spawn command"
        });
        return;
      }
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        resolve({
          exitCode: 1,
          stderr: error.message
        });
      });

      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr
        });
      });
    });
  }
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
  };
}

export class FfmpegMediaProbe implements MediaProbePort {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = new NodeCommandRunner()) {
    this.runner = runner;
  }

  async probe(request: MediaProbeRequest): Promise<MediaProbeResult> {
    const args = [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      request.videoPath
    ];
    const result = await this.runner.run("ffprobe", args);

    if (result.exitCode !== 0) {
      return {
        status: "failed",
        reason: result.stderr || `ffprobe exited with code ${result.exitCode}`
      };
    }

    let output: FfprobeOutput;
    try {
      output = JSON.parse(result.stdout || "{}") as FfprobeOutput;
    } catch (error) {
      return {
        status: "failed",
        reason:
          error instanceof Error
            ? `ffprobe returned invalid JSON: ${error.message}`
            : "ffprobe returned invalid JSON."
      };
    }

    const videoStream = output.streams?.find(
      (stream) => stream.codec_type === "video"
    );
    const durationSeconds = parsePositiveNumber(
      output.format?.duration ?? videoStream?.duration
    );

    if (durationSeconds === undefined) {
      return {
        status: "failed",
        reason: "ffprobe did not return a usable duration."
      };
    }

    return {
      status: "completed",
      durationSeconds,
      width: positiveNumberOrUndefined(videoStream?.width),
      height: positiveNumberOrUndefined(videoStream?.height),
      frameRate: parseFrameRate(
        videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate
      )
    };
  }
}

export class FfmpegAudioExtractor implements AudioExtractorPort {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = new NodeCommandRunner()) {
    this.runner = runner;
  }

  async extractAudio(request: AudioExtractionRequest): Promise<AudioExtractionResult> {
    const args = [
      "-y",
      "-i",
      request.videoPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      request.outputPath
    ];
    const result = await this.runner.run("ffmpeg", args);

    if (result.exitCode !== 0) {
      return {
        status: "failed",
        reason: result.stderr || `ffmpeg exited with code ${result.exitCode}`
      };
    }

    return {
      status: "completed",
      audioPath: request.outputPath
    };
  }
}

export class FfmpegFrameSampler implements FrameSamplerPort {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = new NodeCommandRunner()) {
    this.runner = runner;
  }

  async sampleFrames(request: FrameSamplingRequest): Promise<FrameSamplingResult> {
    const interval = Math.max(1, Math.round(request.everySeconds));
    const args = [
      "-y",
      "-i",
      request.videoPath,
      "-vf",
      `fps=1/${interval}`,
      "-q:v",
      "2",
      request.outputPattern
    ];
    const result = await this.runner.run("ffmpeg", args);

    if (result.exitCode !== 0) {
      return {
        status: "failed",
        everySeconds: interval,
        reason: result.stderr || `ffmpeg exited with code ${result.exitCode}`
      };
    }

    return {
      status: "completed",
      outputPattern: request.outputPattern,
      everySeconds: interval
    };
  }
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function positiveNumberOrUndefined(
  value: number | undefined
): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === "0/0") {
    return undefined;
  }
  if (!value.includes("/")) {
    return parsePositiveNumber(value);
  }
  const [numeratorValue, denominatorValue] = value.split("/");
  const numerator = Number(numeratorValue);
  const denominator = Number(denominatorValue);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return undefined;
  }
  return numerator / denominator;
}
