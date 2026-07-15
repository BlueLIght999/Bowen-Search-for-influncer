"use client";

import { ArrowRight, BookOpen, LoaderCircle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { KnowledgeItem } from "../../../src/domain/types";
import { EmptyState } from "../shared/EmptyState";

const TYPE_LABELS: Record<string, string> = {
  interview_technique: "访谈技巧",
  interview_hook: "钩子模式",
  interview_structure: "内容结构",
  interview_collectible: "收藏触发",
  hook_strategy: "钩子策略",
  script_structure: "脚本结构",
  scene_design: "分镜设计",
  ai_drama_pattern: "AI漫剧",
  aesthetic_rule: "审美规则",
  platform_growth_rule: "平台增长",
};

export interface KnowledgePrefill {
  topic: string;
  guestProfile: string;
}

export function InterviewKnowledgeTab({
  prefill,
  onNavigateToOutline,
}: {
  prefill: KnowledgePrefill | null;
  onNavigateToOutline: (topic: string, guestProfile: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [guestProfile, setGuestProfile] = useState("");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [source, setSource] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  // 应用来自诊断 Tab 的预填数据
  useEffect(() => {
    if (prefill) {
      if (prefill.topic) setTopic(prefill.topic);
      if (prefill.guestProfile) setGuestProfile(prefill.guestProfile);
    }
  }, [prefill]);

  async function searchKnowledge() {
    if (!topic.trim()) {
      setError("请输入访谈主题后再搜索。");
      return;
    }

    setIsSearching(true);
    setError("");
    setHasSearched(true);

    try {
      const params = new URLSearchParams({
        topic,
        guestProfile,
        creatorPositioning: "",
        sampleText: "",
      });
      const response = await fetch(`/api/interview-knowledge?${params}`);

      if (!response.ok) {
        throw new Error(`搜索失败：${response.status}`);
      }

      const data = (await response.json()) as {
        items: KnowledgeItem[];
        count: number;
        source: string;
      };
      setItems(data.items);
      setSource(data.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败，请稍后重试。");
      setItems([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <>
      {/* ── 输入区 ── */}
      <section className="animate-soft-rise border-b border-line pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-flow-deep">技巧知识库</p>
          <h2 className="mt-2 text-2xl font-bold text-ink">搜索访谈技巧与策略</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            从案例拆解知识库中检索访谈技巧、钩子模式、内容结构和收藏触发点。
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)_auto]">
          <div>
            <label className="text-xs text-ink-mute" htmlFor="knowledge-topic">
              访谈主题
            </label>
            <input
              id="knowledge-topic"
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
              placeholder="如：AI对教育的影响"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              type="text"
            />
          </div>

          <div>
            <label className="text-xs text-ink-mute" htmlFor="knowledge-guest">
              嘉宾画像
            </label>
            <input
              id="knowledge-guest"
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-sm text-ink outline-none focus:border-flow-deep"
              placeholder="可选，辅助匹配"
              value={guestProfile}
              onChange={(e) => setGuestProfile(e.target.value)}
              type="text"
            />
          </div>

          <div className="flex items-end">
            <button
              className="flex items-center gap-2 bg-ink px-4 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:bg-ink-mute"
              onClick={searchKnowledge}
              disabled={isSearching || !topic.trim()}
              type="button"
            >
              {isSearching ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {isSearching ? "正在搜索" : "搜索知识"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-xs leading-5 text-flow-deep">{error}</p>
        ) : null}
      </section>

      {/* ── 结果区 ── */}
      <section className="animate-soft-rise-2 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-ink-mute">搜索结果</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">访谈策略知识</h2>
          </div>
          {hasSearched && items.length > 0 ? (
            <p className="text-xs text-ink-mute">
              {items.length} 条 · {source}
            </p>
          ) : null}
        </div>

        {!hasSearched ? (
          <EmptyState
            icon={<BookOpen className="h-4 w-4" />}
            title="等待搜索"
            body="输入访谈主题后点击「搜索知识」，将检索匹配的访谈技巧、钩子模式和收藏触发策略。"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-4 w-4" />}
            title="未找到匹配知识"
            body="尝试更换主题关键词，或调整嘉宾画像后重新搜索。"
          />
        ) : (
          <div className="space-y-6">
            {items.map((item, i) => (
              <KnowledgeItemView key={item.id ?? i} item={item} />
            ))}

            {/* 跨 Tab 导航 */}
            <div className="flex flex-wrap gap-3 border-t border-line pt-6">
              <button
                className="flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-flow-deep hover:text-flow-deep"
                onClick={() => onNavigateToOutline(topic, guestProfile)}
                type="button"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                用此选题生成提纲
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function KnowledgeItemView({ item }: { item: KnowledgeItem }) {
  return (
    <article className="border-t-2 border-line pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.type ? (
              <span className="text-xs font-medium text-flow-deep">
                {TYPE_LABELS[item.type] ?? item.type}
              </span>
            ) : null}
            {item.category ? (
              <span className="text-xs text-ink-mute">{item.category}</span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-ink">{item.title}</h3>
        </div>
        {item.source ? (
          <span className="shrink-0 text-xs text-ink-mute">{item.source}</span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-ink-soft">{item.strategy}</p>

      {item.appliesWhen.length > 0 ? (
        <div className="mt-3 border-l-2 border-line pl-3">
          <p className="text-xs font-medium text-ink">适用场景</p>
          <ul className="mt-2 space-y-1">
            {item.appliesWhen.map((cond, i) => (
              <li key={i} className="text-xs leading-5 text-ink-soft">
                {cond}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.tags && item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.map((tag, i) => (
            <span
              key={i}
              className="border border-line px-1.5 py-0.5 text-xs text-ink-mute"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
