import { describe, expect, it } from "vitest";
import { FfmpegMediaProbe } from "../src/infrastructure/media/FfmpegMediaProcessing";

describe("FfmpegMediaProbe", () => {
  it("reads duration, dimensions, and frame rate from ffprobe JSON", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const probe = new FfmpegMediaProbe({
      run: async (command, args) => {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            streams: [
              {
                codec_type: "video",
                width: 1080,
                height: 1920,
                avg_frame_rate: "30000/1001"
              }
            ],
            format: {
              duration: "42.25"
            }
          })
        };
      }
    });

    const result = await probe.probe({
      videoPath: "storage/uploads/demo.mp4"
    });

    expect(result).toEqual({
      status: "completed",
      durationSeconds: 42.25,
      width: 1080,
      height: 1920,
      frameRate: 29.97002997002997
    });
    expect(calls[0]).toEqual({
      command: "ffprobe",
      args: [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "storage/uploads/demo.mp4"
      ]
    });
  });

  it("returns a failed probe when ffprobe exits with an error", async () => {
    const probe = new FfmpegMediaProbe({
      run: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "invalid data found"
      })
    });

    await expect(
      probe.probe({ videoPath: "broken.mp4" })
    ).resolves.toEqual({
      status: "failed",
      reason: "invalid data found"
    });
  });

  it("returns a failed probe when ffprobe JSON has no usable duration", async () => {
    const probe = new FfmpegMediaProbe({
      run: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ format: {}, streams: [] }),
        stderr: ""
      })
    });

    await expect(
      probe.probe({ videoPath: "broken.mp4" })
    ).resolves.toMatchObject({
      status: "failed",
      reason: "ffprobe did not return a usable duration."
    });
  });
});
