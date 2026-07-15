import type {
  ErrorLogEntry,
  ErrorLogPort
} from "../../application/ports/ErrorLogPort";

export async function appendApiErrorLogSafely(
  errorLog: ErrorLogPort,
  entry: ErrorLogEntry
): Promise<void> {
  try {
    await errorLog.append(entry);
  } catch (error) {
    console.error("Failed to persist API error log.", {
      entry,
      loggingError:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error
    });
  }
}
