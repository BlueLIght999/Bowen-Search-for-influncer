import { createHash } from "node:crypto";

export function hashModelRunInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export function createModelRunCacheKey({
  inputHash,
  model,
  promptVersion,
  schemaVersion
}: {
  inputHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ inputHash, model, promptVersion, schemaVersion }))
    .digest("hex")
    .slice(0, 24);
  return `modelrun_${digest}`;
}
