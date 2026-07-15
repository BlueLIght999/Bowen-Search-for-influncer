import type { VideoAnalysisJobSnapshot } from "../../domain/jobs/VideoAnalysisJob";

export interface JobRepositoryPort {
  save(job: VideoAnalysisJobSnapshot): Promise<void>;
  findById(jobId: string): Promise<VideoAnalysisJobSnapshot | null>;
}
