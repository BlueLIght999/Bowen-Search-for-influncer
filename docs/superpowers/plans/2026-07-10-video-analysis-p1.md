# Video Analysis P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the upload MVP from process-status reporting to structured frame observations and explainable RAG evidence that directly influence the final content report.

**Architecture:** Keep ffmpeg and future OCR/vision models behind ports. Build a filesystem frame catalog, a pure `understandUploadedVideo` use case, and an explainable knowledge retrieval result; pass those outputs into the existing analysis use case and UI without breaking P0 response fields.

**Tech Stack:** Next.js 16, TypeScript, Node filesystem APIs, ffmpeg adapter, Vitest, current static Bowen knowledge base.

## Global Constraints

- Preserve all existing P0 upload, transcription, fallback, report, category, platform, and hot-list behavior.
- Every new behavior must begin with a failing Vitest test.
- Video understanding must remain a pure application/domain operation.
- Filesystem access belongs in infrastructure adapters.
- OCR and multimodal model inputs are optional signals; P1 must work when they are unavailable.
- RAG evidence must include the matched knowledge item, score, and human-readable match reasons.

---

### Task 1: Frame Catalog

**Files:**
- Create: `src/application/ports/FrameCatalogPort.ts`
- Create: `src/infrastructure/media/LocalFrameCatalog.ts`
- Test: `tests/LocalFrameCatalog.test.ts`

**Interfaces:**
- Consumes: `{ frameDirectory: string, everySeconds: number }`
- Produces: `FrameSampleAsset[]` with `index`, `timestampSeconds`, and `path`.

- [x] Write a failing test using a temporary directory containing `frame-001.jpg`, `frame-002.jpg`, and an unrelated file.
- [x] Run `npm test -- tests/LocalFrameCatalog.test.ts` and verify failure because the adapter is missing.
- [x] Implement sorted image discovery and timestamp calculation `(index - 1) * everySeconds`.
- [x] Run the targeted test and verify it passes.

### Task 2: Pure Video Understanding

**Files:**
- Create: `src/application/useCases/understandUploadedVideo.ts`
- Modify: `src/domain/types.ts`
- Test: `tests/understandUploadedVideo.test.ts`

**Interfaces:**
- Consumes: transcript, frame samples, optional OCR texts.
- Produces: `VideoObservation` containing content type, scene segments, visual tags, subtitle signals, AI drama signals, and evidence confidence.

- [x] Write failing tests for AI drama detection, frame-derived scene timing, and OCR subtitle signals.
- [x] Run `npm test -- tests/understandUploadedVideo.test.ts` and verify failure because the use case is missing.
- [x] Implement deterministic rule-based understanding with no external I/O.
- [x] Run the targeted test and verify it passes.

### Task 3: Explainable RAG Retrieval

**Files:**
- Modify: `src/engine/retrieveKnowledge.ts`
- Modify: `src/domain/types.ts`
- Test: `tests/retrieveKnowledgeEvidence.test.ts`

**Interfaces:**
- Produces: `retrieveKnowledgeEvidence(input): RetrievedKnowledge[]`.
- Preserves: `retrieveKnowledge(input): KnowledgeItem[]`.

- [x] Write failing tests requiring score and category/keyword match reasons.
- [x] Run `npm test -- tests/retrieveKnowledgeEvidence.test.ts` and verify failure because the export is missing.
- [x] Implement evidence retrieval and make the compatibility function map evidence to items.
- [x] Run the targeted test and verify it passes.

### Task 4: Upload Report Integration

**Files:**
- Modify: `app/api/upload-video/route.ts`
- Modify: `src/application/useCases/analyzeUploadedVideo.ts`
- Modify: `app/components/UploadPipelineSummary.tsx`
- Test: `tests/uploadVideoRoute.test.ts`
- Test: `tests/videoAnalysisReport.test.ts`
- Test: `tests/UploadPipelineSummary.test.tsx`

**Interfaces:**
- Upload response adds `frameSamples` and `videoObservation`.
- `VideoAnalysisReport` uses supplied observation and includes `knowledgeEvidence`.

- [x] Extend route/report/component tests with the new structured fields.
- [x] Run the targeted tests and verify expected failures.
- [x] Wire frame catalog and video understanding into the upload route.
- [x] Pass observation and knowledge evidence into report generation.
- [x] Render frame count, content type, and RAG evidence in the upload summary.
- [x] Run all targeted tests and verify they pass.

### Task 5: Verification

**Files:**
- No production file changes.

- [x] Run `npm test` and verify zero failures.
- [x] Run `npm run build` and verify the Next.js production build succeeds.
- [x] Run Python `py_compile` for `services/funasr-transcriber/app.py`.

### Task 6: PaddleOCR Subtitle Evidence

**Files:**
- Create: `src/application/ports/OcrPort.ts`
- Create: `src/application/useCases/recognizeFrameSubtitles.ts`
- Create: `src/infrastructure/ocr/PaddleOcrClient.ts`
- Create: `services/paddleocr-service/app.py`
- Create: `services/paddleocr-service/requirements.txt`
- Create: `services/paddleocr-service/test_app.py`
- Modify: `app/api/upload-video/route.ts`
- Modify: `src/application/useCases/analyzeUploadedVideo.ts`
- Modify: `app/components/UploadPipelineSummary.tsx`

- [x] Write failing tests for OCR service calls, empty-frame skipping, deduplication, and fallback.
- [x] Implement an OCR port and a PaddleOCR HTTP adapter.
- [x] Add an independent FastAPI PaddleOCR microservice.
- [x] Feed recognized subtitles into video understanding and evidence confidence.
- [x] Make subtitle evidence affect hook, aesthetic, and AI drama evaluation.
- [x] Display OCR status, subtitle count, and subtitle samples in the upload summary.
- [x] Install PaddlePaddle 3.3.1 and PaddleOCR 3.7.0 in an ignored service virtual environment.
- [x] Add a regression test for the Windows CPU inference configuration.
- [x] Verify a real image inference returns text and confidence.

## Verification Result

- Date: 2026-07-10
- Vitest: 21 test files, 126 tests passed.
- PaddleOCR service: 2 Python unit tests passed.
- Next.js: production build succeeded.
- FunASR and PaddleOCR services: Python syntax compilation succeeded.
- PaddleOCR smoke inference: recognized `NEXT EPISODE REVEALS THE TRUT` with confidence `0.9826`.

## PaddleOCR Runtime Note

PaddleOCR 3.7.0 on Windows CPU selected an MKL-DNN/oneDNN path by default and
PaddlePaddle 3.3.1 raised `ConvertPirAttribute2RuntimeAttribute` while running the
PP-OCRv6 models. The verified local configuration is:

```text
engine=paddle_static
enable_mkldnn=false
```

The service uses these defaults and allows validated deployments to opt back
into MKL-DNN with `PADDLEOCR_ENABLE_MKLDNN=true`.
