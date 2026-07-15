# PaddleOCR Frame Service

Independent OCR microservice for Bowen sampled video frames.

## Install

Create a dedicated Python environment. Do not reuse the FunASR environment because
PaddlePaddle and speech-model dependencies have different compatibility needs.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

For a GPU machine, install the matching `paddlepaddle-gpu` wheel from the official
PaddlePaddle installation guide instead of the CPU package.

## Run

Run from the repository root so relative frame paths resolve correctly:

```powershell
.\services\paddleocr-service\.venv\Scripts\python.exe -m uvicorn services.paddleocr-service.app:app --host 127.0.0.1 --port 8770
```

Because the directory name contains a hyphen, the most reliable Windows command is:

```powershell
Set-Location services\paddleocr-service
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8770
```

Set the Next.js endpoint when using another host or port:

```powershell
$env:PADDLEOCR_SERVICE_URL="http://127.0.0.1:8770"
```

The service defaults to `paddle_static` with MKL-DNN disabled. This avoids a
PaddlePaddle 3.3.x Windows CPU oneDNN/PIR inference error observed with the
PP-OCRv6 models. Linux deployments can opt back in after validation:

```powershell
$env:PADDLEOCR_ENABLE_MKLDNN="true"
```

## API

- `GET /health`
- `POST /recognize-frames`

The request contains sampled frame metadata and local paths. The response returns
deduplicated subtitle signals with frame indexes and confidence scores.
