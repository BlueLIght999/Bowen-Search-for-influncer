"use client";

import { Activity, ArrowRight, BookOpen, LoaderCircle, ListChecks } from "lucide-react";
import { useState } from "react";
import type { Category } from "../../../src/domain/types";
import type {
  InterviewDiagnosisReport,
  InterviewSuggestion,
  ViralityDimension,
} from "../../../src/domain/interview/types";
import { ScoreBadge } from "../shared/ScoreBadge";
import { ModeTag } from "../shared/ModeTag";
import { EmptyState } from "../shared/EmptyState";

const VIRALITY_LABELS: Record<ViralityDimension, string> = {
  hook: "钩子",
  emotional: "情绪",
  opinion: "观点",
  revelation: "揭示",
  conflict: "冲突",
  quotable: "金句",
  story: "故事",
  practical: "实用",
};

const PRIORITY_STYLES: Record<InterviewSuggestion["priority"], string> = {
  high: "text-amber-deep",
  medium: "text-flow-deep",
  low: "text-ink-mute",
};

const PRIORITY_LABELS: Record<InterviewSuggestion["priority"], string> = {
  high: "紧急",
  medium: "建议",
  low: "可选",
};

const TARGET_LABELS: Record<InterviewSuggestion["target"], string> = {
  question: "提问",
  structure: "结构",
  followup: "追问",
  pacing: "节奏",
  hook: "钩子",
};

export function InterviewDiagnosisTab({
  category,
  creatorPositioning,
  onNavigateToKnowledge,
  onNavigateToOutline,
}: {
  category: Category;
  creatorPositioning: string;
  onNavigateToKnowledge: (topic: string, guestProfile: string) => void;
  onNavigateToOutline: (topic: string, guestProfile: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [topic, setTopic] = useState("");
  const [guestProfile, setGuestProfile] = useState("");
  const [report, setReport] = useState<InterviewDiagnosisReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");

  async function runDiagnosis() {
    if (!transcript.trim()) {
      setError("请粘贴访谈文稿后再诊断。");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch("/api/interview-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          topic,
          creatorPositioning,
          guestProfile,
          transcript,
          commentSignals: "",
        }),
      });

      if (!response.ok) {
        throw new Error(`诊断失败：${response.status}`);
      }

      setReport((await response.json()) as InterviewDiagnosisReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "诊断失败，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <>
      {/* ── 输入区 ── */}
      <section className="animate-soft-rise border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-flow-deep">访谈诊断</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">粘贴访谈文稿开始诊断</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            分析访谈结构、提问质量、收藏触发点，给出可执行的改进建议。
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div>
            <label className="text-xs text-ink-mute" htmlFor="interview-transcript">
              访谈文稿
            </label>
            <textarea
              id="interview-transcript"
              className="mt-1 w-full resize-none border-b border-line bg-transparent py-2 text-sm leading-6 text-ink outline-none focus:border-flow-deep"
              placeholder="粘贴访谈完整文稿或字幕文本"
              rows={8}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-xs text-ink-mute" htmlFor="interview-topic">
                访谈主题
              </label>
              <input
                id="interview-topic"
                className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
                placeholder="如：AI对教育的影响"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                type="text"
              />
            </div>

            <div>
              <label className="text-xs text-ink-mute" htmlFor="guest-profile">
                嘉宾画像
              </label>
              <input
                id="guest-profile"
                className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
                placeholder="如：AI领域研究者，擅长通俗解释"
                value={guestProfile}
                onChange={(e) => setGuestProfile(e.target.value)}
                type="text"
              />
            </div>

            <button
              className="flex items-center gap-2 bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:bg-ink-mute"
              onClick={runDiagnosis}
              disabled={isAnalyzing || !transcript.trim()}
              type="button"
            >
              {isAnalyzing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              {isAnalyzing ? "正在诊断" : "开始诊断"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-xs leading-5 text-flow-deep">{error}</p>
        ) : null}
      </section>

      {/* ── 结果区 ── */}
      <section className="animate-soft-rise-2 pt-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-ink-mute">诊断结果</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">访谈诊断报告</h2>
        </div>

        {!report ? (
          <EmptyState
            icon={<Activity className="h-4 w-4" />}
            title="等待诊断"
            body="粘贴访谈文稿后点击「开始诊断」，将自动分析结构、提问质量、收藏触发点和改进建议。"
          />
        ) : (
          <DiagnosisReportView
            report={report}
            topic={topic}
            guestProfile={guestProfile}
            onNavigateToKnowledge={onNavigateToKnowledge}
            onNavigateToOutline={onNavigateToOutline}
          />
        )}
      </section>
    </>
  );
}

function DiagnosisReportView({
  report,
  topic,
  guestProfile,
  onNavigateToKnowledge,
  onNavigateToOutline,
}: {
  report: InterviewDiagnosisReport;
  topic: string;
  guestProfile: string;
  onNavigateToKnowledge: (topic: string, guestProfile: string) => void;
  onNavigateToOutline: (topic: string, guestProfile: string) => void;
}) {
  const { interviewStructure: structure, questionQuality: quality } = report;

  return (
    <div className="space-y-8">
      {/* 头部：模式标签 */}
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <p className="text-xs text-ink-mute">分析完成</p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            {topic || "访谈诊断"}
          </h3>
        </div>
        <ModeTag mode={report.analysisMode} source={report.source} />
      </div>

      {/* 两栏：结构分析 + 提问质量 */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* 访谈结构 */}
        <article className="border-t-2 border-ink pt-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-ink">访谈结构</h3>
            <ScoreBadge score={structure.structureScore} label="结构评分" />
          </div>
          <div className="space-y-3">
            <StructureItem label="开场模式" value={structure.openingPattern} />
            <StructureItem label="主题引入" value={structure.topicIntroduction} />
            <StructureItem label="提问推进" value={structure.questionProgression} />
            <StructureItem label="追问深度" value={structure.followUpDepth} />
            <StructureItem label="收尾模式" value={structure.closingPattern} />
          </div>
        </article>

        {/* 提问质量 */}
        <article className="border-t-2 border-ink pt-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-ink">提问质量</h3>
          </div>
          <div className="mb-4 grid grid-cols-4 gap-3">
            <ScoreBadge score={quality.questionDepth} label="深度" />
            <ScoreBadge score={quality.openness} label="开放性" />
            <ScoreBadge score={quality.followUpEffectiveness} label="追问" />
            <ScoreBadge score={quality.paceControl} label="节奏" />
          </div>
          {quality.strongQuestions.length > 0 ? (
            <div className="border-l-2 border-flow-deep pl-3">
              <p className="text-xs font-medium text-ink">优质提问</p>
              <ul className="mt-2 space-y-1">
                {quality.strongQuestions.map((q, i) => (
                  <li key={i} className="text-xs leading-5 text-ink-soft">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {quality.weakQuestions.length > 0 ? (
            <div className="mt-3 border-l-2 border-amber-deep pl-3">
              <p className="text-xs font-medium text-ink">待改进提问</p>
              <ul className="mt-2 space-y-1">
                {quality.weakQuestions.map((q, i) => (
                  <li key={i} className="text-xs leading-5 text-ink-soft">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>

      {/* 收藏触发点 */}
      {report.collectibleMoments.length > 0 ? (
        <article className="border-t-2 border-line pt-4">
          <h3 className="mb-4 text-sm font-semibold text-ink">收藏触发点</h3>
          <div className="space-y-3">
            {report.collectibleMoments.map((m, i) => (
              <div
                key={i}
                className="border-l-2 border-flow-deep pl-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-flow-deep">
                    {VIRALITY_LABELS[m.viralityDimension] ?? m.viralityDimension}
                  </span>
                  {m.timestampRange ? (
                    <span className="text-xs text-ink-mute">{m.timestampRange}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-ink">{m.moment}</p>
                <p className="mt-1 text-xs leading-5 text-ink-mute">{m.reason}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {/* 改进建议 */}
      {report.improvementSuggestions.length > 0 ? (
        <article className="border-t-2 border-line pt-4">
          <h3 className="mb-4 text-sm font-semibold text-ink">改进建议</h3>
          <ol className="space-y-3">
            {report.improvementSuggestions.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 border-l-2 border-line pl-3"
              >
                <span className="shrink-0 text-xs text-ink-mute">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">
                      {TARGET_LABELS[s.target]}
                    </span>
                    <span className={`text-xs ${PRIORITY_STYLES[s.priority]}`}>
                      {PRIORITY_LABELS[s.priority]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{s.issue}</p>
                  <p className="mt-1 text-xs leading-5 text-ink">{s.action}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {/* 跨 Tab 导航 */}
      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button
          className="flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-flow-deep hover:text-flow-deep"
          onClick={() => onNavigateToKnowledge(topic, guestProfile)}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
          查看相关知识
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          className="flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-flow-deep hover:text-flow-deep"
          onClick={() => onNavigateToOutline(topic, guestProfile)}
          type="button"
        >
          <ListChecks className="h-3.5 w-3.5" />
          生成改进提纲
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function StructureItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="border-l-2 border-line pl-3">
      <p className="text-xs font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{value}</p>
    </div>
  );
}
