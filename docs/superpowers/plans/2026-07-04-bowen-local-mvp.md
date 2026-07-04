# Bowen Local MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fastest local demo for Bowen: category + hotspot + sample input -> copy/scene analysis -> knowledge-base suggestions -> differentiated content plans.

**Architecture:** Use a single local Next.js app with deterministic mock analysis first, so the demo runs without external API keys. Keep the product pipeline modular: intake, analyzer, knowledge base, recommendation engine, and result UI are separate units that can later swap mock logic for real LLM/video processing.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, React client components, local JSON knowledge base, Vitest for pure engine tests, Playwright smoke test if browser QA is needed.

## Global Constraints

- MVP must run locally with one command after dependencies are installed.
- MVP must not automatically scrape or download videos from Douyin, Bilibili, Xiaohongshu, or other platforms.
- MVP accepts user-provided text, links, screenshots, or uploaded video metadata as sample inputs.
- MVP output must include copy logic, filming scene analysis, explosion-point strategy, differentiation advice, and a shootable content template.
- MVP must work without a database; use in-memory state and local static knowledge files.
- MVP must clearly label generated output as a validation prototype, not a production recommendation engine.
- First successful demo path should take less than 2 minutes from opening the page to seeing a result.

---

## Fastest Technical Route

Build a local single-page product demo first, not a full SaaS.

The demo should have four visible zones:

1. **Input Panel:** category, hotspot, creator positioning, sample link/text, optional comments.
2. **Analysis Panel:** copy structure, hook pattern, emotional trigger, scene style, shot rhythm.
3. **Knowledge Suggestions:** retrieved strategies from a local knowledge base.
4. **Output Plan:** 3 differentiated directions, scores, filming advice, script outline, publish review fields.

Use deterministic rules for the first build. This makes the demo reliable in front of users and avoids waiting on API credentials. Once the local flow is convincing, replace the analyzer with LLM calls and real multimodal parsing.

## File Structure

- Create: `package.json` - scripts and dependencies.
- Create: `next.config.mjs` - minimal Next.js config.
- Create: `tsconfig.json` - TypeScript config.
- Create: `postcss.config.mjs` - Tailwind PostCSS config.
- Create: `tailwind.config.ts` - Tailwind content and theme config.
- Create: `app/layout.tsx` - app shell metadata.
- Create: `app/page.tsx` - main local demo UI.
- Create: `app/globals.css` - base styles and responsive layout polish.
- Create: `src/domain/types.ts` - shared domain types.
- Create: `src/domain/sampleInputs.ts` - default sample values for one-click demo.
- Create: `src/engine/analyzeSample.ts` - deterministic sample analysis.
- Create: `src/engine/retrieveKnowledge.ts` - local knowledge-base retrieval.
- Create: `src/engine/generatePlan.ts` - output plan generation and scoring.
- Create: `src/knowledge/bowenStrategies.ts` - MVP strategy knowledge base.
- Create: `tests/engine.test.ts` - pure engine tests for analysis/retrieval/generation.
- Create: `README.md` - local demo instructions and validation script.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `README.md`

**Interfaces:**
- Consumes: none.
- Produces: a runnable Next.js TypeScript app shell.

- [ ] **Step 1: Create package scripts**

```json
{
  "name": "bowen-local-mvp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add framework config**

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```js
// postcss.config.mjs
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202225",
        paper: "#f7f5f0",
        line: "#d8d3c8",
        moss: "#3f6b57",
        coral: "#d95d4f",
        gold: "#c9962f",
        sky: "#457b9d"
      }
    }
  },
  plugins: []
};

export default config;
```

- [ ] **Step 3: Add app shell**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "博闻 MVP",
  description: "本地选题闭环演示"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: #f7f5f0;
  color: #202225;
}

body {
  font-family: Arial, "Microsoft YaHei", sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

- [ ] **Step 4: Add README instructions**

```md
# 博闻 Local MVP

本地验证链路：选择品类 -> 输入热点 -> 提交样本 -> 拆解文案和场景 -> 调取知识库 -> 输出差异化可拍方案。

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation Script

1. Select a category.
2. Enter a hotspot.
3. Paste a sample title, transcript, or video link description.
4. Click generate.
5. Check whether the output is specific enough to start filming.
```

- [ ] **Step 5: Verify scaffold**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm run build`

Expected: build fails only because `app/page.tsx` does not exist yet.

## Task 2: Domain Types and Sample Data

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/sampleInputs.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Produces: `MvpInput`, `SampleAnalysis`, `KnowledgeItem`, `GeneratedPlan`, and `defaultInput`.

- [ ] **Step 1: Define domain types**

```ts
// src/domain/types.ts
export type Category = "时评热点" | "知识科普" | "职场成长" | "商业分析" | "AI科技" | "教育观察";

export interface MvpInput {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
  sampleText: string;
  commentSignals: string;
}

export interface SampleAnalysis {
  hookPattern: string;
  copyLogic: string[];
  emotionalTrigger: string;
  sceneStyle: string;
  shotRhythm: string;
  collectibleMoment: string;
}

export interface KnowledgeItem {
  id: string;
  category: Category | "通用";
  title: string;
  strategy: string;
  appliesWhen: string[];
}

export interface DifferentiatedDirection {
  title: string;
  angle: string;
  uniquenessScore: number;
  competitionScore: number;
  explosionStrategy: string;
  filmingAdvice: string;
  outline: string[];
}

export interface GeneratedPlan {
  summary: string;
  analysis: SampleAnalysis;
  knowledgeUsed: KnowledgeItem[];
  directions: DifferentiatedDirection[];
  reviewPrompt: string;
}
```

- [ ] **Step 2: Add one-click demo input**

```ts
// src/domain/sampleInputs.ts
import type { MvpInput } from "./types";

export const defaultInput: MvpInput = {
  category: "AI科技",
  hotspot: "AI搜索正在替代传统搜索",
  creatorPositioning: "面向职场新人和普通创作者，用通俗语言解释AI产品变化",
  sampleText:
    "标题：别再只用传统搜索了，AI搜索正在改变信息获取。开头用一句反常识观点切入：你以为搜索是在找答案，其实是在外包判断。中段对比传统搜索和AI搜索的使用路径，最后提醒普通人要学会提问和交叉验证。",
  commentSignals:
    "评论：这会不会让人更懒？普通人怎么判断AI答案真假？有没有适合学生党的工具？"
};
```

- [ ] **Step 3: Add initial type smoke test**

```ts
// tests/engine.test.ts
import { describe, expect, it } from "vitest";
import { defaultInput } from "../src/domain/sampleInputs";

describe("default MVP input", () => {
  it("contains enough information for a demo run", () => {
    expect(defaultInput.hotspot.length).toBeGreaterThan(5);
    expect(defaultInput.sampleText).toContain("标题");
    expect(defaultInput.commentSignals).toContain("评论");
  });
});
```

- [ ] **Step 4: Run test**

Run: `npm test`

Expected: PASS with one test.

## Task 3: Deterministic Analysis Engine

**Files:**
- Create: `src/engine/analyzeSample.ts`
- Modify: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `MvpInput`.
- Produces: `analyzeSample(input: MvpInput): SampleAnalysis`.

- [ ] **Step 1: Add failing test**

```ts
import { analyzeSample } from "../src/engine/analyzeSample";

it("extracts a useful sample analysis", () => {
  const analysis = analyzeSample(defaultInput);

  expect(analysis.hookPattern).toContain("反常识");
  expect(analysis.copyLogic).toHaveLength(4);
  expect(analysis.sceneStyle.length).toBeGreaterThan(5);
  expect(analysis.collectibleMoment).toContain("收藏");
});
```

- [ ] **Step 2: Implement analyzer**

```ts
// src/engine/analyzeSample.ts
import type { MvpInput, SampleAnalysis } from "../domain/types";

export function analyzeSample(input: MvpInput): SampleAnalysis {
  const hasQuestion = input.commentSignals.includes("怎么") || input.commentSignals.includes("如何");
  const hasContrast = input.sampleText.includes("对比") || input.sampleText.includes("替代");

  return {
    hookPattern: hasContrast ? "反常识/替代关系开头：先打破用户原有判断" : "问题压迫式开头：先指出用户正在遇到的困惑",
    copyLogic: [
      `用一句和「${input.hotspot}」相关的反常识判断开场`,
      "解释为什么这个变化和目标用户有关",
      "用一个具体场景降低理解门槛",
      "给出可执行判断标准或行动清单"
    ],
    emotionalTrigger: hasQuestion ? "不确定感：用户担心自己跟不上变化，需要明确判断标准" : "机会感：用户希望找到更早、更省力的行动方式",
    sceneStyle: "半身口播 + 屏幕录制/关键词字幕，适合低成本本地拍摄",
    shotRhythm: "前5秒强判断，中段每20秒切一次案例或对比，结尾给清单",
    collectibleMoment: "收藏触发点放在结尾：给出3条判断标准或工具清单"
  };
}
```

- [ ] **Step 3: Run test**

Run: `npm test`

Expected: PASS.

## Task 4: Local Knowledge Retrieval

**Files:**
- Create: `src/knowledge/bowenStrategies.ts`
- Create: `src/engine/retrieveKnowledge.ts`
- Modify: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `MvpInput`.
- Produces: `retrieveKnowledge(input: MvpInput): KnowledgeItem[]`.

- [ ] **Step 1: Add knowledge base**

```ts
// src/knowledge/bowenStrategies.ts
import type { KnowledgeItem } from "../domain/types";

export const bowenStrategies: KnowledgeItem[] = [
  {
    id: "opposite-turn",
    category: "通用",
    title: "对立翻转",
    strategy: "把大众都在讲的正向结论翻到反面，寻找失败、误判、代价和副作用。",
    appliesWhen: ["同质化", "热点", "反常识"]
  },
  {
    id: "audience-drilldown",
    category: "通用",
    title: "人群下钻",
    strategy: "从泛人群切到更窄的人群，让用户觉得内容是在讲自己。",
    appliesWhen: ["职场新人", "学生", "普通人", "小白"]
  },
  {
    id: "ai-verification",
    category: "AI科技",
    title: "AI答案交叉验证",
    strategy: "AI工具类内容不要只给工具名，要给判断标准、验证路径和常见误区。",
    appliesWhen: ["AI", "搜索", "真假", "工具"]
  },
  {
    id: "collectible-checklist",
    category: "通用",
    title: "收藏型清单",
    strategy: "把观点收束成3-5条可复用清单，放在结尾触发收藏。",
    appliesWhen: ["收藏", "清单", "方法"]
  }
];
```

- [ ] **Step 2: Add failing retrieval test**

```ts
import { retrieveKnowledge } from "../src/engine/retrieveKnowledge";

it("retrieves category and universal knowledge", () => {
  const items = retrieveKnowledge(defaultInput);

  expect(items.some((item) => item.id === "ai-verification")).toBe(true);
  expect(items.some((item) => item.category === "通用")).toBe(true);
  expect(items.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 3: Implement retrieval**

```ts
// src/engine/retrieveKnowledge.ts
import type { KnowledgeItem, MvpInput } from "../domain/types";
import { bowenStrategies } from "../knowledge/bowenStrategies";

export function retrieveKnowledge(input: MvpInput): KnowledgeItem[] {
  const haystack = `${input.category} ${input.hotspot} ${input.creatorPositioning} ${input.sampleText} ${input.commentSignals}`;

  const scored = bowenStrategies.map((item) => {
    const categoryScore = item.category === input.category ? 3 : item.category === "通用" ? 1 : 0;
    const keywordScore = item.appliesWhen.filter((keyword) => haystack.includes(keyword)).length;
    return { item, score: categoryScore + keywordScore };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ item }) => item);
}
```

- [ ] **Step 4: Run test**

Run: `npm test`

Expected: PASS.

## Task 5: Plan Generator

**Files:**
- Create: `src/engine/generatePlan.ts`
- Modify: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `MvpInput`, `analyzeSample`, and `retrieveKnowledge`.
- Produces: `generatePlan(input: MvpInput): GeneratedPlan`.

- [ ] **Step 1: Add failing generation test**

```ts
import { generatePlan } from "../src/engine/generatePlan";

it("generates three differentiated shootable directions", () => {
  const plan = generatePlan(defaultInput);

  expect(plan.directions).toHaveLength(3);
  expect(plan.directions[0].outline.length).toBeGreaterThanOrEqual(4);
  expect(plan.directions[0].uniquenessScore).toBeGreaterThan(60);
  expect(plan.reviewPrompt).toContain("收藏率");
});
```

- [ ] **Step 2: Implement generator**

```ts
// src/engine/generatePlan.ts
import type { DifferentiatedDirection, GeneratedPlan, MvpInput } from "../domain/types";
import { analyzeSample } from "./analyzeSample";
import { retrieveKnowledge } from "./retrieveKnowledge";

export function generatePlan(input: MvpInput): GeneratedPlan {
  const analysis = analyzeSample(input);
  const knowledgeUsed = retrieveKnowledge(input);

  const directions: DifferentiatedDirection[] = [
    {
      title: `别急着追${input.hotspot}，先看它让谁吃亏`,
      angle: "对立翻转：从机会叙事转向代价和误判",
      uniquenessScore: 84,
      competitionScore: 42,
      explosionStrategy: "用反常识开头制造停留，用代价清单制造收藏。",
      filmingAdvice: "半身口播，左侧放热点关键词，右侧逐条弹出误区。",
      outline: [
        "开头：一句反常识判断",
        "解释：为什么大众叙事只讲了一半",
        "案例：普通用户最容易踩的坑",
        "收束：3条判断标准"
      ]
    },
    {
      title: `${input.creatorPositioning}最该关心的不是工具，而是判断标准`,
      angle: "人群下钻：把热点翻译成目标用户的具体处境",
      uniquenessScore: 78,
      competitionScore: 50,
      explosionStrategy: "让用户产生被点名感，降低泛热点同质化。",
      filmingAdvice: "桌面场景 + 屏幕录制，展示一个真实使用路径。",
      outline: [
        "开头：点名目标用户",
        "问题：他们为什么会被热点误导",
        "演示：一个低成本判断流程",
        "结尾：给出可复制模板"
      ]
    },
    {
      title: `用${input.hotspot}做一期收藏型清单`,
      angle: "维度升降：从观点争论降到方法清单",
      uniquenessScore: 72,
      competitionScore: 46,
      explosionStrategy: "用清单结构提高保存动机，把评论问题变成下一期选题。",
      filmingAdvice: "正面口播 + 大字卡，每条清单控制在12字以内。",
      outline: [
        "开头：承诺给出一张判断清单",
        "清单1：何时值得用",
        "清单2：何时必须交叉验证",
        "清单3：怎么避免信息误判",
        "评论引导：让用户留言自己的使用场景"
      ]
    }
  ];

  return {
    summary: `基于「${input.category}」品类和「${input.hotspot}」热点，博闻建议先从样本结构中提取爆点，再做差异化重写。`,
    analysis,
    knowledgeUsed,
    directions,
    reviewPrompt: "发布后回填播放量、完播率、收藏率、评论关键词，用于校准差异化评分。"
  };
}
```

- [ ] **Step 3: Run test**

Run: `npm test`

Expected: PASS.

## Task 6: Demo UI

**Files:**
- Create: `app/page.tsx`

**Interfaces:**
- Consumes: `defaultInput`, `MvpInput`, and `generatePlan`.
- Produces: an interactive local demo page.

- [ ] **Step 1: Implement page**

```tsx
// app/page.tsx
"use client";

import { Sparkles, Wand2 } from "lucide-react";
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
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[380px_1fr]">
        <aside className="border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-coral" />
            <div>
              <h1 className="text-xl font-bold">博闻 MVP</h1>
              <p className="text-sm text-neutral-600">本地验证演示</p>
            </div>
          </div>

          <label className="mb-3 block text-sm font-semibold">
            品类
            <select
              className="mt-1 w-full border border-line bg-white px-3 py-2"
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
            className="mt-3 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 font-semibold text-white"
            onClick={() => setSubmitted(input)}
          >
            <Wand2 className="h-4 w-4" />
            生成可拍方案
          </button>
        </aside>

        <section className="space-y-5">
          <Panel title="样本拆解">
            <div className="grid gap-3 md:grid-cols-2">
              <Info title="开头模式" body={plan.analysis.hookPattern} />
              <Info title="情绪触发" body={plan.analysis.emotionalTrigger} />
              <Info title="拍摄场景" body={plan.analysis.sceneStyle} />
              <Info title="镜头节奏" body={plan.analysis.shotRhythm} />
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              {plan.analysis.copyLogic.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </Panel>

          <Panel title="知识库建议">
            <div className="grid gap-3 md:grid-cols-2">
              {plan.knowledgeUsed.map((item) => (
                <Info key={item.id} title={item.title} body={item.strategy} />
              ))}
            </div>
          </Panel>

          <Panel title="差异化方向">
            <p className="mb-4 text-sm text-neutral-700">{plan.summary}</p>
            <div className="grid gap-4">
              {plan.directions.map((direction) => (
                <article key={direction.title} className="border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{direction.title}</h2>
                      <p className="text-sm text-neutral-600">{direction.angle}</p>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="bg-moss px-2 py-1 text-white">独特 {direction.uniquenessScore}</span>
                      <span className="bg-gold px-2 py-1 text-white">竞争 {direction.competitionScore}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm">{direction.explosionStrategy}</p>
                  <p className="mt-2 text-sm text-neutral-700">{direction.filmingAdvice}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {direction.outline.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="发布复盘">
            <p className="text-sm">{plan.reviewPrompt}</p>
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
      <input className="mt-1 w-full border border-line px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <textarea className="mt-1 w-full resize-none border border-line px-3 py-2" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-white/70 p-4">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-line bg-white p-3">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-700">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run local demo**

Run: `npm run dev`

Expected: local server prints `http://localhost:3000`.

## Task 7: Demo Validation and Polish

**Files:**
- Modify: `README.md`
- Optional create: `docs/validation-notes.md`

**Interfaces:**
- Consumes: the running local MVP.
- Produces: a repeatable validation checklist.

- [ ] **Step 1: Add validation checklist**

```md
## MVP Validation Checklist

Use this with each test user:

1. Can the user understand what to input within 30 seconds?
2. Can the user generate a result within 2 minutes?
3. Does the sample analysis correctly explain why the reference works?
4. Does at least one differentiated direction feel non-obvious?
5. Does the filming advice make the user feel they can shoot today?
6. Would the user pay 9.9元 for one complete plan?

Record:

- Category:
- Hotspot:
- Sample source:
- Chosen direction:
- User usefulness score from 1-5:
- User shootability score from 1-5:
- Payment willingness:
- Biggest missing piece:
```

- [ ] **Step 2: Manual browser smoke test**

Run: `npm run dev`

Open: `http://localhost:3000`

Expected:
- Page loads with default AI科技 example.
- Clicking `生成可拍方案` updates output after editing hotspot text.
- No text overlaps at 1366px width.
- At mobile width, input panel and result panels stack vertically.

- [ ] **Step 3: Commit when repository exists**

Current workspace may not be a git repository. If git is initialized later, commit with:

```bash
git add .
git commit -m "feat: add Bowen local MVP demo"
```

## What to Avoid in the First Demo

- Do not build authentication.
- Do not build payments.
- Do not build a database.
- Do not build platform video scraping.
- Do not integrate a real LLM until the deterministic demo proves the product flow.
- Do not support every content category; six categories are enough for validation.

## Upgrade Path After Demo Works

1. Replace deterministic `analyzeSample` with an LLM call for text analysis.
2. Add optional video upload and extract frames/transcripts locally or through an API.
3. Store user runs in SQLite or Supabase.
4. Add real knowledge-base editing.
5. Add replayable validation records and scoring calibration.

## Self-Review

- Spec coverage: The plan covers category selection, hotspot input, sample submission, copy logic analysis, filming scene analysis, knowledge-base suggestions, explosion-point strategy, differentiation advice, content template generation, and manual performance review.
- Scope check: Platform scraping, authentication, payment, and persistent storage are deliberately out of scope for the fastest local demo.
- Placeholder scan: No implementation step depends on undefined future work.
- Type consistency: `MvpInput`, `SampleAnalysis`, `KnowledgeItem`, and `GeneratedPlan` are defined before use and consumed consistently across engine and UI tasks.
