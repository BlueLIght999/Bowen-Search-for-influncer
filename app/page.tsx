"use client";

import { BarChart3, ClipboardList, Film, Layers3, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { categories } from "../src/domain/categories";
import { defaultInput } from "../src/domain/sampleInputs";
import type { Category, MvpInput, TrendFetchResult, VideoTrend } from "../src/domain/types";
import { generatePlan } from "../src/engine/generatePlan";

export default function Page() {
  const [category, setCategory] = useState<Category>(defaultInput.category);
  const [creatorPositioning, setCreatorPositioning] = useState(defaultInput.creatorPositioning);
  const [commentSignals, setCommentSignals] = useState(defaultInput.commentSignals);
  const [trendResult, setTrendResult] = useState<TrendFetchResult | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedVideo = useMemo(() => {
    return trendResult?.videos.find((video) => video.id === selectedVideoId) ?? trendResult?.videos[0] ?? null;
  }, [selectedVideoId, trendResult]);

  const input = useMemo(() => {
    return selectedVideo ? buildInputFromVideo(selectedVideo, category, creatorPositioning, commentSignals) : defaultInput;
  }, [category, commentSignals, creatorPositioning, selectedVideo]);

  const plan = useMemo(() => generatePlan(input), [input]);

  async function fetchHotVideos(nextCategory = category) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/hot-videos?category=${encodeURIComponent(nextCategory)}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
      }

      const result = (await response.json()) as TrendFetchResult;
      setTrendResult(result);
      setSelectedVideoId(result.videos[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchHotVideos(category);
  }, [category]);

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-4 lg:grid-cols-[430px_1fr] lg:px-6">
        <aside className="border border-line bg-panel p-4 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center bg-ink text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">博闻 MVP</h1>
                <p className="text-xs text-neutral-500">热点榜单 → 增长样本 → 拍摄建议</p>
              </div>
            </div>
            <span className="border border-line px-2 py-1 text-xs text-neutral-600">v0.2</span>
          </div>

          <label className="mb-3 block text-sm font-semibold">
            品类
            <select
              className="mt-1 w-full border border-line bg-white px-3 py-2 outline-none focus:border-sky"
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <TextField label="创作者定位" value={creatorPositioning} onChange={setCreatorPositioning} />
          <TextArea label="补充评论信号" value={commentSignals} onChange={setCommentSignals} rows={4} />

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 font-semibold text-white outline-none transition hover:bg-moss focus:ring-2 focus:ring-coral disabled:cursor-not-allowed disabled:bg-neutral-400"
            onClick={() => fetchHotVideos(category)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "抓取中" : "刷新该品类热榜Top10"}
          </button>

          {error ? <p className="mt-3 border border-coral bg-white p-3 text-sm text-coral">{error}</p> : null}

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold">{category}热榜 Top10</h2>
              <span className="text-xs text-neutral-500">{trendResult?.source === "live" ? "实时抓取" : "本地回退"}</span>
            </div>

            <div className="space-y-2">
              {(trendResult?.videos ?? []).map((video, index) => (
                <button
                  key={video.id}
                  className={`w-full border p-3 text-left outline-none transition ${
                    selectedVideo?.id === video.id ? "border-ink bg-white" : "border-line bg-paper hover:border-moss"
                  }`}
                  onClick={() => setSelectedVideoId(video.id)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-moss">#{index + 1}</span>
                    <span className="text-xs text-neutral-500">增长分 {video.growthScore}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-bold leading-5">{video.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{video.author}</p>
                  <p className="mt-2 text-xs leading-5 text-neutral-600">{video.growthReason}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-4xl">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-moss">Selected fast grower</p>
                <h2 className="text-2xl font-bold leading-tight">{selectedVideo?.title ?? "等待榜单抓取"}</h2>
                {selectedVideo ? (
                  <a className="mt-2 inline-block text-sm text-sky underline" href={selectedVideo.url} target="_blank" rel="noreferrer">
                    打开原视频
                  </a>
                ) : null}
              </div>
              {selectedVideo ? (
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <Metric label="播放" value={formatCount(selectedVideo.viewCount)} />
                  <Metric label="点赞" value={formatCount(selectedVideo.likeCount)} />
                  <Metric label="收藏" value={formatCount(selectedVideo.favoriteCount)} />
                  <Metric label="评论" value={formatCount(selectedVideo.commentCount)} />
                </div>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">{plan.summary}</p>
          </div>

          <Panel icon={<BarChart3 className="h-4 w-4" />} title="增长判断">
            <div className="grid gap-3 md:grid-cols-3">
              <Info title="增长依据" body={selectedVideo?.growthReason ?? "等待抓取"} tone="moss" />
              <Info title="榜单窗口" body="近五日发布，播放量达到10万，并且播放/小时显著高于同品类均值。" tone="sky" />
              <Info title="当前限制" body="先用公开榜单和增长代理指标；真实历史增速需要接入平台历史榜或第三方数据源。" tone="gold" />
            </div>
          </Panel>

          <Panel icon={<ClipboardList className="h-4 w-4" />} title="文案逻辑解析">
            <div className="grid gap-3 md:grid-cols-2">
              <Info title="开头模式" body={plan.analysis.hookPattern} tone="moss" />
              <Info title="情绪触发" body={plan.analysis.emotionalTrigger} tone="coral" />
              <Info title="拍摄场景" body={plan.analysis.sceneStyle} tone="sky" />
              <Info title="收藏触发" body={plan.analysis.collectibleMoment} tone="gold" />
            </div>
            <ol className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              {plan.analysis.copyLogic.map((item, index) => (
                <li key={item} className="flex gap-2 border border-line bg-white p-3">
                  <span className="font-bold text-moss">{String(index + 1).padStart(2, "0")}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel icon={<Layers3 className="h-4 w-4" />} title="知识库建议">
            <div className="grid gap-3 md:grid-cols-2">
              {plan.knowledgeUsed.map((item) => (
                <Info key={item.id} title={item.title} body={item.strategy} tone="ink" />
              ))}
            </div>
          </Panel>

          <Panel icon={<Film className="h-4 w-4" />} title="拍摄文案大纲">
            <div className="grid gap-4">
              {plan.directions.map((direction) => (
                <article key={direction.title} className="border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <h3 className="text-lg font-bold leading-snug">{direction.title}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{direction.angle}</p>
                    </div>
                    <div className="flex shrink-0 gap-2 text-xs">
                      <span className="bg-moss px-2 py-1 text-white">独特 {direction.uniquenessScore}</span>
                      <span className="bg-gold px-2 py-1 text-white">竞争 {direction.competitionScore}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
                    <p className="border-l-4 border-coral bg-paper p-3 text-sm leading-6">{direction.explosionStrategy}</p>
                    <p className="border-l-4 border-sky bg-paper p-3 text-sm leading-6">{direction.filmingAdvice}</p>
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    {direction.outline.map((item) => (
                      <li key={item} className="border border-line bg-paper px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </Panel>

          <Panel icon={<Wand2 className="h-4 w-4" />} title="发布后回填">
            <p className="text-sm leading-6">{plan.reviewPrompt}</p>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function buildInputFromVideo(video: VideoTrend, category: Category, creatorPositioning: string, commentSignals: string): MvpInput {
  return {
    category,
    hotspot: video.title,
    creatorPositioning,
    sampleText: `标题：${video.title}\n简介：${video.description}\n作者：${video.author}\n增长信号：${video.growthReason}`,
    commentSignals
  };
}

function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  return `${value}`;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <input
        className="mt-1 w-full border border-line px-3 py-2 outline-none focus:border-sky"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <textarea
        className="mt-1 w-full resize-none border border-line px-3 py-2 outline-none focus:border-sky"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-white px-3 py-2">
      <p className="text-neutral-500">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center bg-ink text-white">{icon}</span>
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Info({ title, body, tone }: { title: string; body: string; tone: "moss" | "coral" | "sky" | "gold" | "ink" }) {
  const color = {
    moss: "border-moss",
    coral: "border-coral",
    sky: "border-sky",
    gold: "border-gold",
    ink: "border-ink"
  }[tone];

  return (
    <div className={`border-l-4 ${color} border-y border-r border-line bg-white p-3`}>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-neutral-700">{body}</p>
    </div>
  );
}
