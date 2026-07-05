import { NextResponse } from "next/server";
import { analyzeUploadedVideo } from "../../../src/application/useCases/analyzeUploadedVideo";
import { isCategory } from "../../../src/domain/categories";
import { defaultInput } from "../../../src/domain/sampleInputs";
import type { Category, UploadedVideoInput } from "../../../src/domain/types";
import { LocalDifferentiationClient } from "../../../src/infrastructure/differentiation/LocalDifferentiationClient";

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

const SUPPORTED_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpeg", "mpg"]);

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  }

  const format = getVideoFormat(file.name);
  if (!isSupportedVideo(file, format)) {
    return NextResponse.json(
      {
        error: "Unsupported video format. Please upload mp4, mov, webm, mkv, avi, m4v, mpeg, or mpg."
      },
      { status: 415 }
    );
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json({ error: "Video file is too large. Maximum size is 500MB." }, { status: 413 });
  }

  const categoryValue = asString(formData.get("category"));
  const category: Category = isCategory(categoryValue) ? categoryValue : defaultInput.category;
  const providedTitle = asString(formData.get("title"));
  const title = providedTitle || stripExtension(file.name) || "上传视频分析";
  const providedTranscript = asString(formData.get("transcript"));
  const referenceTexts = parseReferenceTexts(asString(formData.get("referenceTexts")));
  const transcript = providedTranscript || buildUploadTranscript({ file, format, title });

  const input: UploadedVideoInput = {
    category,
    hotspot: asString(formData.get("hotspot")) || title,
    title,
    transcript,
    commentSignals: asString(formData.get("commentSignals")),
    creatorPositioning: asString(formData.get("creatorPositioning")) || `面向${category}受众的创作者`
  };

  const analysis = await analyzeUploadedVideo({
    input,
    differentiator: new LocalDifferentiationClient(),
    referenceTexts
  });

  return NextResponse.json({
    uploadedVideo: {
      fileName: file.name,
      format,
      mimeType: file.type || "unknown",
      size: file.size
    },
    prefill: {
      title,
      transcript,
      category,
      hotspot: input.hotspot
    },
    analysis
  });
}

function isSupportedVideo(file: File, format: string): boolean {
  return SUPPORTED_VIDEO_TYPES.has(file.type) || SUPPORTED_VIDEO_EXTENSIONS.has(format);
}

function getVideoFormat(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseReferenceTexts(value: string): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildUploadTranscript({ file, format, title }: { file: File; format: string; title: string }): string {
  return [
    `已上传视频：${file.name}`,
    `视频标题：${title}`,
    `视频格式：${format || file.type || "unknown"}`,
    `文件大小：${Math.max(1, Math.round(file.size / 1024))}KB`,
    "AI解析配置：优先识别脚本结构、分镜节奏、审美体验、传播记忆点和差异化表达。",
    "当前本地演示会先基于文件元数据生成分析；接入 FunASR 服务后可自动替换为真实视频转写文稿。"
  ].join("\n");
}
