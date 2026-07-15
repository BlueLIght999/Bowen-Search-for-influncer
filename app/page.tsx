"use client";

import { Activity, BookOpen, FileVideo, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { categories } from "../src/domain/categories";
import { defaultInput } from "../src/domain/sampleInputs";
import type { Category } from "../src/domain/types";
import { InterviewDiagnosisTab } from "./components/tabs/InterviewDiagnosisTab";
import {
  InterviewKnowledgeTab,
  type KnowledgePrefill,
} from "./components/tabs/InterviewKnowledgeTab";
import {
  InterviewOutlineTab,
  type OutlinePrefill,
} from "./components/tabs/InterviewOutlineTab";
import { VideoAnalysisTab } from "./components/tabs/VideoAnalysisTab";

type TabId = "video" | "diagnosis" | "knowledge" | "outline";

interface TabConfig {
  id: TabId;
  label: string;
  icon: ReactNode;
}

const TABS: TabConfig[] = [
  { id: "video", label: "视频分析", icon: <FileVideo className="h-3.5 w-3.5" /> },
  { id: "diagnosis", label: "访谈诊断", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "knowledge", label: "技巧知识库", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: "outline", label: "提纲生成", icon: <ListChecks className="h-3.5 w-3.5" /> },
];

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("video");
  const [category, setCategory] = useState<Category>(defaultInput.category);
  const [creatorPositioning] = useState(defaultInput.creatorPositioning);
  const [knowledgePrefill, setKnowledgePrefill] = useState<KnowledgePrefill | null>(null);
  const [outlinePrefill, setOutlinePrefill] = useState<OutlinePrefill | null>(null);

  function handleNavigateToKnowledge(topic: string, guestProfile: string) {
    setKnowledgePrefill({ topic, guestProfile });
    setActiveTab("knowledge");
  }

  function handleNavigateToOutline(topic: string, guestProfile: string) {
    setOutlinePrefill({ topic, guestProfile });
    setActiveTab("outline");
  }

  return (
    <main className="min-h-screen bg-paper">
      {/* ── Header ── */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 lg:px-6">
          <div>
            <h1 className="text-lg font-bold text-ink">博闻--内容自媒体分析助手</h1>
            <p className="mt-1 text-xs text-ink-mute">视频分析 · 访谈诊断 · 技巧知识库 · 提纲生成</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-mute">
            <span>品类</span>
            <select
              className="border-b border-line bg-transparent py-1 text-xs text-ink outline-none focus:border-flow-deep"
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* ── TabBar ── */}
      <nav className="border-b border-line">
        <div className="mx-auto flex max-w-6xl gap-0 px-4 lg:px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium transition ${
                activeTab === tab.id
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-mute hover:text-ink-soft"
              }`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── TabContent ── */}
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        {/* 使用 display:none 保留各 Tab 内部状态 */}
        <div style={{ display: activeTab === "video" ? "block" : "none" }}>
          <VideoAnalysisTab category={category} creatorPositioning={creatorPositioning} />
        </div>

        <div style={{ display: activeTab === "diagnosis" ? "block" : "none" }}>
          <InterviewDiagnosisTab
            category={category}
            creatorPositioning={creatorPositioning}
            onNavigateToKnowledge={handleNavigateToKnowledge}
            onNavigateToOutline={handleNavigateToOutline}
          />
        </div>

        <div style={{ display: activeTab === "knowledge" ? "block" : "none" }}>
          <InterviewKnowledgeTab
            prefill={knowledgePrefill}
            onNavigateToOutline={handleNavigateToOutline}
          />
        </div>

        <div style={{ display: activeTab === "outline" ? "block" : "none" }}>
          <InterviewOutlineTab
            category={category}
            creatorPositioning={creatorPositioning}
            prefill={outlinePrefill}
          />
        </div>
      </div>
    </main>
  );
}
