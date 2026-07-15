import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalJsonlErrorLog } from "../src/infrastructure/logging/LocalJsonlErrorLog";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("LocalJsonlErrorLog", () => {
  it("appends parseable structured error entries without losing technical detail", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-errors-"));
    const logger = new LocalJsonlErrorLog(tempRoot);

    await logger.append({
      traceId: "trace_123",
      jobId: "job_123",
      code: "SOURCE_OCR_UNAVAILABLE",
      stage: "sampling_frames",
      message: "PaddleOCR service failed: 503",
      detail: { endpoint: "http://localhost:8770" },
      timestamp: "2026-07-10T00:00:00.000Z"
    });

    const lines = (await readFile(join(tempRoot, "logs", "errors.jsonl"), "utf8"))
      .trim()
      .split("\n");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      traceId: "trace_123",
      jobId: "job_123",
      code: "SOURCE_OCR_UNAVAILABLE",
      stage: "sampling_frames",
      message: "PaddleOCR service failed: 503",
      detail: { endpoint: "http://localhost:8770" },
      timestamp: "2026-07-10T00:00:00.000Z"
    });
  });

  it("serializes Error objects, circular detail, and bigint values into parseable JSONL", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-errors-"));
    const logger = new LocalJsonlErrorLog(tempRoot);
    const circular: { name: string; self?: unknown; size?: bigint; error?: Error } = {
      name: "diagnostic-detail",
      size: 12n,
      error: new Error("worker crashed")
    };
    circular.self = circular;

    await logger.append({
      traceId: "trace_circular",
      jobId: "job_123",
      code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
      stage: "evaluating",
      message: "fatal analysis failure",
      detail: circular,
      timestamp: "2026-07-10T00:00:00.000Z"
    });

    const [line] = (await readFile(join(tempRoot, "logs", "errors.jsonl"), "utf8"))
      .trim()
      .split("\n");
    const parsed = JSON.parse(line);

    expect(parsed.detail).toMatchObject({
      name: "diagnostic-detail",
      size: "12",
      self: "[Circular]",
      error: {
        name: "Error",
        message: "worker crashed"
      }
    });
    expect(parsed.detail.error.stack).toContain("worker crashed");
  });

  it("rejects entries without required correlation fields", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-errors-"));
    const logger = new LocalJsonlErrorLog(tempRoot);

    await expect(
      logger.append({
        traceId: "",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        stage: "evaluating",
        message: "fatal analysis failure",
        timestamp: "2026-07-10T00:00:00.000Z"
      })
    ).rejects.toThrow("Error log traceId is required.");
  });

  it("rejects entries with invalid timestamps", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "bowen-errors-"));
    const logger = new LocalJsonlErrorLog(tempRoot);

    await expect(
      logger.append({
        traceId: "trace_123",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        stage: "evaluating",
        message: "fatal analysis failure",
        timestamp: "not-a-date"
      })
    ).rejects.toThrow("Error log timestamp must be a valid ISO date string.");
  });
});
