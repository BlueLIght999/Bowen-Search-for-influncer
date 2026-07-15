from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="Bowen FunASR Transcriber", version="0.1.0")

_model: Any | None = None


class TranscribeRequest(BaseModel):
    url: HttpUrl
    title: str | None = None
    description: str | None = None
    platform: str | None = None


class TranscribeFileRequest(BaseModel):
    audioPath: str
    title: str | None = None
    fallbackText: str | None = None


class TranscriptionSegment(BaseModel):
    start: float = 0
    end: float = 0
    text: str


class TranscriptionResponse(BaseModel):
    source: str = "funasr"
    language: str = "zh"
    duration: float | None = None
    fullText: str
    segments: list[TranscriptionSegment]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscriptionResponse)
def transcribe(payload: TranscribeRequest) -> TranscriptionResponse:
    media_path = _download_media(str(payload.url))

    try:
        return _transcribe_media_path(media_path, _fallback_text(payload))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"FunASR transcription failed: {exc}") from exc
    finally:
        shutil.rmtree(media_path.parent, ignore_errors=True)


@app.post("/transcribe-file", response_model=TranscriptionResponse)
def transcribe_file(payload: TranscribeFileRequest) -> TranscriptionResponse:
    audio_path = Path(payload.audioPath)
    fallback_text = "\n".join(part for part in [payload.title or "", payload.fallbackText or ""] if part).strip()

    if not audio_path.is_file():
        if fallback_text:
            return TranscriptionResponse(
                source="fallback",
                fullText=fallback_text,
                segments=[TranscriptionSegment(start=0, end=0, text=fallback_text)],
            )
        raise HTTPException(status_code=404, detail=f"Audio file not found: {audio_path}")

    try:
        return _transcribe_media_path(audio_path, fallback_text)
    except Exception as exc:
        if fallback_text:
            return TranscriptionResponse(
                source="fallback",
                fullText=fallback_text,
                segments=[TranscriptionSegment(start=0, end=0, text=fallback_text)],
            )
        raise HTTPException(status_code=500, detail=f"FunASR file transcription failed: {exc}") from exc


def _get_model() -> Any:
    global _model
    if _model is None:
        from funasr import AutoModel

        model_name = os.getenv("FUNASR_MODEL", "paraformer-zh")
        vad_model = os.getenv("FUNASR_VAD_MODEL", "fsmn-vad")
        punc_model = os.getenv("FUNASR_PUNC_MODEL", "ct-punc")
        device = os.getenv("FUNASR_DEVICE", "cpu")

        _model = AutoModel(
            model=model_name,
            vad_model=vad_model,
            punc_model=punc_model,
            device=device,
        )
    return _model


def _transcribe_media_path(media_path: Path, fallback_text: str) -> TranscriptionResponse:
    model = _get_model()
    raw_result = model.generate(input=str(media_path))
    segments = _normalize_segments(raw_result)

    if not segments and fallback_text:
        segments = [TranscriptionSegment(start=0, end=0, text=fallback_text)]

    full_text = "\n".join(segment.text for segment in segments if segment.text).strip()
    return TranscriptionResponse(fullText=full_text, segments=segments)


def _resolve_ffmpeg_dir() -> str | None:
    """Return a directory that contains BOTH ffmpeg and ffprobe.

    yt-dlp's audio postprocessor requires ffprobe in addition to ffmpeg, so a
    single ffmpeg binary (e.g. the one bundled with imageio-ffmpeg) is not
    enough. Search order:

    1. A directory on PATH that has both ffmpeg and ffprobe.
    2. A winget-installed Gyan.FFmpeg full build (ffmpeg + ffprobe).
    3. Fall back to imageio-ffmpeg's directory (ffmpeg only) as a last resort;
       yt-dlp will still error if it needs ffprobe, which surfaces as a clean
       500 and the Next.js layer falls back to title/description.
    """
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        directory = Path(system_ffmpeg).parent
        if (directory / _exe("ffprobe")).exists():
            return str(directory)

    winget_dir = _find_winget_ffmpeg_dir()
    if winget_dir:
        return winget_dir

    try:
        import imageio_ffmpeg

        return str(Path(imageio_ffmpeg.get_ffmpeg_exe()).parent)
    except Exception:
        return None


def _exe(name: str) -> str:
    return f"{name}.exe" if os.name == "nt" else name


def _find_winget_ffmpeg_dir() -> str | None:
    """Locate a Gyan.FFmpeg full build installed via winget (Windows)."""
    local_appdata = os.getenv("LOCALAPPDATA")
    if not local_appdata:
        return None

    packages = Path(local_appdata) / "Microsoft" / "WinGet" / "Packages"
    if not packages.is_dir():
        return None

    for ffprobe in packages.glob("Gyan.FFmpeg*/**/bin/ffprobe.exe"):
        if (ffprobe.parent / "ffmpeg.exe").exists():
            return str(ffprobe.parent)
    return None


def _download_media(url: str) -> Path:
    """Fetch a video/audio source and return a 16kHz mono wav path.

    Uses yt-dlp so platform page URLs (bilibili/douyin/weibo/etc.) resolve to a
    real media stream, then extracts audio via ffmpeg into the format FunASR
    expects. Direct audio/media URLs are handled by the same path.
    """
    import yt_dlp

    work_dir = Path(tempfile.mkdtemp(prefix="bowen-asr-"))

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(work_dir / "media.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        "no_warnings": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) bowen-funasr-transcriber/0.1",
        },
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
        # FunASR expects 16kHz mono audio.
        "postprocessor_args": ["-ar", "16000", "-ac", "1"],
    }

    ffmpeg_dir = _resolve_ffmpeg_dir()
    if ffmpeg_dir:
        ydl_opts["ffmpeg_location"] = ffmpeg_dir

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    wav_files = list(work_dir.glob("*.wav"))
    if not wav_files:
        raise RuntimeError("yt-dlp produced no audio output")

    return wav_files[0]


def _normalize_segments(raw_result: Any) -> list[TranscriptionSegment]:
    if not isinstance(raw_result, list):
        raw_result = [raw_result]

    segments: list[TranscriptionSegment] = []
    for item in raw_result:
        if not isinstance(item, dict):
            continue

        sentence_info = item.get("sentence_info")
        if isinstance(sentence_info, list):
            for sentence in sentence_info:
                if not isinstance(sentence, dict):
                    continue
                text = str(sentence.get("text") or "").strip()
                if text:
                    segments.append(
                        TranscriptionSegment(
                            start=_milliseconds_to_seconds(sentence.get("start")),
                            end=_milliseconds_to_seconds(sentence.get("end")),
                            text=text,
                        )
                    )

        text = str(item.get("text") or "").strip()
        if text and not segments:
            segments.append(TranscriptionSegment(start=0, end=0, text=text))

    return segments


def _milliseconds_to_seconds(value: Any) -> float:
    if isinstance(value, (int, float)):
        return round(float(value) / 1000, 3)
    return 0


def _fallback_text(payload: TranscribeRequest) -> str:
    return "\n".join(
        part
        for part in [
            f"标题：{payload.title}" if payload.title else "",
            f"简介：{payload.description}" if payload.description else "",
        ]
        if part
    )
