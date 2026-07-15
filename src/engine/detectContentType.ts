/**
 * 视频内容类型检测 — 纯函数，适配自 AI-Youtube-Shorts-Generator 的 detect_content_type()
 *
 * 适配要点:
 * - 原项目用 LLM 分类，这里提供基于关键词的规则检测作为降级路径
 * - LLM 调用由 Application 层注入，引擎层只提供 prompt 构建和结果解析
 */

/** 内容类型枚举 */
export type ContentType =
  | "podcast"
  | "interview"
  | "tutorial"
  | "lecture"
  | "commentary"
  | "debate"
  | "vlog"
  | "other";

/** 信息密度 */
export type ContentDensity = "low" | "medium" | "high";

/** 内容检测结果 */
export interface ContentTypeResult {
  contentType: ContentType;
  density: ContentDensity;
}

/** 内容类型对应的传播力权重配置 */
export const VIRALITY_WEIGHTS: Record<ContentType, Record<string, number>> = {
  podcast: { conflict: 1.5, quotable: 1.3, hook: 1.0, emotional: 1.0, opinion: 1.0, revelation: 1.0, story: 1.0, practical: 0.8 },
  interview: { hook: 1.5, story: 1.3, conflict: 1.2, emotional: 1.0, opinion: 1.0, revelation: 1.0, quotable: 1.0, practical: 0.8 },
  tutorial: { practical: 1.8, revelation: 1.3, hook: 1.0, quotable: 0.8, emotional: 0.8, opinion: 0.8, conflict: 0.6, story: 0.8 },
  lecture: { revelation: 1.5, practical: 1.3, hook: 1.0, quotable: 1.0, emotional: 0.8, opinion: 1.0, conflict: 0.8, story: 1.0 },
  commentary: { opinion: 1.8, conflict: 1.5, hook: 1.2, quotable: 1.2, emotional: 1.0, revelation: 1.0, story: 0.8, practical: 0.8 },
  debate: { conflict: 2.0, opinion: 1.5, hook: 1.0, quotable: 1.0, emotional: 1.0, revelation: 0.8, story: 0.8, practical: 0.6 },
  vlog: { emotional: 1.8, story: 1.5, hook: 1.0, quotable: 1.0, opinion: 0.8, revelation: 0.8, conflict: 0.8, practical: 0.6 },
  other: { hook: 1.0, emotional: 1.0, opinion: 1.0, revelation: 1.0, conflict: 1.0, quotable: 1.0, story: 1.0, practical: 1.0 },
};

/** 密度对脚本优秀度的基线调整 */
export const DENSITY_BASELINE_ADJUST: Record<ContentDensity, number> = {
  low: -10,
  medium: 0,
  high: 10,
};

/** 关键词规则表 — 用于规则降级路径 */
const TYPE_KEYWORDS: Record<ContentType, string[]> = {
  podcast: ["播客", "对谈", "连线", "嘉宾", "主持人", "本期节目"],
  interview: ["采访", "访谈", "请问", "您觉得", "当时是什么", "能聊聊"],
  tutorial: ["教程", "第一步", "第二步", "操作", "演示", "手把手", "实操"],
  lecture: ["今天讲", "知识点", "理论", "原理", "框架", "体系", "首先", "其次"],
  commentary: ["评价", "评测", "观点", "我认为", "说实话", "不吐不快"],
  debate: ["正方", "反方", "反对", "反驳", "不同意", "我不同意你的观点"],
  vlog: ["今天", "我", "日常", "生活", "记录", "逛", "吃", "玩"],
  other: [],
};

/**
 * 构建内容类型检测的 LLM Prompt
 * @param transcriptSample 转录文本样本（前 25 条 segments 拼接）
 * @returns 完整的 LLM prompt 字符串
 */
export function buildContentTypePrompt(transcriptSample: string): string {
  return `分析以下视频转录文本样本，判断内容类型。
选择一个: podcast(播客), interview(访谈), tutorial(教程), lecture(讲座), commentary(评论), debate(辩论), vlog(生活记录), other(其他)。
同时评估信息密度: low(低-大量填充闲聊), medium(中), high(高-信息密集)。
只返回 JSON: {"content_type": "...", "density": "..."}

转录文本样本:
${transcriptSample}`;
}

/**
 * 基于关键词的规则检测 — LLM 不可用时的降级路径
 * @param text 转录文本
 * @returns 内容类型和密度
 */
export function detectContentTypeByRules(text: string): ContentTypeResult {
  const lowerText = text.toLowerCase();

  // 计算每种类型的关键词命中数
  const scores: Record<string, number> = {};
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === "other") continue;
    scores[type] = keywords.filter((kw) => lowerText.includes(kw.toLowerCase())).length;
  }

  // 取命中最多的类型
  let bestType: ContentType = "other";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as ContentType;
    }
  }

  // 密度检测：基于平均句长和重复率
  const sentences = text.split(/[。！？\n]/).filter((s) => s.trim().length > 5);
  const avgLength = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
    : 0;

  // 检测重复内容（简单方式：相同短语出现 3+ 次）
  const phrases = sentences.map((s) => s.trim().slice(0, 20));
  const phraseCounts = new Map<string, number>();
  for (const p of phrases) {
    phraseCounts.set(p, (phraseCounts.get(p) ?? 0) + 1);
  }
  const repeatRate = Array.from(phraseCounts.values()).filter((c) => c >= 3).length / Math.max(phrases.length, 1);

  let density: ContentDensity = "medium";
  if (avgLength < 15 || repeatRate > 0.15) {
    density = "low";
  } else if (avgLength > 40 && repeatRate < 0.05) {
    density = "high";
  }

  return { contentType: bestType, density };
}

/**
 * 解析 LLM 返回的内容类型 JSON
 * @param raw LLM 返回的原始文本
 * @returns 解析后的内容类型结果
 */
export function parseContentTypeResponse(raw: string): ContentTypeResult {
  try {
    // 容错解析：剥离 markdown fence
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    const parsed = JSON.parse(text);
    const ct = parsed.content_type ?? parsed.contentType ?? "other";
    const density = parsed.density ?? "medium";

    // 校验类型合法性
    const validTypes: ContentType[] = ["podcast", "interview", "tutorial", "lecture", "commentary", "debate", "vlog", "other"];
    const validDensities: ContentDensity[] = ["low", "medium", "high"];

    return {
      contentType: validTypes.includes(ct) ? ct : "other",
      density: validDensities.includes(density) ? density : "medium",
    };
  } catch {
    // JSON 解析失败，返回默认值
    return { contentType: "other", density: "medium" };
  }
}

/**
 * 获取指定内容类型的传播力权重
 * @param contentType 内容类型
 * @returns 8 维传播力权重映射
 */
export function getViralityWeights(contentType: ContentType): Record<string, number> {
  return VIRALITY_WEIGHTS[contentType] ?? VIRALITY_WEIGHTS.other;
}
