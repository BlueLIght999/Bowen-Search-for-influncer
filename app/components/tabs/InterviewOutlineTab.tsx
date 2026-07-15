"use client";

import {
  ChevronDown,
  LoaderCircle,
  ListChecks,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Category } from "../../../src/domain/types";
import type {
  InterviewOutline,
  InterviewQuestion,
  ViralityDimension,
} from "../../../src/domain/interview/types";
import { EmptyState } from "../shared/EmptyState";

const POTENTIAL_LABELS: Record<InterviewQuestion["collectiblePotential"], string> = {
  high: "高收藏",
  medium: "中收藏",
  low: "低收藏",
};

const POTENTIAL_STYLES: Record<InterviewQuestion["collectiblePotential"], string> = {
  high: "text-flow-deep",
  medium: "text-ink-soft",
  low: "text-ink-mute",
};

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

export interface OutlinePrefill {
  topic: string;
  guestProfile: string;
}

export function InterviewOutlineTab({
  category,
  creatorPositioning: sharedPositioning,
  prefill,
}: {
  category: Category;
  creatorPositioning: string;
  prefill: OutlinePrefill | null;
}) {
  const [topic, setTopic] = useState("");
  const [guestProfile, setGuestProfile] = useState("");
  const [creatorPositioning, setCreatorPositioning] = useState(sharedPositioning);
  const [outline, setOutline] = useState<InterviewOutline | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  // 同步共享定位
  useEffect(() => {
    setCreatorPositioning(sharedPositioning);
  }, [sharedPositioning]);

  // 应用来自知识库/诊断 Tab 的预填数据
  useEffect(() => {
    if (prefill) {
      if (prefill.topic) setTopic(prefill.topic);
      if (prefill.guestProfile) setGuestProfile(prefill.guestProfile);
    }
  }, [prefill]);

  async function generateOutline() {
    if (!topic.trim()) {
      setError("请输入访谈主题后再生成。");
      return;
    }

    setIsGenerating(true);
    setError("");
    setOutline(null);

    try {
      const response = await fetch("/api/interview-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          guestProfile,
          creatorPositioning,
          category,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `生成失败：${response.status}`);
      }

      setOutline((await response.json()) as InterviewOutline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      {/* ── 输入区 ── */}
      <section className="animate-soft-rise border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-flow-deep">提纲生成</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">输入选题生成访谈提纲</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            基于知识库策略生成钩子建议、主问题与追问、收尾策略和收藏亮点。
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div>
            <label className="text-xs text-ink-mute" htmlFor="outline-topic">
              访谈主题
            </label>
            <input
              id="outline-topic"
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
              placeholder="如：AI对教育的影响"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              type="text"
            />
          </div>

          <div>
            <label className="text-xs text-ink-mute" htmlFor="outline-guest">
              嘉宾画像
            </label>
            <input
              id="outline-guest"
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
              placeholder="如：AI领域研究者"
              value={guestProfile}
              onChange={(e) => setGuestProfile(e.target.value)}
              type="text"
            />
          </div>

          <div>
            <label className="text-xs text-ink-mute" htmlFor="outline-positioning">
              创作者定位
            </label>
            <input
              id="outline-positioning"
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
              placeholder="你的创作定位"
              value={creatorPositioning}
              onChange={(e) => setCreatorPositioning(e.target.value)}
              type="text"
            />
          </div>
        </div>

        <button
          className="mt-6 flex items-center gap-2 bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:bg-ink-mute"
          onClick={generateOutline}
          disabled={isGenerating || !topic.trim()}
          type="button"
        >
          {isGenerating ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListChecks className="h-3.5 w-3.5" />
          )}
          {isGenerating ? "正在生成" : "生成提纲"}
        </button>

        {error ? (
          <p className="mt-4 text-xs leading-5 text-flow-deep">{error}</p>
        ) : null}
      </section>

      {/* ── 结果区 ── */}
      <section className="animate-soft-rise-2 pt-8">
        <div className="mb-6">
          <p className="text-xs font-medium text-ink-mute">生成结果</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">访谈提纲</h2>
        </div>

        {!outline ? (
          <EmptyState
            icon={<ListChecks className="h-4 w-4" />}
            title="等待生成"
            body="输入访谈主题和嘉宾画像后点击「生成提纲」，将自动生成钩子建议、主问题与追问方向。"
          />
        ) : (
          <OutlineView outline={outline} />
        )}
      </section>
    </>
  );
}

function OutlineView({ outline }: { outline: InterviewOutline }) {
  return (
    <div className="space-y-8">
      {/* 头部 */}
      <div className="border-b border-line pb-3">
        <p className="text-xs text-ink-mute">提纲主题</p>
        <h3 className="mt-1 text-base font-semibold text-ink">{outline.topic}</h3>
        {outline.guestProfile ? (
          <p className="mt-1 text-xs text-ink-mute">嘉宾：{outline.guestProfile}</p>
        ) : null}
      </div>

      {/* 钩子建议 */}
      {outline.hookSuggestions.length > 0 ? (
        <article className="border-t-2 border-ink pt-4">
          <div className="mb-4 flex items-center gap-2 text-ink">
            <Sparkles className="h-4 w-4" />
            <h3 className="text-sm font-semibold">钩子建议</h3>
          </div>
          <ul className="space-y-2">
            {outline.hookSuggestions.map((hook, i) => (
              <li
                key={i}
                className="border-l-2 border-flow-deep pl-3 text-sm leading-6 text-ink-soft"
              >
                {hook}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {/* 访谈问题 */}
      {outline.questions.length > 0 ? (
        <article className="border-t-2 border-ink pt-4">
          <div className="mb-4 flex items-center gap-2 text-ink">
            <ListChecks className="h-4 w-4" />
            <h3 className="text-sm font-semibold">访谈问题</h3>
          </div>
          <div className="space-y-3">
            {outline.questions.map((q, i) => (
              <QuestionCard key={q.id ?? i} question={q} index={i} />
            ))}
          </div>
        </article>
      ) : null}

      {/* 收尾策略 */}
      {outline.closingStrategy ? (
        <article className="border-t-2 border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">收尾策略</h3>
          <p className="border-l-2 border-line pl-3 text-sm leading-6 text-ink-soft">
            {outline.closingStrategy}
          </p>
        </article>
      ) : null}

      {/* 收藏亮点 */}
      {outline.collectibleHighlights.length > 0 ? (
        <article className="border-t-2 border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">收藏亮点</h3>
          <ul className="space-y-2">
            {outline.collectibleHighlights.map((h, i) => (
              <li
                key={i}
                className="border-l-2 border-flow-deep pl-3 text-sm leading-6 text-ink-soft"
              >
                {h}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {/* 差异化角度 */}
      {outline.differentiationAngle ? (
        <article className="border-t-2 border-line pt-4">
          <div className="mb-3 flex items-center gap-2 text-ink">
            <Target className="h-4 w-4" />
            <h3 className="text-sm font-semibold">差异化角度</h3>
          </div>
          <p className="border-l-2 border-flow-deep pl-3 text-sm leading-6 text-ink">
            {outline.differentiationAngle}
          </p>
        </article>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  index,
}: {
  question: InterviewQuestion;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFollowUps = question.followUps.length > 0;

  return (
    <div className="border border-line p-4 transition hover:border-ink-mute">
      {/* 问题头部 */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-xs font-bold text-ink-mute">
          Q{index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-6 text-ink">{question.question}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs ${POTENTIAL_STYLES[question.collectiblePotential]}`}>
              {POTENTIAL_LABELS[question.collectiblePotential]}
            </span>
            {question.viralityDimension ? (
              <span className="text-xs text-flow-deep">
                {VIRALITY_LABELS[question.viralityDimension]}
              </span>
            ) : null}
          </div>
        </div>
        {hasFollowUps ? (
          <button
            className="shrink-0 text-ink-mute transition hover:text-ink"
            onClick={() => setExpanded(!expanded)}
            type="button"
            aria-label={expanded ? "收起追问" : "展开追问"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : null}
      </div>

      {/* 目的与预期方向 */}
      <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
        {question.purpose ? (
          <div className="border-l-2 border-line pl-3">
            <p className="text-xs font-medium text-ink">提问目的</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">{question.purpose}</p>
          </div>
        ) : null}
        {question.expectedDirection ? (
          <div className="border-l-2 border-line pl-3">
            <p className="text-xs font-medium text-ink">预期方向</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">{question.expectedDirection}</p>
          </div>
        ) : null}
      </div>

      {/* 追问（可展开） */}
      {hasFollowUps && expanded ? (
        <div className="mt-3 space-y-2 pl-7">
          <p className="text-xs font-medium text-ink">追问方向</p>
          {question.followUps.map((f, i) => (
            <div key={i} className="border-l-2 border-flow-deep pl-3">
              <p className="text-xs leading-5 text-ink">{f.question}</p>
              {f.trigger ? (
                <p className="mt-0.5 text-xs text-ink-mute">触发：{f.trigger}</p>
              ) : null}
              {f.purpose ? (
                <p className="mt-0.5 text-xs text-ink-mute">目的：{f.purpose}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
