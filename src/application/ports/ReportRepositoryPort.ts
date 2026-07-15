import type { VideoAnalysisReport } from "../../domain/types";

export interface ReportRepositoryPort {
  save(report: VideoAnalysisReport): Promise<void>;
  findByJobId(jobId: string): Promise<VideoAnalysisReport | null>;
}
