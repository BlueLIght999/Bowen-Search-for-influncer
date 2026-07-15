export interface ErrorLogEntry {
  traceId: string;
  jobId?: string;
  code: string;
  stage: string;
  message: string;
  detail?: unknown;
  timestamp: string;
}

export interface ErrorLogPort {
  append(entry: ErrorLogEntry): Promise<void>;
}
