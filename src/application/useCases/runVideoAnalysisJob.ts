import type { DifferentiationPort } from "../ports/DifferentiationPort";
import type {
  ModelPolicy,
  ModelProviderProfile,
  RequestedMultimodalInput
} from "../modelProviderPolicy";
import type { ContentReasoningPort } from "../ports/ContentReasoningPort";
import type { ErrorLogPort } from "../ports/ErrorLogPort";
import type {
  FrameCatalogPort,
  FrameSampleAsset
} from "../ports/FrameCatalogPort";
import type { JobRepositoryPort } from "../ports/JobRepositoryPort";
import type { KnowledgeRepositoryPort } from "../ports/KnowledgeRepositoryPort";
import type {
  AudioExtractorPort,
  AudioExtractionResult,
  FrameSamplerPort,
  FrameSamplingResult,
  MediaProbePort,
  MediaProbeResult
} from "../ports/MediaProcessingPort";
import type { MediaWorkspacePort } from "../ports/MediaWorkspacePort";
import type {
  ModelRunRecord,
  ModelRunCacheMetadata,
  ModelRunSelectionMetadata,
  ModelRunRepositoryPort,
  ModelRunStage
} from "../ports/ModelRunRepositoryPort";
import type { MultimodalUnderstandingPort } from "../ports/MultimodalUnderstandingPort";
import type {
  OcrPort,
  OcrProcessingResult
} from "../ports/OcrPort";
import type { AudioFileTranscriptionPort } from "../ports/TranscriptionPort";
import type { SliceUnderstandingCachePort } from "../ports/SliceUnderstandingCachePort";
import type { ReportRepositoryPort } from "../ports/ReportRepositoryPort";
import type {
  StoredVideoAsset,
  VideoStoragePort
} from "../ports/VideoStoragePort";
import {
  VideoAnalysisJobAggregate,
  type VideoAnalysisJobSnapshot
} from "../../domain/jobs/VideoAnalysisJob";
import type {
  Category,
  TranscriptionResult,
  UploadedVideoAnalysis,
  VideoObservation
} from "../../domain/types";
import {
  createMultimodalUnderstanding,
  type AiDramaUnderstanding,
  ModelExecutionSummary,
  MultimodalUnderstanding,
  type MultimodalVideoContentType,
  type MultimodalVisualCraft,
  SliceVisualObservation
} from "../../domain/multimodalIntelligence/MultimodalUnderstanding";
import {
  createVideoEvidenceBundle,
  type EvidenceModalityAvailability,
  type ReasoningClaim,
  type ReasoningEvidenceRef,
  type TimelineSlice,
  type VideoEvidenceBundle
} from "../../domain/multimodalIntelligence/VideoEvidence";
import { analyzeUploadedVideo } from "./analyzeUploadedVideo";
import {
  createModelRunCacheKey,
  hashModelRunInput
} from "../modelRunCacheKey";
import {
  buildVideoEvidenceBundle,
  type BuildVideoEvidenceBundleResult
} from "./buildVideoEvidenceBundle";
import {
  reasonAboutVideo,
  type ReasonAboutVideoResult
} from "./reasonAboutVideo";
import { recognizeFrameSubtitles } from "./recognizeFrameSubtitles";
import { selectMultimodalModelProvider } from "./selectMultimodalModelProvider";
import { transcribeUploadedAudio } from "./transcribeUploadedAudio";
import { understandUploadedVideo } from "./understandUploadedVideo";
import {
  understandVideoSlices,
  type SliceUnderstandingCacheOutcome,
  type UnderstandVideoSlicesResult
} from "./understandVideoSlices";

export interface RunVideoAnalysisJobRequest {
  assetId: string;
  jobId: string;
  fileName: string;
  data?: Buffer;
  storedAsset?: StoredVideoAsset;
  category: Category;
  hotspot: string;
  title: string;
  fallbackTranscript: string;
  commentSignals: string;
  creatorPositioning: string;
  referenceTexts: string[];
}

export interface RunVideoAnalysisJobDependencies {
  jobRepository: JobRepositoryPort;
  errorLog: ErrorLogPort;
  reportRepository: ReportRepositoryPort;
  videoStorage: VideoStoragePort;
  workspace: MediaWorkspacePort;
  mediaProbe: MediaProbePort;
  audioExtractor: AudioExtractorPort;
  frameSampler: FrameSamplerPort;
  frameCatalog: FrameCatalogPort;
  transcriber: AudioFileTranscriptionPort;
  ocr: OcrPort;
  multimodalUnderstanding: MultimodalUnderstandingPort;
  contentReasoner: ContentReasoningPort;
  differentiator: DifferentiationPort;
  knowledgeRepository: KnowledgeRepositoryPort;
  modelRunRepository: ModelRunRepositoryPort;
  sliceUnderstandingCache?: SliceUnderstandingCachePort;
  modelPolicy?: ModelPolicy;
}

interface RunVideoAnalysisJobOptions {
  request: RunVideoAnalysisJobRequest;
  dependencies: RunVideoAnalysisJobDependencies;
  traceId: string;
  initialJob?: VideoAnalysisJobSnapshot;
  now?: () => string;
}

export interface RunVideoAnalysisJobResult {
  asset: {
    id: string;
    fileName: string;
    storagePath: string;
    uploadedAt: string;
  };
  job: VideoAnalysisJobSnapshot;
  mediaProcessing: {
    probe: MediaProbeResult;
    audio: AudioExtractionResult;
    frames: FrameSamplingResult;
    frameDirectory: string;
  };
  transcription: TranscriptionResult;
  ocr: OcrProcessingResult;
  evidenceBundle: BuildVideoEvidenceBundleResult;
  sliceUnderstanding: UnderstandVideoSlicesResult;
  videoReasoning: ReasonAboutVideoResult;
  multimodalUnderstanding?: MultimodalUnderstanding;
  frameSamples: FrameSampleAsset[];
  videoObservation: VideoObservation;
  analysis: UploadedVideoAnalysis;
}

interface ModelLimitedEvidenceBundle extends BuildVideoEvidenceBundleResult {
  modelInputSeconds: number;
}

export class VideoAnalysisJobExecutionError extends Error {
  constructor(
    message: string,
    readonly job: VideoAnalysisJobSnapshot,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "VideoAnalysisJobExecutionError";
  }
}

const DEFAULT_MULTIMODAL_MODEL_POLICY: ModelPolicy = {
  mode: "balanced",
  allowCloudUpload: true,
  maxFrames: 80,
  maxVideoSeconds: 120,
  timeoutMs: 30_000,
  maxRetries: 1
};

export async function runVideoAnalysisJob({
  request,
  dependencies,
  traceId,
  initialJob,
  now = () => new Date().toISOString()
}: RunVideoAnalysisJobOptions): Promise<RunVideoAnalysisJobResult> {
  const uploadedAt = initialJob?.createdAt ?? now();
  const job = initialJob
    ? VideoAnalysisJobAggregate.restore(initialJob)
    : VideoAnalysisJobAggregate.create({
        id: request.jobId,
        videoId: request.assetId,
        createdAt: uploadedAt
      });
  let lastPersistedJob = initialJob ?? job.toSnapshot();

  if (initialJob && isTerminalJob(initialJob)) {
    const message = `Video analysis job is already ${initialJob.status} and cannot be rerun.`;
    await appendFatalError(dependencies.errorLog, {
      traceId,
      jobId: request.jobId,
      code: "SYSTEM_VIDEO_ANALYSIS_TERMINAL_JOB_RERUN_REJECTED",
      stage: initialJob.status,
      message,
      detail: {
        job: initialJob
      },
      timestamp: now()
    });
    throw new VideoAnalysisJobExecutionError(message, initialJob);
  }

  try {
    if (!initialJob) {
      lastPersistedJob = job.toSnapshot();
      await dependencies.jobRepository.save(lastPersistedJob);
    }

    const asset =
      request.storedAsset ??
      await saveRequestedVideo(request, dependencies.videoStorage);

    lastPersistedJob = await advanceAndSave(
      job,
      "extracting_audio",
      dependencies.jobRepository,
      now
    );
    const mediaProbe = await dependencies.mediaProbe.probe({
      videoPath: asset.storagePath
    });
    if (mediaProbe.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: "SOURCE_MEDIA_PROBE_UNAVAILABLE",
        stage: "extracting_audio",
        message: mediaProbe.reason,
        timestamp: now()
      });
    }

    const workspace = await dependencies.workspace.prepare(request.assetId);
    const audio = await dependencies.audioExtractor.extractAudio({
      videoPath: asset.storagePath,
      outputPath: workspace.audioPath
    });
    if (audio.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: "SYSTEM_AUDIO_EXTRACTION_FAILED",
        stage: "extracting_audio",
        message: audio.reason ?? "Audio extraction failed.",
        timestamp: now()
      });
    }

    lastPersistedJob = await advanceAndSave(
      job,
      "transcribing",
      dependencies.jobRepository,
      now
    );
    const transcription = await transcribeWithFallback({
      request,
      audio,
      transcriber: dependencies.transcriber,
      errorLog: dependencies.errorLog,
      traceId,
      now
    });

    lastPersistedJob = await advanceAndSave(
      job,
      "sampling_frames",
      dependencies.jobRepository,
      now
    );
    const frames = await dependencies.frameSampler.sampleFrames({
      videoPath: asset.storagePath,
      outputPattern: workspace.framePattern,
      everySeconds: workspace.everySeconds
    });
    if (frames.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: "SYSTEM_FRAME_SAMPLING_FAILED",
        stage: "sampling_frames",
        message: frames.reason ?? "Frame sampling failed.",
        timestamp: now()
      });
    }

    const frameSamples = await dependencies.frameCatalog.listFrames({
      frameDirectory: workspace.frameDirectory,
      everySeconds: workspace.everySeconds
    });
    const ocr = await recognizeFrameSubtitles({
      frames: frameSamples,
      ocr: dependencies.ocr
    });
    if (ocr.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: "SOURCE_OCR_UNAVAILABLE",
        stage: "sampling_frames",
        message: ocr.reason ?? "OCR service failed.",
        timestamp: now()
      });
    }

    const durationSeconds = resolveEvidenceDurationSeconds({
      mediaProbe,
      transcription,
      frameSamples,
      frameSampling: frames
    });
    const evidenceBundle = buildVideoEvidenceBundle({
      jobId: request.jobId,
      videoId: request.assetId,
      durationSeconds,
      transcription,
      frames: frameSamples,
      frameSampling: frames,
      ocr
    });
    const modelPolicy =
      dependencies.modelPolicy ?? DEFAULT_MULTIMODAL_MODEL_POLICY;
    const modelEvidenceBundle = limitEvidenceBundleForModelPolicy({
      evidenceBundle,
      policy: modelPolicy
    });

    if (job.toSnapshot().workflowVersion === 2) {
      lastPersistedJob = await advanceAndSave(
        job,
        "visually_understanding",
        dependencies.jobRepository,
        now
      );
    }
    const sliceModelSelection = selectSliceModelRunProvider({
      multimodal: dependencies.multimodalUnderstanding,
      policy: modelPolicy,
      frameCount: modelEvidenceBundle.bundle.frameEvidence.length,
      videoSeconds: modelEvidenceBundle.modelInputSeconds
    });
    await appendModelProviderSelectionDiagnostic({
      traceId,
      jobId: request.jobId,
      stage: "visually_understanding",
      result: sliceModelSelection,
      errorLog: dependencies.errorLog,
      now
    });
    const sliceUnderstanding = await understandVideoSlices({
      evidenceBundle: modelEvidenceBundle.bundle,
      frameAssets: modelEvidenceBundle.frameAssets,
      multimodal: dependencies.multimodalUnderstanding,
      cache: dependencies.sliceUnderstandingCache,
      now
    });
    await persistSliceModelRuns({
      traceId,
      jobId: request.jobId,
      observations: sliceUnderstanding.observations,
      executions: sliceUnderstanding.executions,
      cacheOutcomes: sliceUnderstanding.cacheOutcomes,
      selection: sliceModelSelection.selection,
      modelRunRepository: dependencies.modelRunRepository,
      errorLog: dependencies.errorLog,
      now
    });
    await appendSliceCacheDiagnostics({
      traceId,
      jobId: request.jobId,
      cacheStats: sliceUnderstanding.cacheStats,
      cacheOutcomes: sliceUnderstanding.cacheOutcomes,
      errorLog: dependencies.errorLog,
      now
    });
    if (sliceUnderstanding.status !== "completed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code:
          sliceUnderstanding.status === "partial"
            ? "ANALYSIS_VIDEO_REASONING_PARTIAL"
            : "SOURCE_MULTIMODAL_MODEL_UNAVAILABLE",
        stage: "visually_understanding",
        message:
          sliceUnderstanding.failures[0]?.reason ??
          "Multimodal slice understanding was partial or unavailable.",
        detail: {
          status: sliceUnderstanding.status,
          failures: sliceUnderstanding.failures
        },
        timestamp: now()
      });
    }

    const videoObservation = understandUploadedVideo({
      transcript: transcription.fullText,
      frames: frameSamples,
      ocrTexts: ocr.signals
    });

    if (job.toSnapshot().workflowVersion === 2) {
      lastPersistedJob = await advanceAndSave(
        job,
        "reasoning",
        dependencies.jobRepository,
        now
      );
    }
    const reasoningModelSelection = selectReasoningModelRunProvider({
      reasoner: dependencies.contentReasoner,
      policy: modelPolicy,
      frameCount: modelEvidenceBundle.bundle.frameEvidence.length,
      videoSeconds: modelEvidenceBundle.modelInputSeconds
    });
    await appendModelProviderSelectionDiagnostic({
      traceId,
      jobId: request.jobId,
      stage: "reasoning",
      result: reasoningModelSelection,
      errorLog: dependencies.errorLog,
      now
    });
    const videoReasoning = await reasonAboutVideo({
      evidenceBundle: modelEvidenceBundle.bundle,
      sliceObservations: sliceUnderstanding.observations,
      coverage: sliceUnderstanding.coverage,
      reasoner: dependencies.contentReasoner
    });
    const multimodalUnderstanding =
      videoReasoning.status === "completed"
        ? videoReasoning.understanding
        : createSliceOnlyMultimodalUnderstanding({
            request,
            evidenceBundle: modelEvidenceBundle.bundle,
            sliceUnderstanding
          });
    if (multimodalUnderstanding) {
      await persistModelRunSafely({
        run: createModelRunRecord({
          id: "run_reasoning_video",
          traceId,
          jobId: request.jobId,
          stage: "reasoning",
          execution: multimodalUnderstanding.execution,
          input: {
            jobId: request.jobId,
            videoId: request.assetId,
            sliceObservationIds: sliceUnderstanding.observations.map(
              (observation) => observation.id
            ),
            coverage: sliceUnderstanding.coverage
          },
          startedAt: now(),
          selection: reasoningModelSelection.selection
        }),
        modelRunRepository: dependencies.modelRunRepository,
        errorLog: dependencies.errorLog,
        now
      });
    }
    if (videoReasoning.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: videoReasoning.code,
        stage: "reasoning",
        message: videoReasoning.reason,
        timestamp: now()
      });
    }

    lastPersistedJob = await advanceAndSave(
      job,
      "retrieving_knowledge",
      dependencies.jobRepository,
      now
    );
    lastPersistedJob = await advanceAndSave(
      job,
      "evaluating",
      dependencies.jobRepository,
      now
    );
    const analysis = await analyzeUploadedVideo({
      input: {
        category: request.category,
        hotspot: request.hotspot,
        title: request.title,
        transcript: transcription.fullText,
        commentSignals: request.commentSignals,
        creatorPositioning: request.creatorPositioning
      },
      differentiator: dependencies.differentiator,
      knowledgeRepository: dependencies.knowledgeRepository,
      referenceTexts: request.referenceTexts,
      reportContext: {
        jobId: request.jobId,
        videoId: request.assetId,
        filename: request.fileName
      },
      videoObservation,
      multimodalUnderstanding,
      analysisMode: resolveAnalysisMode({
        multimodalUnderstanding,
        transcription
      })
    });
    if (analysis.knowledgeRetrieval.status === "failed") {
      await appendRecoverableError(dependencies.errorLog, {
        traceId,
        jobId: request.jobId,
        code: "SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE",
        stage: "retrieving_knowledge",
        message:
          analysis.knowledgeRetrieval.reason ??
          "Knowledge retrieval failed without a reason.",
        timestamp: now()
      });
    }
    await dependencies.reportRepository.save(analysis.report);

    lastPersistedJob = await advanceAndSave(
      job,
      "completed",
      dependencies.jobRepository,
      now
    );

    return {
      asset: {
        ...asset,
        uploadedAt
      },
      job: lastPersistedJob,
      mediaProcessing: {
        probe: mediaProbe,
        audio,
        frames,
        frameDirectory: workspace.frameDirectory
      },
      transcription,
      ocr,
      evidenceBundle,
      sliceUnderstanding,
      videoReasoning,
      multimodalUnderstanding,
      frameSamples,
      videoObservation,
      analysis
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected video analysis failure.";
    const failedAt = now();
    const failedJob = VideoAnalysisJobAggregate.restore(lastPersistedJob);
    failedJob.fail(
      {
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        message
      },
      failedAt
    );
    const failedSnapshot = failedJob.toSnapshot();
    const failedJobPersistenceError = await persistFailedJobSafely(
      dependencies.jobRepository,
      failedSnapshot
    );
    await appendFatalError(dependencies.errorLog, {
      traceId,
      jobId: request.jobId,
      code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
      stage: failedSnapshot.failure?.stage ?? "unknown",
      message,
      detail: {
        originalError: serializeErrorDetail(error),
        failedJobPersistenceError: failedJobPersistenceError
          ? serializeErrorDetail(failedJobPersistenceError)
          : undefined
      },
      timestamp: failedAt
    });
    throw new VideoAnalysisJobExecutionError(message, failedSnapshot, {
      cause: error
    });
  }
}

async function persistSliceModelRuns({
  traceId,
  jobId,
  observations,
  executions,
  cacheOutcomes,
  selection,
  modelRunRepository,
  errorLog,
  now
}: {
  traceId: string;
  jobId: string;
  observations: SliceVisualObservation[];
  executions: ModelExecutionSummary[];
  cacheOutcomes: SliceUnderstandingCacheOutcome[];
  selection?: ModelRunSelectionMetadata;
  modelRunRepository: ModelRunRepositoryPort;
  errorLog: ErrorLogPort;
  now: () => string;
}): Promise<void> {
  const cacheOutcomesBySlice = new Map(
    cacheOutcomes.map((outcome) => [outcome.sliceId, outcome])
  );

  for (const [index, observation] of observations.entries()) {
    const execution = executions[index];
    if (!execution) {
      continue;
    }
    const cacheOutcome = cacheOutcomesBySlice.get(observation.sliceId);

    await persistModelRunSafely({
      run: createModelRunRecord({
        id: `run_slice_${observation.sliceId}`,
        traceId,
        jobId,
        stage: "visually_understanding",
        sliceId: observation.sliceId,
        execution,
        input: {
          sliceId: observation.sliceId,
            startMs: observation.startMs,
            endMs: observation.endMs,
            claimIds: observation.claims.map((claim) => claim.id)
          },
        startedAt: now(),
        inputHash: cacheOutcome?.inputHash,
        cacheKey: cacheOutcome?.cacheKey,
        cache: cacheOutcome
          ? {
              status: cacheOutcome.status,
              savedModelCall: cacheOutcome.savedModelCall,
              readFailed: cacheOutcome.readFailed,
              writeFailed: cacheOutcome.writeFailed,
              cachedAt: cacheOutcome.cachedAt
            }
          : undefined,
        selection
      }),
      modelRunRepository,
      errorLog,
      now
    });
  }
}

async function appendSliceCacheDiagnostics({
  traceId,
  jobId,
  cacheStats,
  cacheOutcomes,
  errorLog,
  now
}: {
  traceId: string;
  jobId: string;
  cacheStats: UnderstandVideoSlicesResult["cacheStats"];
  cacheOutcomes: SliceUnderstandingCacheOutcome[];
  errorLog: ErrorLogPort;
  now: () => string;
}): Promise<void> {
  if (cacheStats.readFailures > 0) {
    await appendRecoverableError(errorLog, {
      traceId,
      jobId,
      code: "SYSTEM_SLICE_UNDERSTANDING_CACHE_READ_FAILED",
      stage: "visually_understanding",
      message:
        "Slice understanding cache read failed; continued with model analysis.",
      detail: {
        readFailures: cacheStats.readFailures,
        cacheStats,
        affectedSlices: cacheOutcomes
          .filter((outcome) => outcome.readFailed)
          .map((outcome) => outcome.sliceId)
      },
      timestamp: now()
    });
  }

  if (cacheStats.writeFailures > 0) {
    await appendRecoverableError(errorLog, {
      traceId,
      jobId,
      code: "SYSTEM_SLICE_UNDERSTANDING_CACHE_WRITE_FAILED",
      stage: "visually_understanding",
      message:
        "Slice understanding cache write failed; analysis continued without caching some slices.",
      detail: {
        writeFailures: cacheStats.writeFailures,
        cacheStats,
        affectedSlices: cacheOutcomes
          .filter((outcome) => outcome.writeFailed)
          .map((outcome) => outcome.sliceId)
      },
      timestamp: now()
    });
  }
}

async function persistModelRunSafely({
  run,
  modelRunRepository,
  errorLog,
  now
}: {
  run: ModelRunRecord;
  modelRunRepository: ModelRunRepositoryPort;
  errorLog: ErrorLogPort;
  now: () => string;
}): Promise<void> {
  try {
    await modelRunRepository.save(run);
  } catch (error) {
    await appendRecoverableError(errorLog, {
      traceId: run.traceId,
      jobId: run.jobId,
      code: "SYSTEM_MODEL_RUN_PERSISTENCE_FAILED",
      stage: run.stage,
      message:
        error instanceof Error ? error.message : "Model run persistence failed.",
      detail: {
        modelRunId: run.id,
        provider: run.provider,
        model: run.model
      },
      timestamp: now()
    });
  }
}

function createModelRunRecord({
  id,
  traceId,
  jobId,
  stage,
  sliceId,
  execution,
  input,
  startedAt,
  inputHash: providedInputHash,
  cacheKey: providedCacheKey,
  cache,
  selection
}: {
  id: string;
  traceId: string;
  jobId: string;
  stage: ModelRunStage;
  sliceId?: string;
  execution: ModelExecutionSummary;
  input: unknown;
  startedAt: string;
  inputHash?: string;
  cacheKey?: string;
  cache?: ModelRunCacheMetadata;
  selection?: ModelRunSelectionMetadata;
}): ModelRunRecord {
  const inputHash = providedInputHash ?? hashModelRunInput(input);
  const cacheKey =
    providedCacheKey ??
    createModelRunCacheKey({
      inputHash,
      model: execution.model,
      promptVersion: execution.promptVersion,
      schemaVersion: execution.schemaVersion
    });

  return {
    id,
    traceId,
    jobId,
    stage,
    sliceId,
    provider: execution.provider,
    model: execution.model,
    promptVersion: execution.promptVersion,
    schemaVersion: execution.schemaVersion,
    inputHash,
    cacheKey,
    startedAt,
    latencyMs: execution.latencyMs,
    retryCount: 0,
    status: execution.status,
    partial: execution.partial,
    cache,
    selection,
    usage: execution.usage
  };
}

function limitEvidenceBundleForModelPolicy({
  evidenceBundle,
  policy
}: {
  evidenceBundle: BuildVideoEvidenceBundleResult;
  policy: ModelPolicy;
}): ModelLimitedEvidenceBundle {
  const bundle = evidenceBundle.bundle;
  const modelInputDurationMs = Math.min(
    bundle.durationMs,
    Math.max(1, Math.round(policy.maxVideoSeconds * 1000))
  );
  const selectedFrameAssets = evidenceBundle.frameAssets
    .filter((frame) => isTimestampWithinModelInput(frame.timestampMs, modelInputDurationMs, bundle.durationMs))
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .slice(0, policy.maxFrames);
  const selectedFrameIds = new Set(selectedFrameAssets.map((frame) => frame.id));
  const transcriptSegments = bundle.transcriptSegments
    .filter((segment) => segment.startMs < modelInputDurationMs && segment.endMs > 0)
    .map((segment) => ({
      ...segment,
      startMs: Math.max(0, segment.startMs),
      endMs: Math.min(segment.endMs, modelInputDurationMs)
    }))
    .filter((segment) => segment.endMs > segment.startMs);
  const transcriptIds = new Set(transcriptSegments.map((segment) => segment.id));
  const ocrEvidence = bundle.ocrEvidence.filter(
    (item) =>
      selectedFrameIds.has(item.frameId) &&
      isTimestampWithinModelInput(item.timestampMs, modelInputDurationMs, bundle.durationMs)
  );
  const ocrIds = new Set(ocrEvidence.map((item) => item.id));
  const timelineSlices = bundle.timelineSlices
    .filter((slice) => slice.startMs < modelInputDurationMs && slice.endMs > 0)
    .map((slice): TimelineSlice => ({
      ...slice,
      endMs: Math.min(slice.endMs, modelInputDurationMs),
      frameIds: slice.frameIds.filter((frameId) => selectedFrameIds.has(frameId)),
      transcriptSegmentIds: slice.transcriptSegmentIds.filter((segmentId) =>
        transcriptIds.has(segmentId)
      ),
      ocrEvidenceIds: slice.ocrEvidenceIds.filter((ocrId) => ocrIds.has(ocrId))
    }))
    .filter((slice) => slice.endMs > slice.startMs);

  return {
    bundle: createVideoEvidenceBundle({
      jobId: bundle.jobId,
      videoId: bundle.videoId,
      durationMs: bundle.durationMs,
      modalities: {
        transcript: resolvePolicyWindowModality(
          bundle.modalities.transcript,
          transcriptSegments.length > 0,
          "transcript"
        ),
        frames: resolvePolicyWindowModality(
          bundle.modalities.frames,
          selectedFrameAssets.length > 0,
          "frame"
        ),
        ocr: resolvePolicyWindowModality(
          bundle.modalities.ocr,
          ocrEvidence.length > 0,
          "OCR"
        )
      },
      transcriptSegments,
      frameEvidence: selectedFrameAssets.map(({ id, timestampMs }) => ({
        id,
        timestampMs
      })),
      ocrEvidence,
      timelineSlices
    }),
    frameAssets: selectedFrameAssets,
    modelInputSeconds: modelInputDurationMs / 1000
  };
}

function isTimestampWithinModelInput(
  timestampMs: number,
  modelInputDurationMs: number,
  fullDurationMs: number
): boolean {
  return (
    timestampMs < modelInputDurationMs ||
    (modelInputDurationMs === fullDurationMs && timestampMs <= modelInputDurationMs)
  );
}

function resolvePolicyWindowModality(
  original: EvidenceModalityAvailability,
  hasEvidence: boolean,
  label: string
): EvidenceModalityAvailability {
  if (hasEvidence || original.status !== "available") {
    return { ...original };
  }
  return {
    status: "missing",
    reason: `No ${label} evidence remains inside the model policy window.`
  };
}

function selectSliceModelRunProvider({
  multimodal,
  policy,
  frameCount,
  videoSeconds
}: {
  multimodal: MultimodalUnderstandingPort;
  policy: ModelPolicy;
  frameCount: number;
  videoSeconds: number;
}): ModelRunProviderSelectionResult {
  return selectModelRunProvider({
    profile: multimodal.getModelProviderProfile?.(),
    policy,
    frameCount,
    videoSeconds
  });
}

function selectReasoningModelRunProvider({
  reasoner,
  policy,
  frameCount,
  videoSeconds
}: {
  reasoner: ContentReasoningPort;
  policy: ModelPolicy;
  frameCount: number;
  videoSeconds: number;
}): ModelRunProviderSelectionResult {
  return selectModelRunProvider({
    profile: reasoner.getModelProviderProfile?.(),
    policy,
    frameCount,
    videoSeconds
  });
}

interface ModelRunProviderSelectionResult {
  selection?: ModelRunSelectionMetadata;
  diagnostic?: {
    reason: string;
    policy: ModelPolicy;
    requestedInput: RequestedMultimodalInput;
    rejectedCandidates?: Array<{
      id: string;
      reasons: string[];
    }>;
  };
}

function selectModelRunProvider({
  profile,
  policy,
  frameCount,
  videoSeconds
}: {
  profile?: ModelProviderProfile;
  policy: ModelPolicy;
  frameCount: number;
  videoSeconds: number;
}): ModelRunProviderSelectionResult {
  const requestedInput = {
    frameCount,
    videoSeconds
  };

  if (!profile) {
    return {
      diagnostic: {
        reason: "provider_profile_unavailable",
        policy,
        requestedInput
      }
    };
  }

  const selection = selectMultimodalModelProvider({
    policy,
    requestedInput,
    candidates: [profile]
  });

  if (selection.status !== "selected") {
    return {
      diagnostic: {
        reason: selection.reason,
        policy,
        requestedInput,
        rejectedCandidates: selection.rejectedCandidates
      }
    };
  }

  return {
    selection: {
      policyMode: policy.mode,
      providerProfileId: selection.profile.id,
      route: selection.profile.route,
      effectiveFrameCount: selection.effectiveInput.frameCount,
      effectiveVideoSeconds: selection.effectiveInput.videoSeconds,
      estimatedCost: selection.profile.estimatedCost,
      costBudget: policy.costBudget,
      allowCloudUpload: policy.allowCloudUpload,
      requiresCloudUpload: selection.profile.requiresCloudUpload,
      reason: selection.reason
    }
  };
}

async function appendModelProviderSelectionDiagnostic({
  traceId,
  jobId,
  stage,
  result,
  errorLog,
  now
}: {
  traceId: string;
  jobId: string;
  stage: Extract<ModelRunStage, "visually_understanding" | "reasoning">;
  result: ModelRunProviderSelectionResult;
  errorLog: ErrorLogPort;
  now: () => string;
}): Promise<void> {
  if (!result.diagnostic) {
    return;
  }

  await appendRecoverableError(errorLog, {
    traceId,
    jobId,
    code: "SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE",
    stage,
    message:
      `Multimodal provider selection metadata is unavailable for ${stage}.`,
    detail: result.diagnostic,
    timestamp: now()
  });
}

function resolveAnalysisMode({
  multimodalUnderstanding,
  transcription
}: {
  multimodalUnderstanding?: MultimodalUnderstanding;
  transcription: TranscriptionResult;
}): "multimodal" | "text_only" | "rules_fallback" {
  if (multimodalUnderstanding) {
    return "multimodal";
  }
  return transcription.fullText.trim().length > 0
    ? "text_only"
    : "rules_fallback";
}

function createSliceOnlyMultimodalUnderstanding({
  request,
  evidenceBundle,
  sliceUnderstanding
}: {
  request: RunVideoAnalysisJobRequest;
  evidenceBundle: VideoEvidenceBundle;
  sliceUnderstanding: UnderstandVideoSlicesResult;
}): MultimodalUnderstanding | undefined {
  const observations = sliceUnderstanding.observations;
  const firstReference = observations[0]?.claims[0]?.evidenceRefs[0];
  if (!firstReference) {
    return undefined;
  }

  const candidate: MultimodalUnderstanding = {
    jobId: request.jobId,
    videoId: request.assetId,
    contentType: inferSliceOnlyContentType(request, observations),
    scenes: observations,
    narrative: {
      premise: createSliceOnlyClaim(
        "slice_only_premise",
        `基于抽帧切片的画面理解：${summarizeSliceObservations(observations)}`,
        firstReference,
        0.68
      ),
      hook: createSliceOnlyClaim(
        "slice_only_hook",
        `开场画面钩子：${observations[0].summary}`,
        firstReference,
        0.64
      )
    },
    visualCraft: createSliceOnlyVisualCraft(observations, firstReference),
    aiDrama: createSliceOnlyAiDrama(observations, firstReference),
    evidenceCoverage: sliceUnderstanding.coverage,
    execution: createSliceOnlyExecution(sliceUnderstanding.executions)
  };

  try {
    return createMultimodalUnderstanding(candidate, evidenceBundle);
  } catch {
    return undefined;
  }
}

function createSliceOnlyVisualCraft(
  observations: SliceVisualObservation[],
  evidenceRef: ReasoningEvidenceRef
): MultimodalVisualCraft {
  const shotTypes = uniqueStrings(
    observations.flatMap((observation) => observation.shotTypes)
  );
  const subjects = uniqueStrings(
    observations.flatMap((observation) => observation.visibleSubjects)
  );

  return {
    composition: [
      createSliceOnlyClaim(
        "slice_only_composition",
        subjects.length > 0
          ? `抽样画面主体/道具：${subjects.slice(0, 8).join("、")}。`
          : "抽样画面已经能支撑基础场景理解。",
        evidenceRef,
        0.64
      )
    ],
    shotVariety: [
      createSliceOnlyClaim(
        "slice_only_shot_variety",
        shotTypes.length > 0
          ? `识别到的镜头类型：${shotTypes.slice(0, 8).join("、")}。`
          : "镜头丰富度还需要更多有效抽帧证据。",
        evidenceRef,
        0.62
      )
    ],
    continuity: [],
    subtitleLegibility: observations.some(
      (observation) => observation.subtitleLegibility === "clear"
    )
      ? [
          createSliceOnlyClaim(
            "slice_only_subtitle",
            "至少一个抽样切片包含清晰字幕证据。",
            evidenceRef,
            0.62
          )
        ]
      : [],
    styleConsistency: [],
    pacing: [
      createSliceOnlyClaim(
        "slice_only_pacing",
        `画面分析覆盖 ${observations.length} 个抽样切片，分镜节奏基于已采样场景估算。`,
        evidenceRef,
        0.6
      )
    ]
  };
}

function createSliceOnlyAiDrama(
  observations: SliceVisualObservation[],
  evidenceRef: ReasoningEvidenceRef
): AiDramaUnderstanding | undefined {
  const signals = uniqueStrings(
    observations.flatMap((observation) => observation.aiDramaSignals)
  ).filter((signal) => signal !== "not_observed");
  if (signals.length === 0) {
    return undefined;
  }

  return {
    conflict: [
      createSliceOnlyClaim(
        "slice_only_ai_conflict",
        `抽样切片识别到的 AI 漫剧信号：${signals.slice(0, 6).map(formatSliceAiDramaSignal).join("、")}。`,
        evidenceRef,
        0.62
      )
    ],
    reversals: signals.some((signal) => /reversal|identity/i.test(signal))
      ? [
          createSliceOnlyClaim(
            "slice_only_ai_reversal",
            "切片证据显示内容存在反转或身份驱动钩子。",
            evidenceRef,
            0.62
          )
        ]
      : [],
    styleDrift: [],
    seriesPotential: createSliceOnlyClaim(
      "slice_only_ai_series",
      "当前画面设定具备延展为后续剧情节拍的潜力。",
      evidenceRef,
      0.58
    )
  };
}

function createSliceOnlyExecution(
  executions: ModelExecutionSummary[]
): ModelExecutionSummary {
  const firstExecution = executions.find(
    (execution) => execution.status === "completed"
  ) ?? executions[0];
  const usage = aggregateUsage(executions);

  return {
    provider: firstExecution?.provider ?? "slice_only",
    model: firstExecution?.model ?? "slice-observation",
    promptVersion: "slice-only-reasoning-fallback-v1",
    schemaVersion: "multimodal-video-v1",
    latencyMs: executions.reduce(
      (total, execution) => total + execution.latencyMs,
      0
    ),
    status: "completed",
    partial: true,
    usage
  };
}

function createSliceOnlyClaim(
  id: string,
  statement: string,
  evidenceRef: ReasoningEvidenceRef,
  confidence: number
): ReasoningClaim {
  return {
    id,
    type: "inference",
    statement,
    confidence,
    evidenceRefs: [cloneEvidenceRef(evidenceRef)],
    knowledgeIds: []
  };
}

function inferSliceOnlyContentType(
  request: RunVideoAnalysisJobRequest,
  observations: SliceVisualObservation[]
): MultimodalVideoContentType {
  const text = [
    request.title,
    request.hotspot,
    request.fallbackTranscript,
    observations.flatMap((observation) => observation.aiDramaSignals).join(" ")
  ].join(" ").toLowerCase();

  if (/ai drama|drama|reversal|identity|cliffhanger|next episode/.test(text)) {
    return "ai_drama";
  }
  return observations.length > 1 ? "mixed" : "unknown";
}

function summarizeSliceObservations(
  observations: SliceVisualObservation[]
): string {
  return observations
    .map((observation) => observation.summary)
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ") || "已验证的抽样画面证据";
}

function formatSliceAiDramaSignal(signal: string): string {
  const normalizedSignal = signal.trim().toLowerCase();
  if (normalizedSignal === "conflict_or_reversal") {
    return "冲突或反转";
  }
  if (normalizedSignal === "series_hook") {
    return "续集钩子";
  }
  if (normalizedSignal.includes("identity")) {
    return "身份反转";
  }
  if (normalizedSignal.includes("reversal")) {
    return "反转钩子";
  }
  if (normalizedSignal.includes("conflict")) {
    return "冲突信号";
  }
  if (normalizedSignal.includes("cliffhanger")) {
    return "悬念钩子";
  }
  return signal.replace(/_/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function aggregateUsage(
  executions: ModelExecutionSummary[]
): ModelExecutionSummary["usage"] | undefined {
  const usage = executions.reduce(
    (total, execution) => ({
      inputTokens: total.inputTokens + (execution.usage?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (execution.usage?.outputTokens ?? 0),
      imageCount: total.imageCount + (execution.usage?.imageCount ?? 0),
      frameCount: total.frameCount + (execution.usage?.frameCount ?? 0)
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      imageCount: 0,
      frameCount: 0
    }
  );

  return Object.values(usage).some((value) => value > 0) ? usage : undefined;
}

function cloneEvidenceRef(reference: ReasoningEvidenceRef): ReasoningEvidenceRef {
  return {
    startMs: reference.startMs,
    endMs: reference.endMs,
    frameIds: [...reference.frameIds],
    transcriptSegmentIds: [...reference.transcriptSegmentIds],
    ocrEvidenceIds: [...reference.ocrEvidenceIds]
  };
}

function isTerminalJob(job: VideoAnalysisJobSnapshot): boolean {
  return job.status === "completed" || job.status === "failed";
}

function resolveEvidenceDurationSeconds({
  mediaProbe,
  transcription,
  frameSamples,
  frameSampling
}: {
  mediaProbe: MediaProbeResult;
  transcription: TranscriptionResult;
  frameSamples: FrameSampleAsset[];
  frameSampling: FrameSamplingResult;
}): number {
  if (mediaProbe.status === "completed") {
    return mediaProbe.durationSeconds;
  }

  if (
    Number.isFinite(transcription.duration) &&
    transcription.duration &&
    transcription.duration > 0
  ) {
    return transcription.duration;
  }

  const transcriptEnd = transcription.segments.reduce(
    (maxEnd, segment) => Math.max(maxEnd, segment.end),
    0
  );
  if (transcriptEnd > 0) {
    return transcriptEnd;
  }

  const lastFrame = [...frameSamples].sort(
    (left, right) => right.timestampSeconds - left.timestampSeconds
  )[0];
  if (lastFrame) {
    return Math.max(1, lastFrame.timestampSeconds + frameSampling.everySeconds);
  }

  return 60;
}

async function saveRequestedVideo(
  request: RunVideoAnalysisJobRequest,
  storage: VideoStoragePort
): Promise<StoredVideoAsset> {
  if (!request.data) {
    throw new Error(
      "Video analysis requires uploaded video data or an existing stored asset."
    );
  }

  return storage.saveVideo({
    id: request.assetId,
    fileName: request.fileName,
    data: request.data
  });
}

async function advanceAndSave(
  job: VideoAnalysisJobAggregate,
  status: Parameters<VideoAnalysisJobAggregate["advance"]>[0],
  repository: JobRepositoryPort,
  now: () => string
): Promise<VideoAnalysisJobSnapshot> {
  job.advance(status, now());
  const snapshot = job.toSnapshot();
  await repository.save(snapshot);
  return snapshot;
}

async function persistFailedJobSafely(
  repository: JobRepositoryPort,
  job: VideoAnalysisJobSnapshot
): Promise<unknown | undefined> {
  try {
    await repository.save(job);
    return undefined;
  } catch (error) {
    console.error("Failed to persist failed video analysis job.", {
      job,
      persistenceError: serializeErrorDetail(error)
    });
    return error;
  }
}

async function transcribeWithFallback({
  request,
  audio,
  transcriber,
  errorLog,
  traceId,
  now
}: {
  request: RunVideoAnalysisJobRequest;
  audio: AudioExtractionResult;
  transcriber: AudioFileTranscriptionPort;
  errorLog: ErrorLogPort;
  traceId: string;
  now: () => string;
}): Promise<TranscriptionResult> {
  if (!audio.audioPath) {
    return transcribeUploadedAudio({
      audioPath: "",
      title: request.title,
      fallbackText: request.fallbackTranscript,
      transcriber: {
        async transcribeAudioFile() {
          throw new Error(
            "Audio extraction did not produce a usable audio file."
          );
        }
      }
    });
  }

  let transcriptionError: unknown;
  const observingTranscriber: AudioFileTranscriptionPort = {
    async transcribeAudioFile(input) {
      try {
        return await transcriber.transcribeAudioFile(input);
      } catch (error) {
        transcriptionError = error;
        throw error;
      }
    }
  };
  const transcription = await transcribeUploadedAudio({
    audioPath: audio.audioPath ?? "",
    title: request.title,
    fallbackText: request.fallbackTranscript,
    transcriber: observingTranscriber
  });

  if (transcriptionError) {
    await appendRecoverableError(errorLog, {
      traceId,
      jobId: request.jobId,
      code: "SOURCE_TRANSCRIPTION_UNAVAILABLE",
      stage: "transcribing",
      message:
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Transcription service failed.",
      timestamp: now()
    });
  }

  return transcription;
}

async function appendRecoverableError(
  errorLog: ErrorLogPort,
  entry: Parameters<ErrorLogPort["append"]>[0]
): Promise<void> {
  try {
    await errorLog.append(entry);
  } catch (error) {
    console.error("Failed to persist recoverable video analysis error.", {
      entry,
      loggingError:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error
    });
  }
}

async function appendFatalError(
  errorLog: ErrorLogPort,
  entry: Parameters<ErrorLogPort["append"]>[0]
): Promise<void> {
  try {
    await errorLog.append(entry);
  } catch (error) {
    console.error("Failed to persist fatal video analysis error.", {
      entry,
      loggingError:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error
    });
  }
}

function serializeErrorDetail(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}
