import { describe, expect, it, vi } from "vitest";
import type { DifferentiationPort } from "../src/application/ports/DifferentiationPort";
import type { ErrorLogPort } from "../src/application/ports/ErrorLogPort";
import type { FrameCatalogPort } from "../src/application/ports/FrameCatalogPort";
import type { JobRepositoryPort } from "../src/application/ports/JobRepositoryPort";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import type { ContentReasoningPort } from "../src/application/ports/ContentReasoningPort";
import type {
  MediaProbePort,
  AudioExtractorPort,
  FrameSamplerPort
} from "../src/application/ports/MediaProcessingPort";
import type { MediaWorkspacePort } from "../src/application/ports/MediaWorkspacePort";
import type { ModelRunRepositoryPort } from "../src/application/ports/ModelRunRepositoryPort";
import type { MultimodalUnderstandingPort } from "../src/application/ports/MultimodalUnderstandingPort";
import type { OcrPort } from "../src/application/ports/OcrPort";
import type { ReportRepositoryPort } from "../src/application/ports/ReportRepositoryPort";
import type { SliceUnderstandingCachePort } from "../src/application/ports/SliceUnderstandingCachePort";
import type { AudioFileTranscriptionPort } from "../src/application/ports/TranscriptionPort";
import type { VideoStoragePort } from "../src/application/ports/VideoStoragePort";
import {
  runVideoAnalysisJob,
  VideoAnalysisJobExecutionError
} from "../src/application/useCases/runVideoAnalysisJob";
import type { VideoAnalysisJobSnapshot } from "../src/domain/jobs/VideoAnalysisJob";
import type { SliceVisualObservation } from "../src/domain/multimodalIntelligence/MultimodalUnderstanding";
import { FakeContentReasoningClient } from "../src/infrastructure/multimodal/FakeContentReasoningClient";
import { FakeMultimodalUnderstandingClient } from "../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";
import {
  OpenAiCompatibleContentReasoningClient,
  OpenAiCompatibleMultimodalUnderstandingClient
} from "../src/infrastructure/multimodal/OpenAiCompatibleMultimodalClients";

function createDependencies(overrides: Partial<Parameters<typeof runVideoAnalysisJob>[0]["dependencies"]> = {}) {
  const savedJobs: VideoAnalysisJobSnapshot[] = [];
  const jobRepository: JobRepositoryPort = {
    save: vi.fn(async (job) => {
      savedJobs.push(structuredClone(job));
    }),
    findById: vi.fn()
  };
  const errorLog: ErrorLogPort = {
    append: vi.fn()
  };
  const reportRepository: ReportRepositoryPort = {
    save: vi.fn(),
    findByJobId: vi.fn()
  };
  const videoStorage: VideoStoragePort = {
    saveVideo: vi.fn().mockResolvedValue({
      id: "video_123",
      fileName: "demo.mp4",
      storagePath: "storage/uploads/video_123-demo.mp4"
    }),
    findVideoById: vi.fn(async () => null)
  };
  const workspace: MediaWorkspacePort = {
    prepare: vi.fn().mockResolvedValue({
      audioPath: "storage/audio/video_123.wav",
      frameDirectory: "storage/frames/video_123",
      framePattern: "storage/frames/video_123/frame-%03d.jpg",
      everySeconds: 5
    })
  };
  const mediaProbe: MediaProbePort = {
    probe: vi.fn().mockResolvedValue({
      status: "completed",
      durationSeconds: 45,
      width: 1080,
      height: 1920,
      frameRate: 30
    })
  };
  const audioExtractor: AudioExtractorPort = {
    extractAudio: vi.fn().mockResolvedValue({
      status: "failed",
      reason: "ffmpeg unavailable"
    })
  };
  const frameSampler: FrameSamplerPort = {
    sampleFrames: vi.fn().mockResolvedValue({
      status: "completed",
      outputPattern: "storage/frames/video_123/frame-%03d.jpg",
      everySeconds: 5
    })
  };
  const frameCatalog: FrameCatalogPort = {
    listFrames: vi.fn().mockResolvedValue([
      {
        index: 1,
        timestampSeconds: 0,
        path: "storage/frames/video_123/frame-001.jpg"
      }
    ])
  };
  const transcriber: AudioFileTranscriptionPort = {
    transcribeAudioFile: vi.fn().mockRejectedValue(new Error("FunASR unavailable"))
  };
  const ocr: OcrPort = {
    recognizeFrames: vi.fn().mockRejectedValue(new Error("PaddleOCR unavailable"))
  };
  const multimodalUnderstanding: MultimodalUnderstandingPort = new FakeMultimodalUnderstandingClient();
  const contentReasoner: ContentReasoningPort = new FakeContentReasoningClient();
  const knowledgeRepository: KnowledgeRepositoryPort = {
    retrieve: vi.fn().mockResolvedValue([])
  };
  const modelRunRepository: ModelRunRepositoryPort = {
    save: vi.fn(),
    findByJobId: vi.fn().mockResolvedValue([])
  };
  const differentiator: DifferentiationPort = {
    scoreUniqueness: vi.fn().mockResolvedValue({
      scores: [75, 70, 65],
      source: "test"
    }),
    scoreCompetition: vi.fn().mockResolvedValue({
      score: 30,
      topicId: 1,
      topicSize: 2,
      corpusSize: 3,
      source: "test"
    })
  };

  return {
    dependencies: {
      jobRepository,
      errorLog,
            reportRepository,
            videoStorage,
            workspace,
            mediaProbe,
            audioExtractor,
      frameSampler,
      frameCatalog,
      transcriber,
      ocr,
      multimodalUnderstanding,
      contentReasoner,
      differentiator,
      knowledgeRepository,
      modelRunRepository,
      ...overrides
    },
    savedJobs,
    errorLog,
    reportRepository
  };
}

const request = {
  assetId: "video_123",
  jobId: "job_123",
  fileName: "demo.mp4",
  data: Buffer.from("fake video"),
  category: "AI科技" as const,
  hotspot: "AI drama",
  title: "AI drama",
  fallbackTranscript: "女主身份反转，下一集揭晓真相",
  commentSignals: "",
  creatorPositioning: "AI 漫剧创作者",
  referenceTexts: []
};

describe("runVideoAnalysisJob", () => {
  it("persists every job stage and completes when optional services fall back", async () => {
    const { dependencies, savedJobs, errorLog, reportRepository } = createDependencies();
    const timestamps = [
      "2026-07-10T00:00:00.000Z",
      "2026-07-10T00:00:01.000Z",
      "2026-07-10T00:00:02.000Z",
      "2026-07-10T00:00:03.000Z",
      "2026-07-10T00:00:04.000Z",
      "2026-07-10T00:00:05.000Z",
      "2026-07-10T00:00:06.000Z"
    ];

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      now: () => timestamps.shift() ?? "2026-07-10T00:00:07.000Z",
      traceId: "trace_123"
    });

    expect(savedJobs.map((job) => job.status)).toEqual([
      "uploaded",
      "extracting_audio",
      "transcribing",
      "sampling_frames",
      "visually_understanding",
      "reasoning",
      "retrieving_knowledge",
      "evaluating",
      "completed"
    ]);
    expect(savedJobs.every((job) => job.workflowVersion === 2)).toBe(true);
    expect(result.job.status).toBe("completed");
    expect(result.transcription.source).toBe("fallback");
    expect(result.ocr.status).toBe("failed");
    expect(result.analysis.report.jobId).toBe("job_123");
    expect(result.evidenceBundle.bundle.durationMs).toBe(45_000);
    expect(result.sliceUnderstanding.status).toBe("completed");
    expect(result.videoReasoning.status).toBe("completed");
    expect(result.multimodalUnderstanding?.execution.provider).toBe("fake");
    expect(result.analysis.report.analysisMode).toBe("multimodal");
    expect(result.analysis.report.modelSummary).toMatchObject({
      provider: "fake",
      model: "fake-temporal-reasoner-v1",
      coverageRatio: 1,
      partial: false
    });
    expect(result.analysis.report.understanding.narrative?.premise).toMatchObject({
      type: "inference"
    });
    expect(result.analysis.report.understanding.visualCraft?.pacing.length).toBeGreaterThan(0);
    expect(result.evidenceBundle.bundle.timelineSlices.length).toBeGreaterThan(0);
    expect(result.evidenceBundle.frameAssets[0]).toMatchObject({
      id: "frame_1",
      path: "storage/frames/video_123/frame-001.jpg"
    });
    expect(JSON.stringify(result.evidenceBundle.bundle)).not.toContain("storage/frames");
    expect(reportRepository.save).toHaveBeenCalledWith(result.analysis.report);
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_123",
        jobId: "job_123",
        code: "SYSTEM_AUDIO_EXTRACTION_FAILED",
        stage: "extracting_audio",
        message: "ffmpeg unavailable"
      })
    );
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "SOURCE_OCR_UNAVAILABLE",
        stage: "sampling_frames",
        message: "PaddleOCR unavailable"
      })
    );
  });

  it("runs slice understanding before temporal reasoning in the v2 workflow", async () => {
    const events: string[] = [];
    const multimodalUnderstanding: MultimodalUnderstandingPort = {
      understandSlice: vi.fn(async (input) => {
        events.push(`slice:${input.slice.id}`);
        return new FakeMultimodalUnderstandingClient().understandSlice(input);
      })
    };
    const contentReasoner: ContentReasoningPort = {
      reason: vi.fn(async (input) => {
        events.push(`reason:${input.sliceObservations.length}`);
        return new FakeContentReasoningClient().reason(input);
      })
    };
    const { dependencies } = createDependencies({
      multimodalUnderstanding,
      contentReasoner
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      now: createClock(),
      traceId: "trace_multimodal_order"
    });

    expect(events).toEqual([
      "slice:slice_1",
      "slice:slice_2",
      "slice:slice_3",
      "reason:3"
    ]);
    expect(contentReasoner.reason).toHaveBeenCalledWith(
      expect.objectContaining({
        sliceObservations: expect.arrayContaining([
          expect.objectContaining({ sliceId: "slice_1" })
        ])
      })
    );
    expect(result.analysis.report.understanding.claims?.length).toBeGreaterThan(0);
  });

  it("logs a recoverable knowledge retrieval error and still completes the report", async () => {
    const { dependencies, errorLog } = createDependencies({
      knowledgeRepository: {
        retrieve: vi.fn().mockRejectedValue(new Error("knowledge store unavailable"))
      }
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_rag_failure"
    });

    expect(result.job.status).toBe("completed");
    expect(result.analysis.knowledgeRetrieval).toEqual({
      status: "failed",
      evidenceCount: 0,
      reason: "knowledge store unavailable"
    });
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_rag_failure",
        jobId: request.jobId,
        code: "SOURCE_KNOWLEDGE_RETRIEVAL_UNAVAILABLE",
        stage: "retrieving_knowledge",
        message: "knowledge store unavailable"
      })
    );
  });

  it("persists slice and reasoning model run metadata", async () => {
    const { dependencies } = createDependencies();

    await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_model_runs",
      now: () => "2026-07-11T00:00:00.000Z"
    });

    expect(dependencies.modelRunRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_model_runs",
        jobId: request.jobId,
        stage: "visually_understanding",
        provider: "fake",
        promptVersion: "fake-slice-v1",
        schemaVersion: "multimodal-slice-v1",
        cacheKey: expect.stringMatching(/^modelrun_/),
        status: "completed",
        selection: expect.objectContaining({
          policyMode: "balanced",
          providerProfileId: "fake_frame_text",
          route: "cloud_frame_text",
          effectiveFrameCount: 1,
          effectiveVideoSeconds: 45,
          estimatedCost: 0,
          allowCloudUpload: true,
          reason: expect.stringContaining("balanced")
        }),
        usage: expect.objectContaining({
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
          imageCount: expect.any(Number),
          frameCount: expect.any(Number)
        })
      })
    );
    expect(dependencies.modelRunRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_model_runs",
        jobId: request.jobId,
        stage: "reasoning",
        provider: "fake",
        promptVersion: "fake-reasoning-v1",
        schemaVersion: "multimodal-video-v1",
        cacheKey: expect.stringMatching(/^modelrun_/),
        status: "completed",
        selection: expect.objectContaining({
          policyMode: "balanced",
          providerProfileId: "fake_temporal_reasoning",
          route: "cloud_frame_text",
          effectiveFrameCount: 1,
          effectiveVideoSeconds: 45,
          estimatedCost: 0,
          allowCloudUpload: true,
          reason: expect.stringContaining("balanced")
        }),
        usage: expect.objectContaining({
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number)
        })
      })
    );
  });

  it("limits model-visible evidence by the model policy frame and duration caps", async () => {
    const fakeMultimodal = new FakeMultimodalUnderstandingClient();
    const fakeReasoner = new FakeContentReasoningClient();
    const multimodalUnderstanding: MultimodalUnderstandingPort = {
      getSliceModelProfile: () => fakeMultimodal.getSliceModelProfile(),
      getModelProviderProfile: () => fakeMultimodal.getModelProviderProfile(),
      understandSlice: vi.fn((input) => fakeMultimodal.understandSlice(input))
    };
    const contentReasoner: ContentReasoningPort = {
      getModelProviderProfile: () => fakeReasoner.getModelProviderProfile(),
      reason: vi.fn((input) => fakeReasoner.reason(input))
    };
    const frameSamples = Array.from({ length: 100 }, (_, index) => ({
      index: index + 1,
      timestampSeconds: index,
      path: `storage/frames/video_123/frame-${String(index + 1).padStart(3, "0")}.jpg`
    }));
    const { dependencies } = createDependencies({
      multimodalUnderstanding,
      contentReasoner,
      mediaProbe: {
        probe: vi.fn().mockResolvedValue({
          status: "completed",
          durationSeconds: 150,
          width: 1080,
          height: 1920,
          frameRate: 30
        })
      },
      frameCatalog: {
        listFrames: vi.fn().mockResolvedValue(frameSamples)
      },
      modelPolicy: {
        mode: "balanced",
        allowCloudUpload: true,
        maxFrames: 3,
        maxVideoSeconds: 5,
        timeoutMs: 30_000,
        maxRetries: 1
      }
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_policy_limited",
      now: createClock()
    });

    const visualCalls = vi.mocked(multimodalUnderstanding.understandSlice).mock.calls;
    const sentFrameIds = new Set(
      visualCalls.flatMap(([input]) => input.frameAssets.map((frame) => frame.id))
    );
    expect([...sentFrameIds]).toEqual(["frame_1", "frame_2", "frame_3"]);
    expect(
      visualCalls.every(([input]) => input.slice.endMs <= 5_000)
    ).toBe(true);

    const reasoningInput = vi.mocked(contentReasoner.reason).mock.calls[0][0];
    expect(reasoningInput.evidenceBundle.frameEvidence.map((frame) => frame.id)).toEqual([
      "frame_1",
      "frame_2",
      "frame_3"
    ]);
    expect(
      reasoningInput.evidenceBundle.transcriptSegments.every(
        (segment) => segment.startMs < 5_000 && segment.endMs <= 5_000
      )
    ).toBe(true);
    expect(result.analysis.report.modelSummary?.partial).toBe(true);
    expect(result.analysis.report.modelSummary?.coverageRatio).toBeLessThan(0.1);
  });

  it("completes as multimodal when OpenAI-compatible adapters are configured", async () => {
    const fetchMock = createOpenAiCompatibleFetchMock();
    const multimodalUnderstanding = new OpenAiCompatibleMultimodalUnderstandingClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "vision-test",
      fetch: fetchMock,
      readFile: vi.fn(async () => Buffer.from("fake image"))
    });
    const contentReasoner = new OpenAiCompatibleContentReasoningClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "vision-test",
      fetch: fetchMock
    });
    const { dependencies } = createDependencies({
      multimodalUnderstanding,
      contentReasoner
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_openai_compatible",
      now: createClock()
    });

    expect(result.analysis.report.analysisMode).toBe("multimodal");
    expect(result.analysis.report.modelSummary).toMatchObject({
      provider: "openai_compatible",
      model: "vision-test"
    });
    expect(result.analysis.report.creatorInsights?.script.mainContent).toContain("身份反转");
    expect(result.analysis.report.creatorInsights?.visual.sceneUnderstanding.length).toBeGreaterThan(0);
    expect(result.analysis.report.creatorInsights?.viral.viralBreakdown.length).toBeGreaterThan(0);
    expect(dependencies.modelRunRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai_compatible",
        selection: expect.objectContaining({
          providerProfileId: "openai_compatible_frame_text",
          route: "cloud_frame_text",
          requiresCloudUpload: true
        })
      })
    );
  });

  it("keeps successful slice visual understanding when video-level reasoning fails", async () => {
    const contentReasoner: ContentReasoningPort = {
      getModelProviderProfile: () => ({
        id: "qwen_reasoning",
        provider: "openai_compatible",
        model: "qwen3-vl-plus",
        route: "cloud_frame_text",
        requiresCloudUpload: true,
        maxFrames: 80,
        maxVideoSeconds: 120,
        qualityScore: 82,
        estimatedCost: 1
      }),
      reason: vi.fn().mockResolvedValue({
        status: "failed",
        reason: "OpenAI-compatible reasoning output invalid: claim premise is required",
        retryable: true
      })
    };
    const { dependencies, errorLog } = createDependencies({
      contentReasoner
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_reasoning_failed_slice_only",
      now: createClock()
    });

    expect(result.videoReasoning.status).toBe("failed");
    expect(result.multimodalUnderstanding).toBeDefined();
    expect(result.analysis.report.analysisMode).toBe("multimodal");
    expect(result.analysis.report.modelSummary).toMatchObject({
      provider: "fake",
      model: "fake-frame-text-v1",
      promptVersion: "slice-only-reasoning-fallback-v1",
      partial: true
    });
    expect(
      result.analysis.report.creatorInsights?.visual.sceneUnderstanding.length
    ).toBeGreaterThan(0);
    expect(
      result.analysis.report.creatorInsights?.visual.sceneUnderstanding[0]
    ).not.toBe("Sampled frame 1.");
    expect(
      result.analysis.report.creatorInsights?.script.timestampEvidence.length
    ).toBeGreaterThan(0);
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_reasoning_failed_slice_only",
        jobId: request.jobId,
        code: "SOURCE_VIDEO_REASONING_UNAVAILABLE",
        stage: "reasoning",
        message:
          "OpenAI-compatible reasoning output invalid: claim premise is required"
      })
    );
  });

  it("logs model provider selection gaps without blocking the report", async () => {
    const fakeMultimodal = new FakeMultimodalUnderstandingClient();
    const fakeReasoner = new FakeContentReasoningClient();
    const multimodalUnderstanding: MultimodalUnderstandingPort = {
      getSliceModelProfile: () => fakeMultimodal.getSliceModelProfile(),
      understandSlice: vi.fn((input) => fakeMultimodal.understandSlice(input))
    };
    const contentReasoner: ContentReasoningPort = {
      getModelProviderProfile: () => ({
        ...fakeReasoner.getModelProviderProfile(),
        id: "cloud_reasoning_requires_upload",
        requiresCloudUpload: true
      }),
      reason: vi.fn((input) => fakeReasoner.reason(input))
    };
    const { dependencies, errorLog } = createDependencies({
      multimodalUnderstanding,
      contentReasoner,
      modelPolicy: {
        mode: "balanced",
        allowCloudUpload: false,
        maxFrames: 80,
        maxVideoSeconds: 120,
        timeoutMs: 30_000,
        maxRetries: 1
      }
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_selection_unavailable",
      now: createClock()
    });

    expect(result.job.status).toBe("completed");
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_selection_unavailable",
        jobId: request.jobId,
        code: "SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE",
        stage: "visually_understanding",
        message:
          "Multimodal provider selection metadata is unavailable for visually_understanding.",
        detail: expect.objectContaining({
          reason: "provider_profile_unavailable",
          policy: expect.objectContaining({
            mode: "balanced",
            allowCloudUpload: false
          }),
          requestedInput: {
            frameCount: 1,
            videoSeconds: 45
          }
        })
      })
    );
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_selection_unavailable",
        jobId: request.jobId,
        code: "SYSTEM_MODEL_PROVIDER_SELECTION_UNAVAILABLE",
        stage: "reasoning",
        message:
          "Multimodal provider selection metadata is unavailable for reasoning.",
        detail: expect.objectContaining({
          reason: "No multimodal provider satisfies the current model policy.",
          rejectedCandidates: [
            {
              id: "cloud_reasoning_requires_upload",
              reasons: ["cloud upload is not allowed by policy"]
            }
          ]
        })
      })
    );

    const savedRuns = vi
      .mocked(dependencies.modelRunRepository.save)
      .mock.calls.map(([run]) => run);
    expect(savedRuns.length).toBeGreaterThan(0);
    expect(savedRuns.every((run) => run.selection === undefined)).toBe(true);
  });

  it("marks cached slice model runs and skips visual model calls", async () => {
    const fakeMultimodal = new FakeMultimodalUnderstandingClient();
    const multimodalUnderstanding: MultimodalUnderstandingPort = {
      getSliceModelProfile: () => fakeMultimodal.getSliceModelProfile(),
      getModelProviderProfile: () => fakeMultimodal.getModelProviderProfile(),
      understandSlice: vi.fn((input) => fakeMultimodal.understandSlice(input))
    };
    const cachedSlices = [
      {
        id: "slice_1",
        startMs: 0,
        endMs: 20_000,
        frameIds: ["frame_1"]
      },
      {
        id: "slice_2",
        startMs: 20_000,
        endMs: 40_000,
        frameIds: []
      },
      {
        id: "slice_3",
        startMs: 40_000,
        endMs: 45_000,
        frameIds: []
      }
    ];
    let cacheRead = 0;
    const sliceUnderstandingCache: SliceUnderstandingCachePort = {
      findByCacheKey: vi.fn(async (cacheKey) => {
        const slice = cachedSlices[cacheRead];
        cacheRead += 1;
        return {
          cacheKey,
          inputHash: `cached_input_${slice.id}`,
          observation: createCachedSliceObservation(slice),
          execution: {
            provider: "fake",
            model: "fake-frame-text-v1",
            promptVersion: "fake-slice-v1",
            schemaVersion: "multimodal-slice-v1",
            latencyMs: 0,
            status: "completed",
            partial: false
          },
          cachedAt: "2026-07-11T00:00:00.000Z"
        };
      }),
      save: vi.fn()
    };
    const { dependencies } = createDependencies({
      multimodalUnderstanding,
      sliceUnderstandingCache
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_slice_cache_hits",
      now: () => "2026-07-11T00:00:01.000Z"
    });

    expect(result.job.status).toBe("completed");
    expect(multimodalUnderstanding.understandSlice).not.toHaveBeenCalled();
    expect(sliceUnderstandingCache.save).not.toHaveBeenCalled();
    expect(result.sliceUnderstanding.cacheStats).toMatchObject({
      hits: 3,
      misses: 0,
      writes: 0
    });

    const savedRuns = vi
      .mocked(dependencies.modelRunRepository.save)
      .mock.calls.map(([run]) => run);
    const sliceRuns = savedRuns.filter(
      (run) => run.stage === "visually_understanding"
    );
    expect(sliceRuns).toHaveLength(3);
    expect(sliceRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sliceId: "slice_1",
          cache: {
            status: "hit",
            savedModelCall: true,
            cachedAt: "2026-07-11T00:00:00.000Z"
          }
        })
      ])
    );
    expect(sliceRuns.every((run) => run.cache?.status === "hit")).toBe(true);
    expect(sliceRuns.every((run) => run.cache?.savedModelCall)).toBe(true);
    expect(
      sliceRuns.every(
        (run) => run.selection?.providerProfileId === "fake_frame_text"
      )
    ).toBe(true);
  });

  it("logs model run persistence failures without blocking the report", async () => {
    const { dependencies, errorLog } = createDependencies({
      modelRunRepository: {
        save: vi.fn().mockRejectedValue(new Error("model run disk full")),
        findByJobId: vi.fn().mockResolvedValue([])
      }
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_model_run_failure"
    });

    expect(result.job.status).toBe("completed");
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_model_run_failure",
        jobId: request.jobId,
        code: "SYSTEM_MODEL_RUN_PERSISTENCE_FAILED",
        stage: "reasoning",
        message: "model run disk full"
      })
    );
  });

  it("logs slice cache read and write failures without blocking the report", async () => {
    const fakeMultimodal = new FakeMultimodalUnderstandingClient();
    const sliceUnderstandingCache: SliceUnderstandingCachePort = {
      findByCacheKey: vi.fn().mockRejectedValue(new Error("cache read broken")),
      save: vi.fn().mockRejectedValue(new Error("cache write broken"))
    };
    const { dependencies, errorLog } = createDependencies({
      multimodalUnderstanding: {
        getSliceModelProfile: () => fakeMultimodal.getSliceModelProfile(),
        understandSlice: vi.fn((input) => fakeMultimodal.understandSlice(input))
      },
      sliceUnderstandingCache
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      traceId: "trace_slice_cache_failure",
      now: createClock()
    });

    expect(result.job.status).toBe("completed");
    expect(result.sliceUnderstanding.cacheStats).toMatchObject({
      readFailures: 3,
      writeFailures: 3
    });
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_slice_cache_failure",
        jobId: request.jobId,
        code: "SYSTEM_SLICE_UNDERSTANDING_CACHE_READ_FAILED",
        stage: "visually_understanding",
        detail: expect.objectContaining({
          readFailures: 3,
          affectedSlices: ["slice_1", "slice_2", "slice_3"]
        })
      })
    );
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_slice_cache_failure",
        jobId: request.jobId,
        code: "SYSTEM_SLICE_UNDERSTANDING_CACHE_WRITE_FAILED",
        stage: "visually_understanding",
        detail: expect.objectContaining({
          writeFailures: 3,
          affectedSlices: ["slice_1", "slice_2", "slice_3"]
        })
      })
    );
  });

  it("falls back to transcript and frame evidence when media probing is unavailable", async () => {
    const { dependencies, errorLog } = createDependencies({
      mediaProbe: {
        probe: vi.fn().mockResolvedValue({
          status: "failed",
          reason: "ffprobe unavailable"
        })
      },
      transcriber: {
        transcribeAudioFile: vi.fn().mockResolvedValue({
          source: "funasr",
          language: "zh",
          duration: 24,
          fullText: "开头冲突，后续反转。",
          segments: [
            { start: 0, end: 8, text: "开头冲突" },
            { start: 8, end: 24, text: "后续反转" }
          ]
        })
      },
      audioExtractor: {
        extractAudio: vi.fn().mockResolvedValue({
          status: "completed",
          audioPath: "storage/audio/video_123.wav"
        })
      }
    });

    const result = await runVideoAnalysisJob({
      request,
      dependencies,
      now: createClock(),
      traceId: "trace_probe_fallback"
    });

    expect(result.evidenceBundle.bundle.durationMs).toBe(24_000);
    expect(result.evidenceBundle.bundle.modalities.transcript.status).toBe("available");
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_probe_fallback",
        code: "SOURCE_MEDIA_PROBE_UNAVAILABLE",
        stage: "extracting_audio",
        message: "ffprobe unavailable"
      })
    );
  });

  it("marks and persists a fatal failure and writes a structured error log", async () => {
    const videoStorage: VideoStoragePort = {
      saveVideo: vi.fn().mockRejectedValue(new Error("disk is read-only")),
      findVideoById: vi.fn(async () => null)
    };
    const { dependencies, savedJobs, errorLog } = createDependencies({
      videoStorage
    });

    await expect(
      runVideoAnalysisJob({
        request,
        dependencies,
        now: () => "2026-07-10T00:00:00.000Z",
        traceId: "trace_fatal"
      })
    ).rejects.toBeInstanceOf(VideoAnalysisJobExecutionError);

    expect(savedJobs.map((job) => job.status)).toEqual(["uploaded", "failed"]);
    expect(savedJobs.at(-1)).toMatchObject({
      status: "failed",
      failure: {
        stage: "uploaded",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        message: "disk is read-only"
      }
    });
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_fatal",
        jobId: "job_123",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        stage: "uploaded",
        message: "disk is read-only"
      })
    );
  });

  it("keeps recoverable fallbacks working when the error log is unavailable", async () => {
    const { dependencies, savedJobs } = createDependencies();
    dependencies.errorLog.append = vi.fn().mockRejectedValue(new Error("log disk is read-only"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await runVideoAnalysisJob({
        request,
        dependencies,
        now: createClock(),
        traceId: "trace_log_failure"
      });

      expect(result.job.status).toBe("completed");
      expect(savedJobs.at(-1)?.status).toBe("completed");
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist recoverable video analysis error.",
        expect.objectContaining({
          entry: expect.objectContaining({
            traceId: "trace_log_failure"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("preserves the original fatal job error when fatal error logging is unavailable", async () => {
    const videoStorage: VideoStoragePort = {
      saveVideo: vi.fn().mockRejectedValue(new Error("disk is read-only")),
      findVideoById: vi.fn(async () => null)
    };
    const { dependencies, savedJobs } = createDependencies({
      videoStorage
    });
    dependencies.errorLog.append = vi.fn().mockRejectedValue(new Error("log disk is read-only"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        runVideoAnalysisJob({
          request,
          dependencies,
          now: () => "2026-07-10T00:00:00.000Z",
          traceId: "trace_fatal_log_failure"
        })
      ).rejects.toMatchObject({
        name: "VideoAnalysisJobExecutionError",
        message: "disk is read-only"
      });

      expect(savedJobs.map((job) => job.status)).toEqual(["uploaded", "failed"]);
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist fatal video analysis error.",
        expect.objectContaining({
          entry: expect.objectContaining({
            traceId: "trace_fatal_log_failure",
            code: "SYSTEM_VIDEO_ANALYSIS_FAILED"
          })
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("marks the last persisted active stage as failed when completing the job cannot be saved", async () => {
    const { dependencies, savedJobs, errorLog } = createDependencies();
    dependencies.jobRepository.save = vi.fn(async (job) => {
      if (job.status === "completed") {
        throw new Error("job store unavailable on completed");
      }
      savedJobs.push(structuredClone(job));
    });

    await expect(
      runVideoAnalysisJob({
        request,
        dependencies,
        now: createClock(),
        traceId: "trace_completed_save_failure"
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisJobExecutionError",
      message: "job store unavailable on completed",
      job: expect.objectContaining({
        status: "failed",
        failure: expect.objectContaining({
          stage: "evaluating",
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
          message: "job store unavailable on completed"
        })
      })
    });

    expect(savedJobs.map((job) => job.status)).toEqual([
      "uploaded",
      "extracting_audio",
      "transcribing",
      "sampling_frames",
      "visually_understanding",
      "reasoning",
      "retrieving_knowledge",
      "evaluating",
      "failed"
    ]);
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_completed_save_failure",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        stage: "evaluating",
        message: "job store unavailable on completed"
      })
    );
  });

  it("preserves the original fatal error when persisting the failed job snapshot is unavailable", async () => {
    const videoStorage: VideoStoragePort = {
      saveVideo: vi.fn().mockRejectedValue(new Error("disk is read-only")),
      findVideoById: vi.fn(async () => null)
    };
    const { dependencies, savedJobs, errorLog } = createDependencies({
      videoStorage
    });
    dependencies.jobRepository.save = vi.fn(async (job) => {
      if (job.status === "failed") {
        throw new Error("job store is read-only");
      }
      savedJobs.push(structuredClone(job));
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        runVideoAnalysisJob({
          request,
          dependencies,
          now: () => "2026-07-10T00:00:00.000Z",
          traceId: "trace_failed_snapshot_save_failure"
        })
      ).rejects.toMatchObject({
        name: "VideoAnalysisJobExecutionError",
        message: "disk is read-only",
        job: expect.objectContaining({
          status: "failed",
          failure: expect.objectContaining({
            stage: "uploaded",
            code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
            message: "disk is read-only"
          })
        })
      });

      expect(savedJobs.map((job) => job.status)).toEqual(["uploaded"]);
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to persist failed video analysis job.",
        expect.objectContaining({
          job: expect.objectContaining({
            status: "failed"
          }),
          persistenceError: expect.objectContaining({
            message: "job store is read-only"
          })
        })
      );
      expect(errorLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: "trace_failed_snapshot_save_failure",
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
          stage: "uploaded",
          message: "disk is read-only",
          detail: expect.objectContaining({
            failedJobPersistenceError: expect.objectContaining({
              message: "job store is read-only"
            })
          })
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("records a failed uploaded job when the initial uploaded snapshot cannot be persisted", async () => {
    const { dependencies, savedJobs, errorLog } = createDependencies();
    let saveAttempt = 0;
    dependencies.jobRepository.save = vi.fn(async (job) => {
      saveAttempt += 1;
      if (saveAttempt === 1 && job.status === "uploaded") {
        throw new Error("job store unavailable on uploaded");
      }
      savedJobs.push(structuredClone(job));
    });

    await expect(
      runVideoAnalysisJob({
        request,
        dependencies,
        now: () => "2026-07-10T00:00:00.000Z",
        traceId: "trace_uploaded_save_failure"
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisJobExecutionError",
      message: "job store unavailable on uploaded",
      job: expect.objectContaining({
        status: "failed",
        failure: expect.objectContaining({
          stage: "uploaded",
          code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
          message: "job store unavailable on uploaded"
        })
      })
    });

    expect(savedJobs.map((job) => job.status)).toEqual(["failed"]);
    expect(errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_uploaded_save_failure",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        stage: "uploaded",
        message: "job store unavailable on uploaded"
      })
    );
  });

  it("rejects an already completed initial job without rerunning side effects", async () => {
    const { dependencies } = createDependencies();
    const completedJob: VideoAnalysisJobSnapshot = {
      id: "job_123",
      videoId: "video_123",
      status: "completed",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:06.000Z",
      history: [
        { status: "uploaded", occurredAt: "2026-07-10T00:00:00.000Z" },
        { status: "extracting_audio", occurredAt: "2026-07-10T00:00:01.000Z" },
        { status: "transcribing", occurredAt: "2026-07-10T00:00:02.000Z" },
        { status: "sampling_frames", occurredAt: "2026-07-10T00:00:03.000Z" },
        { status: "retrieving_knowledge", occurredAt: "2026-07-10T00:00:04.000Z" },
        { status: "evaluating", occurredAt: "2026-07-10T00:00:05.000Z" },
        { status: "completed", occurredAt: "2026-07-10T00:00:06.000Z" }
      ]
    };

    await expect(
      runVideoAnalysisJob({
        request,
        dependencies,
        initialJob: completedJob,
        traceId: "trace_completed_rerun"
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisJobExecutionError",
      message: "Video analysis job is already completed and cannot be rerun.",
      job: completedJob
    });

    expect(dependencies.videoStorage.saveVideo).not.toHaveBeenCalled();
    expect(dependencies.workspace.prepare).not.toHaveBeenCalled();
    expect(dependencies.jobRepository.save).not.toHaveBeenCalled();
    expect(dependencies.errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_completed_rerun",
        jobId: "job_123",
        code: "SYSTEM_VIDEO_ANALYSIS_TERMINAL_JOB_RERUN_REJECTED",
        stage: "completed"
      })
    );
  });

  it("rejects an already failed initial job without rerunning side effects", async () => {
    const { dependencies } = createDependencies();
    const failedJob: VideoAnalysisJobSnapshot = {
      id: "job_123",
      videoId: "video_123",
      status: "failed",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:03.000Z",
      history: [
        { status: "uploaded", occurredAt: "2026-07-10T00:00:00.000Z" },
        { status: "failed", occurredAt: "2026-07-10T00:00:03.000Z" }
      ],
      failure: {
        stage: "uploaded",
        code: "SYSTEM_VIDEO_ANALYSIS_FAILED",
        message: "previous failure",
        occurredAt: "2026-07-10T00:00:03.000Z"
      }
    };

    await expect(
      runVideoAnalysisJob({
        request,
        dependencies,
        initialJob: failedJob,
        traceId: "trace_failed_rerun"
      })
    ).rejects.toMatchObject({
      name: "VideoAnalysisJobExecutionError",
      message: "Video analysis job is already failed and cannot be rerun.",
      job: failedJob
    });

    expect(dependencies.videoStorage.saveVideo).not.toHaveBeenCalled();
    expect(dependencies.workspace.prepare).not.toHaveBeenCalled();
    expect(dependencies.jobRepository.save).not.toHaveBeenCalled();
    expect(dependencies.errorLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace_failed_rerun",
        jobId: "job_123",
        code: "SYSTEM_VIDEO_ANALYSIS_TERMINAL_JOB_RERUN_REJECTED",
        stage: "failed"
      })
    );
  });
});

function createClock(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `2026-07-10T00:00:${String(index).padStart(2, "0")}.000Z`;
  };
}

function createCachedSliceObservation(slice: {
  id: string;
  startMs: number;
  endMs: number;
  frameIds: string[];
}): SliceVisualObservation {
  return {
    id: `cached_observation_${slice.id}`,
    sliceId: slice.id,
    startMs: slice.startMs,
    endMs: slice.endMs,
    summary: `${slice.id} 的缓存画面观察`,
    visibleSubjects: ["缓存主体"],
    actions: ["缓存动作"],
    shotTypes: ["缓存镜头"],
    subtitleLegibility: "not_observed",
    aiDramaSignals: ["cached_signal"],
    confidence: 0.8,
    claims: [
      {
        id: `cached_claim_${slice.id}`,
        type: "observation",
        statement: `${slice.id} 的缓存证据结论`,
        confidence: 0.8,
        evidenceRefs: [
          {
            startMs: slice.startMs,
            endMs: slice.endMs,
            frameIds: slice.frameIds,
            transcriptSegmentIds: ["transcript_1"],
            ocrEvidenceIds: []
          }
        ],
        knowledgeIds: []
      }
    ]
  };
}

function createOpenAiCompatibleFetchMock() {
  let callCount = 0;
  return vi.fn(async () => {
    callCount += 1;
    if (callCount <= 3) {
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "开场用身份揭晓制造冲突。",
                visibleSubjects: ["女主"],
                actions: ["揭示身份"],
                shotTypes: ["近景"],
                subtitleLegibility: "clear",
                aiDramaSignals: ["identity_reversal"],
                confidence: 0.82,
                claims: [
                  {
                    statement: "开场画面支撑身份反转钩子。",
                    type: "observation",
                    confidence: 0.82
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 60 }
      });
    }

    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              contentType: "ai_drama",
              narrative: {
                premise: { statement: "故事围绕身份反转展开。" },
                hook: { statement: "开场冲突形成快速钩子。" },
                conflict: { statement: "家族冲突阻挡女主行动。" },
                reversal: { statement: "隐藏身份改变了冲突筹码。" },
                ending: { statement: "结尾留下下一集追问。" }
              },
              visualCraft: {
                composition: [{ statement: "近景构图让冲突更容易被看懂。" }],
                shotVariety: [{ statement: "反应镜头可以强化身份揭晓。" }],
                continuity: [],
                subtitleLegibility: [{ statement: "字幕可读，能够支撑静音观看。" }],
                styleConsistency: [],
                pacing: [{ statement: "开场和结尾节拍清晰。" }]
              },
              aiDrama: {
                conflict: [{ statement: "第一段切片已经呈现冲突。" }],
                reversals: [{ statement: "身份反转是最强钩子。" }],
                styleDrift: [],
                cliffhanger: { statement: "结尾追问后续会发生什么。" },
                seriesPotential: { statement: "这个设定可以延展成系列内容。" }
              }
            })
          }
        }
      ],
      usage: { prompt_tokens: 180, completion_tokens: 120 }
    });
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
