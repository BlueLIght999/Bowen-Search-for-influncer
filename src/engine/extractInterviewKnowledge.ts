/**
 * 从 DistilledCaseFile 提取 KnowledgeItem[]
 *
 * 纯函数：输入 interview-collector 输出的蒸馏案例 JSON，
 * 输出标准化的知识条目，供 KnowledgeRepositoryPort 使用。
 *
 * 转换规则：
 * - interview_techniques → KnowledgeItem(type="interview_technique")
 * - hook_patterns        → KnowledgeItem(type="interview_hook", dimension="hookStrength")
 * - content_structure    → KnowledgeItem(type="interview_structure")
 * - collectible_moments  → KnowledgeItem(type="interview_collectible", dimension="viralPotential")
 * - virality_signals     → 增强已有条目的 tags（不独立成条目）
 * - reusable_formulas    → 拼入 structure 条目的 strategy
 */

import type { DistilledCaseFile } from "../domain/interview/types";
import type { KnowledgeItem } from "../domain/types";

/** 传播力维度 → 评估维度 映射 */
const VIRALITY_TO_DIMENSION: Record<string, KnowledgeItem["dimension"]> = {
  hook: "hookStrength",
  emotional: "emotionalRhythm",
  opinion: "differentiation",
  revelation: "scriptQuality",
  conflict: "differentiation",
  quotable: "viralPotential",
  story: "scriptQuality",
  practical: "scriptQuality",
};

let idCounter = 0;

/** 生成唯一 ID */
function nextId(prefix: string): string {
  idCounter += 1;
  return `iv-${prefix}-${idCounter}`;
}

/**
 * 从蒸馏案例文件中提取结构化知识条目
 */
export function extractInterviewKnowledge(file: DistilledCaseFile): KnowledgeItem[] {
  const { distilled } = file;
  const items: KnowledgeItem[] = [];

  // 收集所有 virality_signal 的 dimension 作为增强标签
  const viralityTags = distilled.virality_signals.map((s) => s.dimension);

  // 1. 访谈技巧 → interview_technique
  for (const tech of distilled.interview_techniques) {
    items.push({
      id: nextId("tech"),
      category: "通用",
      title: tech.technique,
      strategy: `${tech.description}\n示例：${tech.example_quote}`,
      appliesWhen: [tech.applicable_scene, tech.technique, "提问技巧"],
      type: "interview_technique",
      tags: [...viralityTags],
      source: "interview-collector",
    });
  }

  // 2. 钩子模式 → interview_hook
  for (const hook of distilled.hook_patterns) {
    items.push({
      id: nextId("hook"),
      category: "通用",
      title: hook.pattern,
      strategy: `开场白：${hook.opening_line}\n心理触发：${hook.psychological_trigger}\n留存机制：${hook.retention_mechanism}`,
      appliesWhen: ["访谈开场", hook.pattern],
      type: "interview_hook",
      dimension: "hookStrength",
      tags: [...viralityTags],
      source: "interview-collector",
    });
  }

  // 3. 内容结构 → interview_structure
  if (distilled.content_structure) {
    const cs = distilled.content_structure;
    const firstSection = cs.overall_structure.split("→")[0]?.trim() ?? "结构";
    const formulas = distilled.reusable_formulas.length > 0
      ? "\n\n可复用公式：\n" + distilled.reusable_formulas.map((f) => `- ${f}`).join("\n")
      : "";
    // 从 sections 提取 technique 作为检索标签
    const sectionTechniques = cs.sections
      .map((s) => s.technique)
      .filter((t) => t.length > 0);
    items.push({
      id: nextId("struct"),
      category: "通用",
      title: firstSection,
      strategy: `${cs.overall_structure}\n节奏：${cs.rhythm_pattern}${formulas}`,
      appliesWhen: ["访谈结构", "内容组织"],
      type: "interview_structure",
      tags: ["结构模板", ...sectionTechniques, ...viralityTags],
      source: "interview-collector",
    });
  }

  // 4. 收藏触发点 → interview_collectible
  for (const moment of distilled.collectible_moments) {
    items.push({
      id: nextId("coll"),
      category: "通用",
      title: moment.moment.slice(0, 50),
      strategy: `金句：${moment.moment}\n收藏原因：${moment.reason}\n时间：${moment.timestamp_range}`,
      appliesWhen: ["收藏触发", "金句设计"],
      type: "interview_collectible",
      dimension: "viralPotential",
      tags: [...viralityTags],
      source: "interview-collector",
    });
  }

  return items;
}

/** 重置 ID 计数器（测试用） */
export function _resetIdCounter(): void {
  idCounter = 0;
}
