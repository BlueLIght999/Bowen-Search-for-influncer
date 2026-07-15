import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobRepositoryPort } from "../../application/ports/JobRepositoryPort";
import {
  assertValidVideoAnalysisJobSnapshot,
  type VideoAnalysisJobSnapshot
} from "../../domain/jobs/VideoAnalysisJob";
import { toSafeJobFileStem } from "./jobIdPath";

export class LocalJsonJobRepository implements JobRepositoryPort {
  constructor(private readonly rootDir = process.env.BOWEN_STORAGE_ROOT ?? "storage") {}

  async save(job: VideoAnalysisJobSnapshot): Promise<void> {
    assertValidVideoAnalysisJobSnapshot(job);
    const jobsDir = join(this.rootDir, "jobs");
    await mkdir(jobsDir, { recursive: true });

    const targetPath = join(jobsDir, `${toSafeJobFileStem(job.id)}.json`);
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
    await rename(temporaryPath, targetPath);
  }

  async findById(jobId: string): Promise<VideoAnalysisJobSnapshot | null> {
    const targetPath = join(this.rootDir, "jobs", `${toSafeJobFileStem(jobId)}.json`);

    try {
      const content = await readFile(targetPath, "utf8");
      const job = JSON.parse(content) as VideoAnalysisJobSnapshot;
      assertValidVideoAnalysisJobSnapshot(job);
      return job;
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
