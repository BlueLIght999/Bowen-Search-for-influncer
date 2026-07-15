import type {
  ModelRunRecord,
  ModelRunCacheStatus,
  ModelRunRepositoryPort,
  ModelRunStage
} from "../ports/ModelRunRepositoryPort";
import type {
  ModelPolicyMode,
  ModelProviderRoute
} from "../modelProviderPolicy";

export interface ModelRunCacheAuditSummary {
  hits: number;
  misses: number;
  readFailures: number;
  writeFailures: number;
  savedModelCalls: number;
  estimatedSkippedModelCalls: number;
}

export interface ModelRunUsageAuditSummary {
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  frameCount: number;
  runsWithUsage: number;
  runsMissingUsage: number;
}

export interface ModelRunSelectionStageSummary {
  runsWithSelection: number;
  runsMissingSelection: number;
  estimatedCost: number;
  policyModes: Record<ModelPolicyMode, number>;
  routes: Record<ModelProviderRoute, number>;
  providerProfiles: Record<string, number>;
  cloudUploadRequired: number;
  cloudUploadAllowed: number;
}

export interface ModelRunSelectionAuditSummary
  extends ModelRunSelectionStageSummary {
  byStage: Record<ModelRunStage, ModelRunSelectionStageSummary>;
}

export interface ModelRunAuditSummary {
  total: number;
  completed: number;
  failed: number;
  partial: number;
  stages: Record<ModelRunStage, number>;
  cacheKeys: string[];
  cache: ModelRunCacheAuditSummary;
  usage: ModelRunUsageAuditSummary;
  selection: ModelRunSelectionAuditSummary;
}

export interface ListModelRunsForJobResult {
  jobId: string;
  modelRuns: ModelRunRecord[];
  summary: ModelRunAuditSummary;
}

export async function listModelRunsForJob({
  jobId,
  repository
}: {
  jobId: string;
  repository: ModelRunRepositoryPort;
}): Promise<ListModelRunsForJobResult> {
  const modelRuns = await repository.findByJobId(jobId);

  return {
    jobId,
    modelRuns,
    summary: summarizeModelRuns(modelRuns)
  };
}

function summarizeModelRuns(modelRuns: ModelRunRecord[]): ModelRunAuditSummary {
  const stages: Record<ModelRunStage, number> = {
    visually_understanding: 0,
    reasoning: 0,
    evaluation: 0
  };

  for (const run of modelRuns) {
    stages[run.stage] += 1;
  }

  return {
    total: modelRuns.length,
    completed: modelRuns.filter((run) => run.status === "completed").length,
    failed: modelRuns.filter((run) => run.status === "failed").length,
    partial: modelRuns.filter((run) => run.partial).length,
    stages,
    cacheKeys: Array.from(new Set(modelRuns.map((run) => run.cacheKey))),
    cache: summarizeCache(modelRuns),
    usage: summarizeUsage(modelRuns),
    selection: summarizeSelection(modelRuns)
  };
}

function summarizeCache(modelRuns: ModelRunRecord[]): ModelRunCacheAuditSummary {
  const counts: Record<ModelRunCacheStatus, number> = {
    hit: 0,
    miss: 0,
    read_failed: 0,
    write_failed: 0
  };

  for (const run of modelRuns) {
    if (run.cache) {
      counts[run.cache.status] += 1;
    }
  }

  const savedModelCalls = modelRuns.filter(
    (run) => run.cache?.savedModelCall
  ).length;

  return {
    hits: counts.hit,
    misses: counts.miss,
    readFailures: modelRuns.filter(
      (run) => run.cache?.status === "read_failed" || run.cache?.readFailed
    ).length,
    writeFailures: modelRuns.filter(
      (run) => run.cache?.status === "write_failed" || run.cache?.writeFailed
    ).length,
    savedModelCalls,
    estimatedSkippedModelCalls: savedModelCalls
  };
}

function summarizeUsage(modelRuns: ModelRunRecord[]): ModelRunUsageAuditSummary {
  return modelRuns.reduce<ModelRunUsageAuditSummary>(
    (summary, run) => {
      if (!run.usage) {
        return {
          ...summary,
          runsMissingUsage: summary.runsMissingUsage + 1
        };
      }

      return {
        inputTokens: summary.inputTokens + (run.usage.inputTokens ?? 0),
        outputTokens: summary.outputTokens + (run.usage.outputTokens ?? 0),
        imageCount: summary.imageCount + (run.usage.imageCount ?? 0),
        frameCount: summary.frameCount + (run.usage.frameCount ?? 0),
        runsWithUsage: summary.runsWithUsage + 1,
        runsMissingUsage: summary.runsMissingUsage
      };
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      imageCount: 0,
      frameCount: 0,
      runsWithUsage: 0,
      runsMissingUsage: 0
    }
  );
}

function summarizeSelection(
  modelRuns: ModelRunRecord[]
): ModelRunSelectionAuditSummary {
  return {
    ...summarizeSelectionCore(modelRuns),
    byStage: {
      visually_understanding: summarizeSelectionCore(
        modelRuns.filter((run) => run.stage === "visually_understanding")
      ),
      reasoning: summarizeSelectionCore(
        modelRuns.filter((run) => run.stage === "reasoning")
      ),
      evaluation: summarizeSelectionCore(
        modelRuns.filter((run) => run.stage === "evaluation")
      )
    }
  };
}

function summarizeSelectionCore(
  modelRuns: ModelRunRecord[]
): ModelRunSelectionStageSummary {
  return modelRuns.reduce<ModelRunSelectionStageSummary>(
    (summary, run) => {
      if (!run.selection) {
        return {
          ...summary,
          runsMissingSelection: summary.runsMissingSelection + 1
        };
      }

      const selection = run.selection;

      return {
        runsWithSelection: summary.runsWithSelection + 1,
        runsMissingSelection: summary.runsMissingSelection,
        estimatedCost: summary.estimatedCost + selection.estimatedCost,
        policyModes: incrementBucket(summary.policyModes, selection.policyMode),
        routes: incrementBucket(summary.routes, selection.route),
        providerProfiles: incrementBucket(
          summary.providerProfiles,
          selection.providerProfileId
        ),
        cloudUploadRequired:
          summary.cloudUploadRequired +
          Number(selection.requiresCloudUpload === true),
        cloudUploadAllowed:
          summary.cloudUploadAllowed +
          Number(selection.allowCloudUpload)
      };
    },
    createEmptySelectionSummary()
  );
}

function createEmptySelectionSummary(): ModelRunSelectionStageSummary {
  return {
    runsWithSelection: 0,
    runsMissingSelection: 0,
    estimatedCost: 0,
    policyModes: {
      quality: 0,
      balanced: 0,
      local: 0
    },
    routes: {
      cloud_direct_video: 0,
      cloud_frame_text: 0,
      local_vision_language: 0
    },
    providerProfiles: {},
    cloudUploadRequired: 0,
    cloudUploadAllowed: 0
  };
}

function incrementBucket<TBucket extends string>(
  buckets: Record<TBucket, number>,
  bucket: TBucket
): Record<TBucket, number>;
function incrementBucket(
  buckets: Record<string, number>,
  bucket: string
): Record<string, number>;
function incrementBucket(
  buckets: Record<string, number>,
  bucket: string
): Record<string, number> {
  return {
    ...buckets,
    [bucket]: (buckets[bucket] ?? 0) + 1
  };
}
