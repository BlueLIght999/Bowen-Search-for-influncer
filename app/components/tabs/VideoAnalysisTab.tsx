"use client";

import { FileVideo, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";
import type { Category, UploadedVideoAnalysis } from "../../../src/domain/types";
import {
  runVideoAnalysisPipelineClient,
  type VideoAnalysisJobProgressView
} from "../../../src/interface/videoAnalysis/runVideoAnalysisPipelineClient";
import {
  EmptyAnalysisFocus,
  UploadPipelineSummary,
  VideoAnalysisFocus,
  type UploadPipelineResult
} from "../UploadPipelineSummary";

export function VideoAnalysisTab({
  category,
  creatorPositioning
}: {
  category: Category;
  creatorPositioning: string;
}) {
  const [uploadedTitle, setUploadedTitle] = useState("");
  const [uploadedTranscript, setUploadedTranscript] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedAnalysis, setUploadedAnalysis] = useState<UploadedVideoAnalysis | null>(null);
  const [uploadedPipeline, setUploadedPipeline] = useState<UploadPipelineResult | null>(null);
  const [uploadJobProgress, setUploadJobProgress] = useState<VideoAnalysisJobProgressView | null>(null);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [isTextAnalyzing, setIsTextAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function analyzeUploadedText() {
    if (!uploadedTranscript.trim() && !uploadedTitle.trim()) {
      setUploadError("请上传视频，或填写视频文案后再分析。");
      return;
    }

    setIsTextAnalyzing(true);
    setUploadError("");
    setUploadedAnalysis(null);
    setUploadedPipeline(null);

    try {
      const response = await fetch("/api/analyze-uploaded-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          hotspot: uploadedTitle || "上传视频分析",
          title: uploadedTitle,
          transcript: uploadedTranscript,
          creatorPositioning,
          referenceTexts: []
        })
      });

      if (!response.ok) {
        throw new Error(`分析失败：${response.status}`);
      }

      setUploadedAnalysis((await response.json()) as UploadedVideoAnalysis);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "分析失败，请稍后重试。");
    } finally {
      setIsTextAnalyzing(false);
    }
  }

  async function uploadVideoForAnalysis(file: File | null) {
    if (!file) {
      return;
    }

    const title = uploadedTitle || file.name.replace(/\.[^.]+$/, "");
    setUploadedFileName(file.name);
    setUploadedTitle(title);
    setIsVideoUploading(true);
    setUploadError("");
    setUploadedAnalysis(null);
    setUploadedPipeline(null);
    setUploadJobProgress(null);

    try {
      const result = await runVideoAnalysisPipelineClient({
        file,
        jobInput: {
          category,
          title,
          hotspot: title,
          transcript: uploadedTranscript,
          creatorPositioning,
          referenceTexts: []
        },
        onProgress: setUploadJobProgress
      });

      setUploadedFileName(result.asset.fileName);
      setUploadedTitle(result.report.video.filename.replace(/\.[^.]+$/, "") || title);
      setUploadedTranscript(result.report.transcript.text);
      setUploadedPipeline({
        asset: result.asset,
        job: result.job,
        report: result.report
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "上传失败，请稍后重试。");
    } finally {
      setIsVideoUploading(false);
    }
  }

  const isAnalyzing = isVideoUploading || isTextAnalyzing;

  return (
    <>
      <section className="animate-soft-rise border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-flow-deep">上传分析</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">上传视频开始分析</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            上传后自动完成中文转写、画面抽帧和内容评估，结果只保留创作最需要的文案、分镜和爆点。
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <label className="group flex min-h-44 cursor-pointer flex-col items-center justify-center border border-dashed border-line px-6 py-8 text-center transition hover:border-flow-deep">
            <input
              className="sr-only"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,video/x-m4v,video/mpeg,.mp4,.mov,.webm,.mkv,.avi,.m4v,.mpeg,.mpg"
              disabled={isAnalyzing}
              onChange={(event) => uploadVideoForAnalysis(event.target.files?.[0] ?? null)}
              type="file"
            />
            {isVideoUploading ? (
              <LoaderCircle className="h-7 w-7 animate-spin text-flow-deep" />
            ) : (
              <Upload className="h-7 w-7 text-ink-soft transition group-hover:text-flow-deep" />
            )}
            <span className="mt-4 text-sm font-semibold text-ink">
              {isVideoUploading ? "正在分析视频" : "选择视频文件"}
            </span>
            <span className="mt-2 text-xs leading-5 text-ink-mute">
              支持 MP4、MOV、WEBM、MKV、AVI、M4V、MPEG
            </span>
            {uploadedFileName ? (
              <span className="mt-3 flex items-center gap-2 text-xs text-flow-deep">
                <FileVideo className="h-3.5 w-3.5" />
                {uploadedFileName}
              </span>
            ) : null}
          </label>

          <div className="space-y-5">
            <div>
              <label className="text-xs text-ink-mute" htmlFor="video-title">
                视频标题
              </label>
              <input
                id="video-title"
                className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
                placeholder="可选，用于补充内容主题"
                value={uploadedTitle}
                onChange={(event) => setUploadedTitle(event.target.value)}
                type="text"
              />
            </div>

            <div>
              <label className="text-xs text-ink-mute" htmlFor="video-transcript">
                视频文案
              </label>
              <textarea
                id="video-transcript"
                className="mt-1 w-full resize-none border-b border-line bg-transparent py-2 text-sm leading-6 text-ink outline-none focus:border-flow-deep"
                placeholder="转写服务不可用时，可在这里粘贴字幕或文案"
                rows={4}
                value={uploadedTranscript}
                onChange={(event) => setUploadedTranscript(event.target.value)}
              />
            </div>

            <button
              className="flex items-center gap-2 bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:bg-ink-mute"
              onClick={analyzeUploadedText}
              disabled={isAnalyzing || (!uploadedTranscript.trim() && !uploadedTitle.trim())}
              type="button"
            >
              {isTextAnalyzing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileVideo className="h-3.5 w-3.5" />
              )}
              {isTextAnalyzing ? "正在分析" : "仅分析文案"}
            </button>
          </div>
        </div>

        {uploadJobProgress && isVideoUploading ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-mute">
              <span>{stageLabel(uploadJobProgress.currentStage)}</span>
              <span>{uploadJobProgress.progressPercent}%</span>
            </div>
            <div className="h-1 overflow-hidden bg-line">
              <div
                className="h-full bg-flow-deep transition-[width]"
                style={{ width: `${uploadJobProgress.progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        {uploadError ? (
          <p className="mt-4 text-xs leading-5 text-flow-deep">{uploadError}</p>
        ) : null}
      </section>

      <section className="animate-soft-rise-2 pt-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-ink-mute">分析结果</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">创作诊断</h2>
        </div>

        {uploadedPipeline ? (
          <UploadPipelineSummary result={uploadedPipeline} />
        ) : uploadedAnalysis ? (
          <VideoAnalysisFocus
            fileName={uploadedTitle || uploadedAnalysis.report.video.filename}
            report={uploadedAnalysis.report}
            statusText="文案分析完成"
          />
        ) : (
          <EmptyAnalysisFocus />
        )}
      </section>
    </>
  );
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    uploaded: "视频已上传",
    extracting_audio: "正在提取音频",
    transcribing: "正在识别视频文案",
    sampling_frames: "正在分析分镜",
    visually_understanding: "正在理解视频画面",
    reasoning: "正在推理内容结构",
    retrieving_knowledge: "正在检索爆点知识",
    evaluating: "正在生成诊断",
    completed: "分析完成",
    failed: "分析失败"
  };
  return labels[stage] ?? "正在分析";
}
