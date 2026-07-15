# FunASR Transcriber Service

Independent transcription microservice for Bowen.

It exposes a small HTTP API so the Next.js app can request video/audio transcription without loading ASR models inside the web process.

## API

```text
GET  /health
POST /transcribe
POST /transcribe-file
```

`POST /transcribe` JSON body:

```json
{
  "url": "https://example.com/video-or-audio",
  "title": "optional title",
  "description": "optional fallback hint",
  "platform": "bilibili"
}
```

`POST /transcribe-file` JSON body:

```json
{
  "audioPath": "storage/audio/video_123.wav",
  "title": "optional title",
  "fallbackText": "optional fallback transcript"
}
```

This endpoint is for the local upload MVP. The Next.js app extracts audio with
ffmpeg, then sends the local wav path to the FunASR service. If the file is
missing or FunASR fails and `fallbackText` is provided, the service returns a
`source: "fallback"` response instead of breaking the whole analysis flow.

Response:

```json
{
  "source": "funasr",
  "language": "zh",
  "duration": 0,
  "fullText": "...",
  "segments": [
    { "start": 0, "end": 0, "text": "..." }
  ]
}
```

## Run

```bash
cd services/funasr-transcriber
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8765
```

Then set the Next.js environment variable:

```bash
FUNASR_SERVICE_URL=http://127.0.0.1:8765
```

## Notes

- This service is intentionally separate from Next.js because FunASR model loading is heavy.
- Media is fetched with `yt-dlp`, so platform page URLs (bilibili/douyin/weibo/etc.) resolve to a real audio stream; `ffmpeg` then extracts 16kHz mono wav for FunASR.
- `ffmpeg` is resolved from PATH first; if it is missing, the bundled `imageio-ffmpeg` binary is used automatically, so no manual ffmpeg install is strictly required.
- For MVP stability, the Next.js API falls back to video title/description when this service is unavailable or a source cannot be fetched (login-gated or anti-scraping pages).
