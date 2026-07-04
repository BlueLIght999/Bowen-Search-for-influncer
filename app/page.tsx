"use client";

import { ClipboardList, Film, Layers3, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { defaultInput } from "../src/domain/sampleInputs";
import type { Category, MvpInput } from "../src/domain/types";
import { generatePlan } from "../src/engine/generatePlan";

const categories: Category[] = ["时评热点", "知识科普", "职场成长", "商业分析", "AI科技", "教育观察"];

export default function Page() {
  const [input, setInput] = useState<MvpInput>(defaultInput);
  const [submitted, setSubmitted] = useState<MvpInput>(defaultInput);
  const plan = useMemo(() => generatePlan(submitted), [submitted]);

  function update<K extends keyof MvpInput>(key: K, value: MvpInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-4 lg:grid-cols-[390px_1fr] lg:px-6">
        <aside className="border border-line bg-panel p-4 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center bg-ink text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">博闻 MVP</h1>
                <p className="text-xs text-neutral-500">Local validation cockpit</p>
              </div>
            </div>
            <span className="border border-line px-2 py-1 text-xs text-neutral-600">v0.1</span>
          </div>

          <label className="mb-3 block text-sm font-semibold">
            品类
            <select
              className="mt-1 w-full border border-line bg-white px-3 py-2 outline-none focus:border-sky"
              value={input.category}
              onChange={(event) => update("category", event.target.value as Category)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>

          <TextField label="热点" value={input.hotspot} onChange={(value) => update("hotspot", value)} />
          <TextField label="创作者定位" value={input.creatorPositioning} onChange={(value) => update("creatorPositioning", value)} />
          <TextArea label="样本标题/字幕/文案/链接描述" value={input.sampleText} onChange={(value) => update("sampleText", value)} rows={8} />
          <TextArea label="评论区信号" value={input.commentSignals} onChange={(value) => update("commentSignals", value)} rows={4} />

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 font-semibold text-white outline-none transition hover:bg-moss focus:ring-2 focus:ring-coral"
            onClick={() => setSubmitted(input)}
          >
            <Wand2 className="h-4 w-4" />
            生成可拍方案
          </button>
        </aside>

        <section className="space-y-5">
          <div className="border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-moss">Bowen run</p>
                <h2 className="text-2xl font-bold leading-tight">{submitted.hotspot}</h2>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="border border-line px-2 py-1">{submitted.category}</span>
                <span className="border border-line px-2 py-1">本地规则引擎</span>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">{plan.summary}</p>
          </div>

          <Panel icon={<ClipboardList className="h-4 w-4" />} title="样本拆解">
            <div className="grid gap-3 md:grid-cols-2">
              <Info title="开头模式" body={plan.analysis.hookPattern} tone="moss" />
              <Info title="情绪触发" body={plan.analysis.emotionalTrigger} tone="coral" />
              <Info title="拍摄场景" body={plan.analysis.sceneStyle} tone="sky" />
              <Info title="镜头节奏" body={plan.analysis.shotRhythm} tone="gold" />
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

          <Panel icon={<Film className="h-4 w-4" />} title="差异化方向">
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

          <Panel icon={<RefreshCw className="h-4 w-4" />} title="发布复盘">
            <p className="text-sm leading-6">{plan.reviewPrompt}</p>
          </Panel>
        </section>
      </section>
    </main>
  );
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
