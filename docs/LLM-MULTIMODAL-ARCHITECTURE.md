# Bowen Multimodal LLM Architecture

## 0. 决策摘要

新增“多模态智能 / 大模型推理”限界上下文，但不让大模型直接接管整份报告。系统先从视频中构建带时间轴的证据包，再由视觉模型完成分段观察和跨片段推理，最后由内容评估领域结合 RAG 依据生成评分与建议。

MVP 推荐采用“抽帧 + 文稿 + OCR + 云端多模态模型”的可替换方案，保留当前规则分析作为最终降级路径。所有关键判断必须携带时间戳证据、置信度、模型版本和分析覆盖率。

## 1. Goal

Add a `Multimodal Intelligence` bounded context to Bowen so the system can:

1. Understand visual content with timeline evidence instead of frame-count rules.
2. Align frames, subtitles, OCR text, and speech transcripts.
3. Reason about script structure, shots, visual quality, emotional rhythm, and viral hooks.
4. Produce explainable conclusions that point back to timestamps and source evidence.
5. Support AI comic drama with character, relationship, conflict, reversal, and series-hook analysis.
6. Keep model providers replaceable and preserve the current rule-based fallback.

The first implementation should optimize for a reliable local demonstration. It should not try to
build a general video foundation-model platform.

## 2. Architecture Decision

The LLM must not directly generate the final report from the raw video.

Use a three-stage decision flow:

```text
Evidence extraction
  -> Multimodal understanding
  -> Domain evaluation and recommendation
```

Each stage has a different responsibility:

| Stage | Responsibility | Output |
| --- | --- | --- |
| Evidence extraction | Extract audio, transcript, frames, scene boundaries, and OCR | `VideoEvidenceBundle` |
| Multimodal understanding | Describe what happens and infer cross-modal narrative structure | `MultimodalUnderstanding` |
| Content evaluation | Apply Bowen rubrics and RAG knowledge to score and recommend changes | `ContentEvaluation` |

This separation prevents a model from inventing scores without evidence and allows the same
domain evaluation rules to work with cloud models, local models, or a fallback analyzer.

## 3. DDD Position

### 3.1 Bounded context

Add the supporting bounded context:

```text
Multimodal Intelligence / 大模型推理
```

It sits between `Video Understanding` and `Content Evaluation`.

```text
Upload / Asset
  -> Analysis Job
  -> Transcription
  -> Video Understanding
  -> Multimodal Intelligence
  -> Knowledge / RAG
  -> Content Evaluation
```

`Content Evaluation` remains the core business domain. `Multimodal Intelligence` supplies
structured observations and inferences but does not own the final Bowen scoring policy.

### 3.2 Responsibilities

The new context owns:

- Timeline-aligned multimodal input construction.
- Model capability selection and inference policy.
- Visual observation and temporal reasoning.
- Evidence-backed claims and confidence.
- Prompt, schema, and model execution version metadata.
- Partial-result and fallback semantics.

It does not own:

- Video upload or media storage.
- FFmpeg execution.
- ASR or OCR implementation.
- Knowledge-base retrieval.
- Final score weights.
- HTTP response formatting.

## 4. Domain Model

### 4.1 VideoEvidenceBundle

The complete evidence package for one analysis job.

```ts
interface VideoEvidenceBundle {
  jobId: string;
  videoId: string;
  durationMs: number;
  transcriptSegments: TranscriptEvidence[];
  frameEvidence: FrameEvidence[];
  ocrEvidence: OcrEvidence[];
  timelineSlices: TimelineSlice[];
  coverage: EvidenceCoverage;
}
```

Rules:

- Every item must include a time range or timestamp.
- A frame path is infrastructure data and must not appear in the final public report.
- `coverage` must state which time ranges were actually analyzed.
- Missing audio, OCR, or frames must be represented explicitly rather than silently omitted.

### 4.2 TimelineSlice

A bounded section sent to one visual-analysis call.

```ts
interface TimelineSlice {
  id: string;
  startMs: number;
  endMs: number;
  frameIds: string[];
  transcriptSegmentIds: string[];
  ocrEvidenceIds: string[];
  samplingReason: "opening" | "scene_change" | "interval" | "ending";
}
```

### 4.3 EvidenceRef

All important model conclusions must point to evidence.

```ts
interface EvidenceRef {
  startMs: number;
  endMs: number;
  frameIds: string[];
  transcriptSegmentIds: string[];
  ocrEvidenceIds: string[];
}
```

### 4.4 ReasoningClaim

```ts
interface ReasoningClaim {
  id: string;
  type: "observation" | "inference" | "recommendation";
  statement: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
}
```

Rules:

- `observation` and `inference` require at least one evidence reference.
- `recommendation` must reference either evidence or retrieved knowledge.
- Confidence is between 0 and 1.
- The system stores concise reasons, not hidden model chain-of-thought.

### 4.5 MultimodalUnderstanding

```ts
interface MultimodalUnderstanding {
  contentType: "ai_drama" | "talking_head" | "mixed" | "unknown";
  scenes: UnderstoodScene[];
  narrative: {
    premise: ReasoningClaim;
    hook?: ReasoningClaim;
    conflict?: ReasoningClaim;
    escalation?: ReasoningClaim;
    reversal?: ReasoningClaim;
    payoff?: ReasoningClaim;
    ending?: ReasoningClaim;
  };
  visualCraft: {
    composition: ReasoningClaim[];
    shotVariety: ReasoningClaim[];
    continuity: ReasoningClaim[];
    subtitleLegibility: ReasoningClaim[];
    styleConsistency: ReasoningClaim[];
    pacing: ReasoningClaim[];
  };
  aiDrama?: {
    characters: CharacterObservation[];
    relationships: RelationshipObservation[];
    conflict: ReasoningClaim[];
    reversals: ReasoningClaim[];
    cliffhanger?: ReasoningClaim;
    seriesPotential?: ReasoningClaim;
    styleDrift: ReasoningClaim[];
  };
  evidenceCoverage: EvidenceCoverage;
  execution: ModelExecutionSummary;
}
```

The domain contract contains normalized business language. Provider response fields must not
cross this boundary.

## 5. Processing Pipeline

### 5.1 Target flow

```text
Video asset
  |
  +--> Media probe: duration, resolution, frame rate
  |
  +--> Audio extraction --> FunASR transcript --------+
  |                                                   |
  +--> Scene detection --> adaptive frame sampling ---+--> VideoEvidenceBundle
  |                                                   |
  +--> PaddleOCR -------------------------------------+
                                                       |
                                                       v
                                            Per-slice visual analysis
                                                       |
                                                       v
                                             Temporal aggregation
                                                       |
                                                       v
                                           MultimodalUnderstanding
                                                       |
                             +-------------------------+------------------+
                             |                                            |
                             v                                            v
                     RAG query generation                         Rubric evidence
                             |                                            |
                             +-------------------------+------------------+
                                                       |
                                                       v
                                             Content evaluation
                                                       |
                                                       v
                                            VideoAnalysisReport
```

### 5.2 Adaptive frame sampling

Fixed five-second sampling is not enough for short-video hooks and fast AI-drama cuts.

Use this initial policy:

| Region | Sampling policy |
| --- | --- |
| First 5 seconds | Dense sampling, approximately 2 frames per second |
| Scene boundaries | One frame before and one frame after the boundary |
| Stable middle sections | One frame every 3 to 5 seconds |
| Final 5 seconds | Dense sampling for CTA and cliffhanger detection |
| Hard cap | 80 frames for the first MVP |

Create 15-to-30-second `TimelineSlice` objects. Each slice should usually contain 6-to-16 frames.
The cap protects latency and cost while preserving the opening, changes, and ending.

### 5.3 Two model passes

#### Pass A: visual observation

Input:

- A timeline slice.
- Ordered frames with timestamps.
- Matching transcript and OCR text.

Output:

- Scene description.
- Visible subjects and actions.
- Shot scale and camera changes.
- Subtitle placement and readability.
- Character identity clues.
- Visual conflict, reveal, and reaction signals.
- Evidence references.

This pass must prefer direct observation and avoid business scoring.

#### Pass B: temporal reasoning

Input:

- All normalized slice observations.
- Full transcript structure.
- Video category and AI-drama mode.

Output:

- Narrative progression.
- Hook, conflict, escalation, reversal, payoff, and ending.
- Cross-scene continuity.
- Emotional and visual pacing.
- AI-drama character relationships and series potential.
- Evidence-backed strengths and weaknesses.

This pass reasons across slices but still does not own final score weights.

### 5.4 Content evaluation

The evaluation use case combines:

```text
MultimodalUnderstanding
  + Transcript
  + RetrievedKnowledge[]
  + BowenEvaluationRubric
  -> ContentEvaluation
```

The model may propose rubric observations and dimension-level score candidates. The domain
calculator must:

- Validate required evidence.
- Apply configured dimension weights.
- Clamp scores to 0-100.
- Reduce confidence when evidence coverage is low.
- Prevent `viralPotential` from exceeding its supporting dimensions without an explicit reason.

## 6. Ports

Add application-layer ports with provider-neutral contracts.

```ts
interface MultimodalUnderstandingPort {
  understand(input: MultimodalUnderstandingRequest): Promise<MultimodalUnderstandingResult>;
}

interface ContentReasoningPort {
  reason(input: ContentReasoningRequest): Promise<ContentReasoningResult>;
}

interface ModelRunRepositoryPort {
  save(run: ModelRunRecord): Promise<void>;
  findByJobId(jobId: string): Promise<ModelRunRecord[]>;
}
```

Optional infrastructure-only abstraction:

```ts
interface ModelProviderGateway {
  invokeStructured<T>(request: StructuredModelRequest<T>): Promise<StructuredModelResponse<T>>;
}
```

Application code depends on the semantic ports. Provider routing and SDK details remain in
infrastructure.

## 7. Model Gateway Service

Add an independent service:

```text
services/multimodal-reasoner
```

Recommended initial API:

```text
GET  /health
POST /v1/understand/slice
POST /v1/reason/video
POST /v1/evaluate/content
```

Responsibilities:

- Provider authentication and request conversion.
- Model routing.
- JSON-schema constrained output.
- Timeout, retry, and rate-limit handling.
- Prompt and schema version selection.
- Usage and latency reporting.
- Provider response normalization.

The service must not calculate Bowen's final business score. It returns normalized observations,
claims, and score candidates.

### 7.1 Provider strategy

Support three adapters behind the same contract:

| Adapter | Use | Trade-off |
| --- | --- | --- |
| Cloud direct-video adapter | Highest-quality optional analysis | Fastest to integrate, sends video to an external provider |
| Cloud frame-plus-text adapter | Default MVP path | Portable, controlled input size, reuses current FFmpeg pipeline |
| Local vision-language adapter | Privacy and offline fallback | Requires a capable GPU and has higher local operational cost |

For the first local demonstration, implement one frame-plus-text cloud adapter and keep a fake
adapter for tests. Add the local adapter after the domain contract is stable.

### 7.2 Model policy

```ts
interface ModelPolicy {
  mode: "quality" | "balanced" | "local";
  allowCloudUpload: boolean;
  maxFrames: number;
  maxVideoSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  costBudget?: number;
}
```

The route must be selected by capability and policy, not by provider name in application code.

## 8. Job State Migration

The current aggregate has a strict version-1 state sequence. Inserting new states into that
sequence would make existing persisted job histories invalid.

Add `workflowVersion` and keep both flows:

```text
v1:
uploaded
  -> extracting_audio
  -> transcribing
  -> sampling_frames
  -> retrieving_knowledge
  -> evaluating
  -> completed

v2:
uploaded
  -> extracting_audio
  -> transcribing
  -> sampling_frames
  -> visually_understanding
  -> reasoning
  -> retrieving_knowledge
  -> evaluating
  -> completed
```

Rules:

- Snapshots without `workflowVersion` restore as version 1.
- New jobs use version 2.
- State validation selects the sequence by workflow version.
- Existing version-1 reports and jobs remain readable.
- Retry must restart from the failed durable stage, not recreate the asset.

For the first implementation, keep the aggregate state sequence linear even if ASR and frame
sampling can later run in parallel. Correct recovery is more important than early concurrency.

## 9. Report Contract Changes

Extend `VideoAnalysisReport` without deleting existing fields.

```ts
interface VideoAnalysisReport {
  // Existing fields remain.
  analysisMode: "multimodal" | "text_only" | "rules_fallback";
  modelSummary?: {
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    analyzedDurationMs: number;
    coverageRatio: number;
    partial: boolean;
  };
  understanding: VideoObservation & {
    claims?: ReasoningClaim[];
    narrative?: MultimodalUnderstanding["narrative"];
    visualCraft?: MultimodalUnderstanding["visualCraft"];
  };
}
```

The UI should display:

- Whether the result used multimodal, text-only, or fallback analysis.
- Evidence confidence and analyzed coverage.
- Timestamp evidence for important script, shot, and viral-hook conclusions.
- A partial-analysis warning when some slices failed.

## 10. Structured Output and Trust Boundary

All model responses are untrusted input.

Required controls:

1. Validate every provider response against a runtime schema.
2. Retry malformed structured output once with a repair request.
3. Reject unknown enum values and invalid timestamps.
4. Require evidence for observations and inferences.
5. Treat transcript, OCR, and on-screen instructions as untrusted content, not system commands.
6. Do not expose tools, filesystem access, or network actions to the reasoning prompt.
7. Never log API keys or raw authorization headers.
8. Store concise rationale only; do not request or persist hidden chain-of-thought.

Use the repository's current runtime-validation pattern for the first implementation. A schema
library can be introduced later if it removes meaningful duplication.

## 11. Persistence and Observability

Store normalized model runs separately from the public report:

```text
storage/model-runs/{jobId}/
  slice-{sliceId}.json
  reasoning.json
  evaluation.json
```

`ModelRunRecord` should include:

- `traceId`, `jobId`, stage, and slice ID.
- Provider and model identifiers.
- Prompt and schema versions.
- Input hash, not a duplicate raw video.
- Start time, latency, retry count, and status.
- Token or media usage when available.
- Validation errors and fallback decisions.

Suggested error codes:

```text
SOURCE_MULTIMODAL_MODEL_UNAVAILABLE
ANALYSIS_MULTIMODAL_OUTPUT_INVALID
ANALYSIS_MULTIMODAL_EVIDENCE_INSUFFICIENT
ANALYSIS_VIDEO_REASONING_PARTIAL
SYSTEM_MODEL_RUN_PERSISTENCE_FAILED
```

## 12. Degradation Rules

```text
Full multimodal succeeds
  -> analysisMode=multimodal

Visual model fails, transcript is usable
  -> text reasoning + OCR/rule observations
  -> analysisMode=text_only

Reasoning model fails, rule analyzer is usable
  -> current rule-based report
  -> analysisMode=rules_fallback

Only some slices fail
  -> continue with successful slices
  -> partial=true
  -> lower coverage and affected score confidence
```

Degradation must always be visible in the report and error log.

## 13. AI Comic Drama Adaptation

The AI-drama rubric should add:

- Character consistency across scenes.
- Relationship clarity in the opening.
- Conflict visibility without prior context.
- Reaction-shot effectiveness.
- Identity reveal and reversal timing.
- Visual-style drift between generated shots.
- Subtitle readability and dialogue ownership.
- Ending cliffhanger and next-episode motivation.

Sparse-frame analysis cannot reliably judge lip sync, motion continuity, or micro-expression.
Those dimensions should be marked `not_observed` unless the selected adapter analyzes video
temporally.

## 14. Performance Budget

Initial MVP boundaries:

- Analyze videos up to 5 minutes.
- Generate a low-resolution analysis proxy rather than sending the original 500 MB asset.
- Cap sampled frames at 80.
- Process slices sequentially first; add bounded concurrency only after provider limits are known.
- Cache slice results by video hash, slice boundaries, model, prompt version, and schema version.
- Target a complete result within 2 minutes for a typical video under 3 minutes.

The job API remains asynchronous, so a timeout must fail or degrade the active stage without
blocking the upload request.

## 15. TDD Plan

### 15.1 Domain tests

- Reject claims without evidence.
- Reject evidence outside the video duration.
- Calculate coverage correctly for overlapping slices.
- Reduce score confidence when evidence coverage is low.
- Restore old version-1 jobs after version-2 states are introduced.
- Reject illegal transitions separately for version 1 and version 2.

### 15.2 Application tests

- Build the correct evidence bundle from transcript, frames, and OCR.
- Run visual analysis before temporal reasoning.
- Retrieve RAG knowledge from model-derived narrative signals.
- Generate a completed multimodal report.
- Degrade to text-only when visual analysis fails.
- Degrade to rules when reasoning fails.
- Mark partial results when one slice fails.
- Persist model-run metadata without blocking a usable fallback report if metadata storage fails.

### 15.3 Adapter contract tests

- Normalize a valid structured provider response.
- Reject malformed JSON and unknown enum values.
- Retry one transient timeout.
- Stop retrying on an authentication error.
- Enforce frame and duration limits.
- Redact credentials from errors.

### 15.4 Evaluation fixture set

Create a small reviewed fixture set:

- Four AI comic-drama videos.
- Three talking-head videos.
- Three mixed or screen-recording videos.

Human annotations should cover:

- Scene boundaries.
- Opening hook.
- Main conflict or claim.
- Reversal or payoff.
- Strong and weak shots.
- Subtitle issues.
- Expected AI-drama signals.

Release gates:

- 100% valid structured output after retry or explicit fallback.
- 100% of major conclusions contain evidence references.
- No silent fallback.
- No regression in existing upload, job, report, and rule-analysis tests.

## 16. Implementation Phases

### P0: evidence-backed multimodal demonstration

1. Add workflow-versioned job states.
2. Add evidence and multimodal domain types with validators.
3. Add adaptive frame sampling and timeline-slice construction.
4. Add `MultimodalUnderstandingPort`.
5. Add `services/multimodal-reasoner` with one provider adapter and a fake adapter.
6. Add slice observation and temporal reasoning use cases.
7. Feed normalized reasoning into the current evaluation report.
8. Display analysis mode, confidence, coverage, and timestamp evidence.

### P1: quality and RAG

1. Add vector retrieval while preserving keyword fallback.
2. Generate RAG queries from narrative claims and visual weaknesses.
3. Add prompt and rubric version management.
4. Add the reviewed ten-video evaluation fixture set.
5. Add bounded slice concurrency, caching, and cost budgets.

### P2: local and advanced temporal analysis

1. Add a local vision-language adapter.
2. Add direct-video quality mode.
3. Add character tracking and cross-shot identity consistency.
4. Add motion, lip-sync, and finer continuity evaluation where model capability allows.
5. Add provider quality, latency, and cost comparison.

## 17. Expected Module Layout

```text
src/domain/multimodalIntelligence
src/application/useCases/buildVideoEvidenceBundle.ts
src/application/useCases/understandVideoSlices.ts
src/application/useCases/reasonAboutVideo.ts
src/application/ports/MultimodalUnderstandingPort.ts
src/application/ports/ContentReasoningPort.ts
src/application/ports/ModelRunRepositoryPort.ts
src/infrastructure/multimodal
src/infrastructure/modelRuns
services/multimodal-reasoner
tests/fixtures/video-evaluation
```

## 18. What Already Exists

Reuse these current capabilities:

- `runVideoAnalysisJob` as the main application orchestrator.
- `VideoAnalysisJob` as the lifecycle aggregate.
- FFmpeg audio extraction and frame sampling.
- FunASR transcription.
- PaddleOCR subtitle extraction.
- Local report, job, and error-log repositories.
- Asynchronous job creation, polling, and report retrieval.
- Rule analysis as a required fallback.

The new design replaces the current `Sampled frame X` observation and rule-only inference. It
does not replace the upload, task, ASR, OCR, or report-delivery infrastructure.

## 19. Not in Scope

- Training or fine-tuning a foundation model: unnecessary before a stable labeled fixture set.
- Building a general-purpose agent platform: no tool execution is needed for video evaluation.
- Real-time streaming analysis: the current product is asynchronous upload analysis.
- Full production queue and distributed scheduler: keep the existing scheduler until local model
  latency or concurrent users justify a durable queue.
- Automatic publishing to social platforms: unrelated to evidence-backed content understanding.

## 20. Recommended First Slice

The smallest useful implementation is:

```text
Adaptive frames + transcript + OCR
  -> one multimodal slice analyzer
  -> one temporal reasoning call
  -> evidence-backed script / shot / hook report
  -> visible text-only and rule fallback
```

This proves the key product claim: Bowen can explain what is happening in a video and why a
specific script, shot, or hook works, instead of only applying keyword rules.

## 21. Production Failure Modes

| Code path | Realistic failure | Test | Handling | User-visible result |
| --- | --- | --- | --- | --- |
| Media probing | Damaged container has no readable duration | Adapter contract test | Reject or use guarded fallback metadata | Clear media preparation failure |
| Adaptive sampling | Very fast cuts exceed the frame cap | Domain policy test | Preserve opening, boundaries, and ending first | Coverage is lower and visible |
| Slice analysis | One provider request times out | Application fallback test | Retry once, then keep other slices | Partial multimodal report |
| Structured output | Provider returns invalid timestamps or enums | Schema contract test | Repair once, then reject that run | Partial or text-only report |
| Temporal reasoning | Model invents a reversal without evidence | Domain invariant test | Reject unsupported claim | Rule or text fallback |
| RAG retrieval | No relevant knowledge is found | Use-case test | Continue with an empty evidence list | Report marks missing knowledge evidence |
| Model-run storage | Metadata write fails after a usable result exists | Resilience test | Best-effort log, keep report | Report succeeds with diagnostic warning |
| Job persistence | New v2 history is read by old validation logic | Snapshot migration test | Version-select the legal flow | Structured query error, never silent corruption |
| Provider authentication | API key is invalid | Adapter test | Do not retry; redact credentials | Text-only or rules fallback |
| Long video | Input exceeds policy duration | Boundary test | Analyze a declared bounded range or reject by policy | Coverage and range are shown |

No new path may ship with a silent failure that lacks both a test and explicit error handling.

## 22. Parallelization Strategy

| Workstream | Modules touched | Depends on |
| --- | --- | --- |
| A. Domain contracts and workflow migration | `src/domain`, `src/infrastructure/jobs` | - |
| B. Evidence construction and adaptive sampling | `src/application`, `src/infrastructure/media` | Domain contracts |
| C. Multimodal reasoner service | `services/multimodal-reasoner` | Domain schema contract |
| D. Report integration and fallback orchestration | `src/application`, `src/infrastructure/reports` | A, B, C |
| E. Frontend evidence presentation | `app`, `src/interface` | Report contract |
| F. Evaluation fixtures and quality gates | `tests/fixtures`, `tests` | Domain schema contract |

Parallel lanes:

```text
Lane A: domain contracts -> workflow migration
Lane B: reasoner service adapter and fake provider
Lane C: evaluation fixtures and schema test cases

After A:
  Lane D: evidence construction and adaptive sampling

After A + B + D:
  Lane E: report integration and fallback orchestration

After report contract:
  Lane F: frontend evidence presentation
```

`src/application` is shared by evidence construction and report integration, so those two stages
should remain sequential. The reasoner service and fixture work can proceed in parallel once the
normalized schemas are agreed.
