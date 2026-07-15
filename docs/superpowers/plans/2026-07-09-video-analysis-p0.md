# Video Analysis P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local-demonstrable upload video analysis flow with asset metadata, analysis job status, structured RAG-style report, and AI drama specific evaluation fields.

**Architecture:** Keep the existing Next.js MVP and four-layer structure. Add pure domain types and report builders first, then wire them through existing `analyzeUploadedVideo` and `upload-video` API route without introducing mandatory external services.

**Tech Stack:** Next.js 16, TypeScript, Vitest, existing local differentiation client, current static knowledge retrieval.

## Global Constraints

- Do not remove existing category switching, hot list behavior, or uploaded-video analysis fields.
- P0 must degrade gracefully when ffmpeg, FunASR, OCR, vector database, or LLM services are unavailable.
- Domain code must stay pure: no file, network, database, or environment access.
- API routes should parse protocol input and call application use cases.
- Keep the first implementation local-demo friendly.

---

### Task 1: Add Video Analysis Domain Types

**Files:**
- Modify: `src/domain/types.ts`
- Test: `tests/videoAnalysisReport.test.ts`

**Interfaces:**
- Produces: `VideoAnalysisJob`, `VideoAnalysisReport`, `Transcript`, `VideoObservation`, `ContentEvaluation`, `GeneratedViralOutline`.

- [x] **Step 1: Write failing tests**

Create `tests/videoAnalysisReport.test.ts` with tests that expect `analyzeUploadedVideo` to return a `report` field with job status, transcript confidence, AI drama signals, scores, suggestions, and generated outline.

- [x] **Step 2: Verify tests fail**

Run: `npm test -- tests/videoAnalysisReport.test.ts`
Expected: FAIL because `report` does not exist on `UploadedVideoAnalysis`.

- [x] **Step 3: Add minimal domain types**

Extend `src/domain/types.ts` with report/job types. Preserve existing exported interfaces.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- tests/videoAnalysisReport.test.ts`
Expected: still FAIL until Task 2 implements report generation.

### Task 2: Generate Structured Report In Use Case

**Files:**
- Modify: `src/application/useCases/analyzeUploadedVideo.ts`
- Test: `tests/videoAnalysisReport.test.ts`

**Interfaces:**
- Consumes: existing `UploadedVideoInput`, `SampleAnalysis`, `KnowledgeItem`, `DifferentiatedDirection`.
- Produces: `UploadedVideoAnalysis.report: VideoAnalysisReport`.

- [x] **Step 1: Keep failing test from Task 1**

Use the same failing test to drive implementation.

- [x] **Step 2: Implement minimal report builder inside use case**

Create deterministic P0 report data from transcript/title/analysis/knowledge/directions.

- [x] **Step 3: Verify targeted tests pass**

Run: `npm test -- tests/videoAnalysisReport.test.ts`
Expected: PASS.

### Task 3: Return Asset And Job Metadata From Upload Route

**Files:**
- Modify: `app/api/upload-video/route.ts`
- Test: `tests/uploadVideoRoute.test.ts`

**Interfaces:**
- Produces response fields: `asset`, `job`, `analysis.report`.

- [x] **Step 1: Add failing route test**

Extend upload route tests to assert upload response includes a stable-looking `asset.id`, `job.id`, `job.status`, and `analysis.report.jobId`.

- [x] **Step 2: Verify route test fails**

Run: `npm test -- tests/uploadVideoRoute.test.ts`
Expected: FAIL because response lacks asset/job metadata.

- [x] **Step 3: Add minimal asset/job response metadata**

Derive IDs locally from file metadata and timestamp. Keep response backward-compatible by preserving existing `uploadedVideo`, `prefill`, and `analysis` fields.

- [x] **Step 4: Verify route test passes**

Run: `npm test -- tests/uploadVideoRoute.test.ts`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- No code files.

- [x] **Step 1: Run unit tests**

Run: `npm test`
Expected: all tests pass.

- [x] **Step 2: Run build**

Run: `npm run build`
Expected: build completes without TypeScript errors.
