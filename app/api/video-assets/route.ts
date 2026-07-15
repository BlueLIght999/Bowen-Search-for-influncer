import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { uploadVideoAsset } from "../../../src/application/useCases/uploadVideoAsset";
import { LocalJsonlErrorLog } from "../../../src/infrastructure/logging/LocalJsonlErrorLog";
import { LocalVideoStorage } from "../../../src/infrastructure/storage/LocalVideoStorage";
import { appendApiErrorLogSafely } from "../../../src/interface/http/errorLogging";
import { createTraceId } from "../../../src/interface/http/response";

export const dynamic = "force-dynamic";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const SUPPORTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
  "video/x-m4v",
  "video/mpeg",
  "video/avi"
]);
const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
  "m4v",
  "mpeg",
  "mpg"
]);

export async function POST(request: Request) {
  const traceId = createTraceId(randomUUID());
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return failure(400, traceId, "REQUEST_INVALID_MULTIPART", "无效的上传表单。");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return failure(400, traceId, "REQUEST_VIDEO_FILE_REQUIRED", "缺少视频文件。");
  }

  const format = getVideoFormat(file.name);
  if (!isSupportedVideo(file, format)) {
    return failure(
      415,
      traceId,
      "REQUEST_UNSUPPORTED_VIDEO_FORMAT",
      "仅支持 mp4、mov、webm、mkv、avi、m4v、mpeg 或 mpg 视频。"
    );
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return failure(
      413,
      traceId,
      "REQUEST_VIDEO_FILE_TOO_LARGE",
      "视频文件不能超过 500MB。"
    );
  }

  const assetId = `video_${randomUUID()}`;
  const storage = new LocalVideoStorage();

  try {
    const asset = await uploadVideoAsset({
      request: {
        assetId,
        fileName: file.name,
        data: Buffer.from(await file.arrayBuffer())
      },
      storage
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          asset: {
            ...asset,
            format,
            mimeType: file.type || "unknown",
            size: file.size,
            uploadedAt: new Date().toISOString()
          }
        },
        traceId
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video asset upload failed.";
    await appendApiErrorLogSafely(new LocalJsonlErrorLog(), {
      traceId,
      code: "SYSTEM_VIDEO_ASSET_STORAGE_FAILED",
      stage: "uploaded",
      message,
      detail: error instanceof Error ? { name: error.name, stack: error.stack } : error,
      timestamp: new Date().toISOString()
    });
    return failure(
      500,
      traceId,
      "SYSTEM_VIDEO_ASSET_STORAGE_FAILED",
      "视频保存失败，请检查本地存储空间后重试。"
    );
  }
}

function failure(status: number, traceId: string, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      traceId
    },
    { status }
  );
}

function isSupportedVideo(file: File, format: string): boolean {
  return SUPPORTED_VIDEO_TYPES.has(file.type) || SUPPORTED_VIDEO_EXTENSIONS.has(format);
}

function getVideoFormat(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}
