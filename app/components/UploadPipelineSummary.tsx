import type { ReactNode } from "react";
import { Clapperboard, FileText, Sparkles } from "lucide-react";
import type { FrameSampleAsset } from "../../src/application/ports/FrameCatalogPort";
import type {
  AudioExtractionResult,
  FrameSamplingResult
} from "../../src/application/ports/MediaProcessingPort";
import type { OcrProcessingResult } from "../../src/application/ports/OcrPort";
import type {
  CreatorInsights,
  TranscriptionResult,
  VideoAnalysisReport,
  VideoObservation
} from "../../src/domain/types";

export interface UploadPipelineResult {
  asset: {
    id: string;
    fileName: string;
    format: string;
    mimeType: string;
    size: number;
    storagePath: string;
    uploadedAt: string;
  };
  job: {
    id: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
    progressPercent?: number;
    currentStage?: string;
    isTerminal?: boolean;
  };
  mediaProcessing?: {
    audio: AudioExtractionResult;
    frames: FrameSamplingResult;
  };
  transcription?: TranscriptionResult;
  ocr?: OcrProcessingResult;
  frameSamples?: FrameSampleAsset[];
  videoObservation?: VideoObservation;
  report: VideoAnalysisReport;
}

export function UploadPipelineSummary({ result }: { result: UploadPipelineResult }) {
  return (
    <VideoAnalysisFocus
      fileName={result.asset.fileName}
      report={result.report}
      statusText={
        result.job.progressPercent !== undefined
          ? `分析完成 · ${result.job.progressPercent}%`
          : "分析完成"
      }
    />
  );
}

export function VideoAnalysisFocus({
  report,
  fileName,
  statusText
}: {
  report: VideoAnalysisReport;
  fileName?: string;
  statusText?: string;
}) {
  const sceneSuggestions = report.evaluation.suggestions.filter(
    (item) => item.target === "scene" || item.target === "subtitle"
  );
  const insights = report.creatorInsights ?? buildFallbackCreatorInsights(report);
  const metadataItems = buildAnalysisMetadata(report);
  const modelNotice = buildModelNotice(report);

  return (
    <section aria-label="视频分析结果">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-xs text-ink-mute">分析完成</p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            {fileName ?? report.video.filename}
          </h3>
          {metadataItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-mute">
              {metadataItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
          {modelNotice ? (
            <p className="mt-2 text-xs text-flow-deep">{modelNotice}</p>
          ) : null}
        </div>
        <p className="text-xs text-ink-mute">
          {statusText ?? `证据置信度：${confidenceLabel(report.understanding.evidenceConfidence)}`}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <AnalysisColumn
          icon={<FileText className="h-4 w-4" />}
          title="视频文稿理解"
          score={report.evaluation.scores.scriptQuality}
          scoreLabel="脚本优秀度"
        >
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink-soft">
            {report.transcript.text || "未识别到可用文稿。"}
          </p>
          <Insight label="主要内容" body={insights.script.mainContent} />
          <Insight label="爆点命中" body={insights.script.hookHits.join(" / ") || report.generatedOutline.hook} />
          <NumberedBlock label="文稿逻辑" items={insights.script.logicBeats} />
          <NumberedBlock label="改写方向" items={insights.script.rewriteDirections} accent />
        </AnalysisColumn>

        <AnalysisColumn
          icon={<Clapperboard className="h-4 w-4" />}
          title="视频画面/分镜理解"
          score={report.evaluation.scores.sceneDesign}
          scoreLabel="分镜表现"
        >
          <NumberedBlock label="画面理解" items={insights.visual.sceneUnderstanding} />
          <NumberedBlock label="分镜节奏" items={insights.visual.shotRhythm} />
          <NumberedBlock label="审美与字幕" items={insights.visual.aestheticIssues} />
          {sceneSuggestions.map((item) => (
            <Insight key={`${item.target}-${item.title}`} label={item.title} body={item.action} accent />
          ))}
        </AnalysisColumn>

        <AnalysisColumn
          icon={<Sparkles className="h-4 w-4" />}
          title="爆点拆解与改造建议"
          score={report.evaluation.scores.viralPotential}
          scoreLabel="爆点潜力"
        >
          <NumberedBlock label="爆点拆解" items={insights.viral.viralBreakdown} />
          <Insight label="命中原因" body={insights.viral.hitReasons.join(" / ") || report.evaluation.summary} />
          <NumberedBlock label="薄弱点" items={insights.viral.weakPoints} />
          <NumberedBlock label="同款爆款建议" items={insights.viral.remakeSuggestions} accent />
          <EvidenceList evidence={insights.viral.timestampEvidence} />
        </AnalysisColumn>
      </div>
    </section>
  );
}

export function EmptyAnalysisFocus() {
  return (
    <section aria-label="待分析内容" className="grid gap-5 lg:grid-cols-3">
      <EmptyColumn
        icon={<FileText className="h-4 w-4" />}
        title="视频文稿理解"
        body="上传后展示转写文稿、主要内容、文稿逻辑和可改写方向。"
      />
      <EmptyColumn
        icon={<Clapperboard className="h-4 w-4" />}
        title="视频画面/分镜理解"
        body="识别场景节奏、镜头承接、字幕可读性和需要补拍的位置。"
      />
      <EmptyColumn
        icon={<Sparkles className="h-4 w-4" />}
        title="爆点拆解与改造建议"
        body="判断已命中的爆点，并给出可执行的同款爆款改造建议。"
      />
    </section>
  );
}

function AnalysisColumn({
  icon,
  title,
  score,
  scoreLabel,
  children
}: {
  icon: ReactNode;
  title: string;
  score: number;
  scoreLabel: string;
  children: ReactNode;
}) {
  return (
    <article className="min-w-0 border-t-2 border-ink pt-4">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-ink">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-ink">{score}</p>
          <p className="text-xs text-ink-mute">{scoreLabel}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </article>
  );
}

function EmptyColumn({
  icon,
  title,
  body
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="min-h-36 border-t-2 border-line pt-4">
      <div className="flex items-center gap-2 text-ink-soft">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-4 max-w-xs text-sm leading-6 text-ink-mute">{body}</p>
    </article>
  );
}

function Insight({
  label,
  body,
  accent = false
}: {
  label: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div className={`border-l-2 pl-3 ${accent ? "border-flow-deep" : "border-line"}`}>
      <p className="text-xs font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{body}</p>
    </div>
  );
}

function NumberedBlock({
  label,
  items,
  accent = false
}: {
  label: string;
  items: string[];
  accent?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`border-l-2 pl-3 ${accent ? "border-flow-deep" : "border-line"}`}>
      <p className="text-xs font-medium text-ink">{label}</p>
      <NumberedList items={items} />
    </div>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="mt-2 space-y-2">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-3 text-xs leading-5 text-ink-soft">
          <span className="shrink-0 text-ink-mute">{String(index + 1).padStart(2, "0")}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function EvidenceList({
  evidence
}: {
  evidence: CreatorInsights["script"]["timestampEvidence"];
}) {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <div className="border-l-2 border-line pl-3">
      <p className="text-xs font-medium text-ink">时间戳依据</p>
      <div className="mt-2 space-y-1">
        {evidence.map((item) => (
          <p key={`${item.startMs}-${item.endMs}-${item.label}`} className="text-xs leading-5 text-ink-soft">
            {formatTimestampRange(item.startMs, item.endMs)} · {item.label}
          </p>
        ))}
      </div>
    </div>
  );
}

function buildFallbackCreatorInsights(report: VideoAnalysisReport): CreatorInsights {
  const scenes =
    report.understanding.scenes.length > 0
      ? report.understanding.scenes.map((scene) => scene.summary)
      : report.generatedOutline.sceneOutline;
  const hookSuggestions = report.evaluation.suggestions
    .filter((item) => item.target !== "scene" && item.target !== "subtitle")
    .map((item) => item.action);
  const sceneSuggestions = report.evaluation.suggestions
    .filter((item) => item.target === "scene" || item.target === "subtitle")
    .map((item) => item.action);
  const evidence = report.understanding.claims
    ?.flatMap((claim) =>
      claim.evidenceRefs.map((reference) => ({
        startMs: reference.startMs,
        endMs: reference.endMs,
        label: claim.statement
      }))
    )
    .slice(0, 6) ?? [];

  return {
    script: {
      mainContent: report.transcript.text || "未识别到完整文稿。",
      logicBeats: report.generatedOutline.scriptOutline,
      hookHits: report.evaluation.hitPatterns,
      rewriteDirections: hookSuggestions,
      timestampEvidence: evidence
    },
    visual: {
      sceneUnderstanding: scenes,
      shotRhythm: report.generatedOutline.sceneOutline,
      aestheticIssues: [report.evaluation.scoreReasons.aestheticExperience],
      timestampEvidence: evidence
    },
    viral: {
      viralBreakdown: [report.evaluation.scoreReasons.viralPotential],
      hitReasons: report.evaluation.hitPatterns,
      weakPoints: report.evaluation.missingPatterns,
      remakeSuggestions: [...hookSuggestions, ...sceneSuggestions, report.generatedOutline.endingHook].filter(Boolean),
      timestampEvidence: evidence
    }
  };
}

function buildModelNotice(report: VideoAnalysisReport): string | null {
  if (report.modelSummary?.provider === "fake") {
    return "当前为演示模型，未调用真实视觉大模型";
  }
  if (report.analysisMode === "text_only") {
    return "已降级为文稿分析，未完成画面理解";
  }
  if (report.analysisMode === "rules_fallback") {
    return "已降级为规则分析，建议补充文稿后重新分析";
  }
  return null;
}

function confidenceLabel(confidence: VideoObservation["evidenceConfidence"]): string {
  if (confidence === "high") {
    return "高";
  }
  if (confidence === "medium") {
    return "中";
  }
  return "低";
}

function buildAnalysisMetadata(report: VideoAnalysisReport): string[] {
  const items = [`分析模式：${analysisModeLabel(report.analysisMode)}`];
  if (report.modelSummary) {
    items.push(`模型：${report.modelSummary.provider} / ${report.modelSummary.model}`);
    items.push(`覆盖率：${formatPercent(report.modelSummary.coverageRatio)}`);
    items.push(report.modelSummary.partial ? "部分分析" : "完整分析");
  }

  const evidenceRange = report.understanding.claims?.[0]?.evidenceRefs?.[0];
  if (evidenceRange) {
    items.push(`证据片段：${formatTimestampRange(evidenceRange.startMs, evidenceRange.endMs)}`);
  }

  return items;
}

function analysisModeLabel(mode: VideoAnalysisReport["analysisMode"]): string {
  if (mode === "multimodal") {
    return "多模态";
  }
  if (mode === "text_only") {
    return "仅文稿";
  }
  return "规则兜底";
}

function formatPercent(value: number): string {
  const boundedValue = Math.max(0, Math.min(1, value));
  return `${Math.round(boundedValue * 100)}%`;
}

function formatTimestampRange(startMs: number, endMs: number): string {
  return `${formatTimestamp(startMs)}-${formatTimestamp(endMs)}`;
}

function formatTimestamp(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
