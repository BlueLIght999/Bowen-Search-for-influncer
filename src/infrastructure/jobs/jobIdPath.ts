export function toSafeJobFileStem(jobId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error(
      "Job id can only contain letters, numbers, underscores, and hyphens."
    );
  }

  return jobId;
}
