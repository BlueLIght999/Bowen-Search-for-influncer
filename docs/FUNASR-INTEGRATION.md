# FunASR 独立微服务接入

## 目标

博闻需要把视频链接转成可分析文稿，但 ASR 模型加载重、依赖复杂，不适合放进 Next.js 进程。因此 FunASR 以独立微服务运行，Next.js 只通过 HTTP 调用。

## 当前链路

```text
用户选择热榜视频
  -> 前端 POST /api/transcribe-video
  -> Next.js 调用 TranscriptionPort
  -> FunAsrTranscriptionClient 请求 FunASR 微服务
  -> 返回 fullText + segments
  -> 右侧“视频文稿解析”展示真实转写
  -> 若服务不可用，自动 fallback 到标题/简介
```

## 新增文件

```text
services/funasr-transcriber/app.py
services/funasr-transcriber/requirements.txt
services/funasr-transcriber/README.md
src/application/ports/TranscriptionPort.ts
src/application/useCases/transcribeVideoReference.ts
src/infrastructure/transcription/FunAsrTranscriptionClient.ts
app/api/transcribe-video/route.ts
```

## 启动微服务

```powershell
cd F:\bowen-search\services\funasr-transcriber
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8765
```

Next.js 默认请求：

```text
http://localhost:8765/transcribe
```

可用环境变量覆盖：

```text
FUNASR_SERVICE_URL=http://127.0.0.1:8765
```

## API

### Next.js API

```text
POST /api/transcribe-video
```

Body 使用博闻内部 `VideoTrend`：

```json
{
  "id": "video-id",
  "platform": "bilibili",
  "title": "视频标题",
  "author": "作者",
  "url": "https://example.com/video",
  "description": "视频简介",
  "publishedAt": "2026-07-04T06:00:00.000Z",
  "viewCount": 200000,
  "likeCount": 5000,
  "favoriteCount": 2000,
  "commentCount": 800,
  "growthScore": 180,
  "growthReason": "5日快速增长"
}
```

Response：

```json
{
  "source": "funasr",
  "language": "zh",
  "fullText": "完整文稿",
  "segments": [
    { "start": 0, "end": 3.2, "text": "分段文本" }
  ]
}
```

`source` 也可能是 `fallback`，表示 FunASR 服务不可用或转写失败，系统使用标题/简介继续演示。

## 设计原则

- FunASR 只存在于 `infrastructure` 和 `services`，不进入 domain。
- UI 不直接调用 FunASR 微服务，只调用 Next.js API。
- 转写失败不能阻断主链路，必须 fallback。
- 后续如果换 faster-whisper 或云 ASR，只需要新增 `TranscriptionPort` 实现。

## 当前限制

- 媒体获取已用 `yt-dlp` 抓取平台页面的音频流（B 站/抖音/微博等网页链接可直接解析），`ffmpeg` 抽取为 16kHz 单声道 wav 后交给 FunASR。
- `ffmpeg` 优先取自 PATH；缺失时自动回退到 `imageio-ffmpeg` 自带二进制，无需手动安装。
- 抖音、微博等有登录态或反爬策略的链接仍可能抓取失败，此时链路自动 fallback 到标题/简介。
- 首次调用会加载 FunASR 模型并下载权重，耗时较长。
