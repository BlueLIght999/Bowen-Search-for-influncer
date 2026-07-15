# Video Analysis P2 Implementation Record

**Goal:** Add durable analysis jobs, structured error logs, report retrieval, independent asset/job APIs, and a stable progress read model while preserving the one-request local demo.

## Completed

- [x] Added `VideoAnalysisJob` aggregate with legal transitions, history, and failure stage.
- [x] Added local JSON job and report repositories.
- [x] Added JSONL runtime error logging under `storage/logs/errors.jsonl`.
- [x] Added `GET /api/video-analysis-jobs/:jobId`.
- [x] Added `GET /api/video-analysis-jobs/:jobId/report`.
- [x] Moved upload analysis orchestration into `runVideoAnalysisJob`.
- [x] Prevented repeated uploads from overwriting assets, jobs, or reports.
- [x] Added `uploadVideoAsset` and `createVideoAnalysisJob` application use cases.
- [x] Added `POST /api/video-assets`.
- [x] Added `POST /api/video-analysis-jobs`.
- [x] Preserved `POST /api/upload-video` as the local demo compatibility endpoint.
- [x] Added asset sidecar metadata so reloaded assets retain the original file name.
- [x] Added job progress projection with `progressPercent`, `currentStage`, and `isTerminal`.
- [x] Made recoverable error logging best-effort so logging failures do not break fallback analysis.
- [x] Made fatal job error logging best-effort so logging failures do not hide `VideoAnalysisJobExecutionError`.
- [x] Made API system error logging best-effort so logging failures do not hide structured HTTP errors.
- [x] Changed task creation to `202 Accepted` with in-process background execution.
- [x] Updated the frontend upload flow to upload asset, create job, poll progress, and fetch report.
- [x] Added `emotionalRhythm`, `differentiation`, and per-score reasons to the video analysis report.
- [x] Marked jobs as `failed` when background scheduling fails after the initial `uploaded` snapshot is persisted.

## Storage Layout

```text
storage/uploads
storage/audio
storage/frames
storage/jobs
storage/reports
storage/logs/errors.jsonl
```

## Verification

- Date: 2026-07-10
- Vitest latest verification before final run: targeted async creation/progress tests passed, 13 tests.
- Next.js production build: passed.
- PaddleOCR service tests: 2 passed.
- FunASR and PaddleOCR Python syntax compilation: passed.
