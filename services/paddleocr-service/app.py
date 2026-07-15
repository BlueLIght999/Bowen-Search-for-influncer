from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class FrameInput(BaseModel):
    index: int = Field(ge=1)
    timestampSeconds: float = Field(ge=0)
    path: str


class RecognizeFramesRequest(BaseModel):
    frames: list[FrameInput]


class SubtitleSignal(BaseModel):
    frameIndex: int
    text: str
    confidence: float


class RecognizeFramesResponse(BaseModel):
    signals: list[SubtitleSignal]
    processedFrames: int
    engine: str = "paddleocr"


app = FastAPI(title="Bowen PaddleOCR Service", version="0.1.0")
_ocr_engine: Any | None = None
_ocr_lock = Lock()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "paddleocr"}


@app.post("/recognize-frames", response_model=RecognizeFramesResponse)
def recognize_frames(request: RecognizeFramesRequest) -> RecognizeFramesResponse:
    signals: list[SubtitleSignal] = []

    for frame in request.frames:
        frame_path = resolve_frame_path(frame.path)
        if not frame_path.is_file():
            continue

        for text, confidence in recognize_image(frame_path):
            cleaned = text.strip()
            if not cleaned:
                continue
            signals.append(
                SubtitleSignal(
                    frameIndex=frame.index,
                    text=cleaned,
                    confidence=max(0.0, min(1.0, confidence)),
                )
            )

    return RecognizeFramesResponse(
        signals=deduplicate_signals(signals),
        processedFrames=len(request.frames),
    )


def resolve_frame_path(value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate.resolve()

    repository_root = Path(
        os.getenv("BOWEN_REPOSITORY_ROOT", Path(__file__).resolve().parents[2])
    )
    resolved = (repository_root / candidate).resolve()
    try:
        resolved.relative_to(repository_root.resolve())
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Frame path leaves repository root.") from error
    return resolved


def get_ocr_engine() -> Any:
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine

    with _ocr_lock:
        if _ocr_engine is None:
            try:
                from paddleocr import PaddleOCR
            except ImportError as error:
                raise HTTPException(
                    status_code=503,
                    detail="PaddleOCR is not installed. See services/paddleocr-service/README.md.",
                ) from error

            _ocr_engine = PaddleOCR(
                lang=os.getenv("PADDLEOCR_LANG", "ch"),
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                engine=os.getenv("PADDLEOCR_ENGINE", "paddle_static"),
                enable_mkldnn=env_bool("PADDLEOCR_ENABLE_MKLDNN", False),
            )

    return _ocr_engine


def recognize_image(path: Path) -> list[tuple[str, float]]:
    engine = get_ocr_engine()

    if hasattr(engine, "predict"):
        return parse_v3_results(engine.predict(str(path)))

    return parse_legacy_results(engine.ocr(str(path), cls=False))


def parse_v3_results(results: Any) -> list[tuple[str, float]]:
    recognized: list[tuple[str, float]] = []
    for result in results or []:
        payload = getattr(result, "json", result)
        if callable(payload):
            payload = payload()
        if not isinstance(payload, dict):
            continue
        if isinstance(payload.get("res"), dict):
            payload = payload["res"]

        texts = payload.get("rec_texts") or []
        scores = payload.get("rec_scores") or []
        for index, text in enumerate(texts):
            confidence = to_float(scores[index] if index < len(scores) else 0.0)
            recognized.append((str(text), confidence))
    return recognized


def parse_legacy_results(results: Any) -> list[tuple[str, float]]:
    recognized: list[tuple[str, float]] = []
    for page in results or []:
        for line in page or []:
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            text_score = line[1]
            if not isinstance(text_score, (list, tuple)) or len(text_score) < 2:
                continue
            recognized.append((str(text_score[0]), to_float(text_score[1])))
    return recognized


def deduplicate_signals(signals: list[SubtitleSignal]) -> list[SubtitleSignal]:
    deduplicated: list[SubtitleSignal] = []
    seen: set[str] = set()

    for signal in signals:
        key = "".join(signal.text.split())
        if not key or key in seen:
            continue
        seen.add(key)
        deduplicated.append(signal)

    return deduplicated


def to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
