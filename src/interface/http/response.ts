export interface ApiSuccess<T> {
  success: true;
  data: T;
  traceId: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
  traceId: string;
}

export function createTraceId(seed = `${Date.now()}:${Math.random()}`): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `trace_${hash.toString(36)}`;
}
