import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ErrorLogEntry,
  ErrorLogPort
} from "../../application/ports/ErrorLogPort";

export class LocalJsonlErrorLog implements ErrorLogPort {
  constructor(private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage") {}

  async append(entry: ErrorLogEntry): Promise<void> {
    assertValidErrorLogEntry(entry);
    const logsDir = join(this.rootDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await appendFile(
      join(logsDir, "errors.jsonl"),
      `${stringifyJsonLine(entry)}\n`,
      "utf8"
    );
  }
}

function stringifyJsonLine(entry: ErrorLogEntry): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(entry, (_key, value: unknown) => {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }

    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }

    return value;
  });
}

function assertValidErrorLogEntry(entry: ErrorLogEntry): void {
  assertRequiredString(entry.traceId, "Error log traceId is required.");
  assertRequiredString(entry.code, "Error log code is required.");
  assertRequiredString(entry.stage, "Error log stage is required.");
  assertRequiredString(entry.message, "Error log message is required.");
  assertRequiredString(entry.timestamp, "Error log timestamp is required.");

  if (Number.isNaN(Date.parse(entry.timestamp))) {
    throw new Error("Error log timestamp must be a valid ISO date string.");
  }
}

function assertRequiredString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}
