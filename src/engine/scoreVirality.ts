/**
 * 8 维传播力评分引擎 — 适配自 AI-Youtube-Shorts-Generator 的 VIRALITY_CRITERIA
 *
 * 核心功能:
 * 1. 基于规则检测文稿中的 8 维传播力信号
 * 2. 根据内容类型加权计算综合传播力分数
 * 3. 提取传播力高光片段
 */

import type { ContentType } from "./detectContentType";
import { getViralityWeights, DENSITY_BASELINE_ADJUST } from "./detectContentType";
import type { ContentDensity } from "./detectContentType";

/** 传播力维度名称 */
export type ViralityDimension =
  | "hook"
  | "emotional"
  | "opinion"
  | "revelation"
  | "conflict"
  | "quotable"
  | "story"
  | "practical";

/** 传播力信号检测结果 */
export interface ViralitySignal {
  dimension: ViralityDimension;
  matchedText: string;
  score: number;
  startIndex: number;
  endIndex: number;
}

/** 传播力评分结果 */
export interface ViralityScoreResult {
  totalScore: number;
  hitDimensions: number;
  signals: ViralitySignal[];
  densityAdjust: number;
  weightedScore: number;
}

/** 传播力高光片段 */
export interface ViralityHighlight {
  text: string;
  score: number;
  dimension: ViralityDimension;
  reason: string;
}

/** 各维度的中文关键词模式 */
const VIRALITY_PATTERNS: Record<ViralityDimension, RegExp[]> = {
  hook: [
    /(?:99%|百分之九十九).*?(?:不知道|不了解)/g,
    /(?:没人|没有人).{0,8}(?:告诉你|知道|提到)/g,
    /(?:秘密|真相|内幕)是/g,
    /我之前.{0,4}(?:完全)?搞错了/g,
    /别再做/g,
    /(?:真正|其实)(?:有效|重要)的是/g,
    /我试了.{0,4}(?:100|一百)次/g,
    /这个行业最大的(?:谎言|骗局)/g,
  ],
  emotional: [
    /[！！]/g,
    /(?!.*[。])^.{0,50}(?:天啊|我的天|卧槽|不可思议|太疯狂了|难以置信)/g,
    /(?:气死|笑死|哭死|崩溃|破防)/g,
    /(?:真的|确实).{0,6}(?:太|特别|非常)(?:好|棒|差|烂|气人|感动)/g,
  ],
  opinion: [
    /(?:读书|努力|坚持|自律)(?:无用|最不重要|是骗局)/g,
    /我.{0,3}(?:认为|觉得|坚信|敢说).{0,30}(?:不是|错误|错的|荒谬)/g,
    /(?:主流|大众|多数人)(?:观点|看法)是错的/g,
    /(?:反直觉|反常识|颠覆认知)/g,
  ],
  revelation: [
    /(?:数据|统计|调查).{0,10}(?:显示|表明|发现)/g,
    /(?:原来|其实|没想到).{0,15}(?:是|都是)/g,
    /\d+(?:%|％|倍|万|亿)/g,
    /(?:内部消息|首次公开|第一次说)/g,
  ],
  conflict: [
    /(?:但你|可是你|然而你)(?:之前|上次).{0,10}(?:说的|讲的)(?:跟|和).{0,5}(?:矛盾|不一样|冲突)/g,
    /我不同意你的观点/g,
    /(?:反驳|反对|质疑)你的/g,
    /(?:你说的不对|你说错了|这不对)/g,
  ],
  quotable: [
    /[""「」『』].{10,50}[""」』』』]/g,
    /(?:你以为.{0,10}其实|不是.{0,8}而是)/g,
    /(?:所谓的.{0,8}不过是|与其说.{0,8}不如说)/g,
  ],
  story: [
    /(?:后来|然后|结果|没想到).{0,15}(?:发生|出现|遇到)/g,
    /(?:故事|经历)的(?:结局|反转|高潮)/g,
    /(?:就在|恰好在).{0,10}(?:时候|那一刻)/g,
  ],
  practical: [
    /(?:第一步|第二步|第三步)/g,
    /(?:工具|软件|APP|网站|资源)(?:推荐|清单|列表)/g,
    /(?:具体|实操)怎么(?:做|操作)/g,
    /(?:记住|注意|关键)三点/g,
  ],
};

/** 各维度基础分值 */
const DIMENSION_BASE_SCORE: Record<ViralityDimension, number> = {
  hook: 15,
  emotional: 12,
  opinion: 12,
  revelation: 10,
  conflict: 10,
  quotable: 8,
  story: 8,
  practical: 8,
};

/**
 * 检测文本中的传播力信号
 * @param text 待分析的文本
 * @returns 检测到的所有传播力信号
 */
export function detectViralitySignals(text: string): ViralitySignal[] {
  const signals: ViralitySignal[] = [];

  for (const [dimension, patterns] of Object.entries(VIRALITY_PATTERNS)) {
    const dim = dimension as ViralityDimension;
    const baseScore = DIMENSION_BASE_SCORE[dim];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        signals.push({
          dimension: dim,
          matchedText: match[0],
          score: baseScore,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });

        // 避免无限循环
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
  }

  return signals;
}

/**
 * 计算加权传播力分数
 * @param signals 检测到的信号
 * @param contentType 内容类型（用于权重）
 * @param density 信息密度（用于基线调整）
 * @returns 传播力评分结果
 */
export function scoreVirality(
  signals: ViralitySignal[],
  contentType: ContentType = "other",
  density: ContentDensity = "medium",
): ViralityScoreResult {
  const weights = getViralityWeights(contentType);
  const densityAdjust = DENSITY_BASELINE_ADJUST[density];

  // 按维度去重，每个维度只取最高分
  const dimBestScore: Record<string, number> = {};
  for (const signal of signals) {
    const key = signal.dimension;
    if (!(key in dimBestScore) || signal.score > dimBestScore[key]) {
      dimBestScore[key] = signal.score;
    }
  }

  // 加权计算
  let weightedSum = 0;
  let rawSum = 0;
  for (const [dim, score] of Object.entries(dimBestScore)) {
    const weight = weights[dim] ?? 1.0;
    weightedSum += score * weight;
    rawSum += score;
  }

  // 命中维度数
  const hitDimensions = Object.keys(dimBestScore).length;

  // 综合分数：加权原始分 + 密度调整
  // 上限 100，下限 0
  const totalScore = Math.min(100, Math.max(0, Math.round(rawSum)));
  const weightedScore = Math.min(100, Math.max(0, Math.round(weightedSum / 8 + densityAdjust)));

  return {
    totalScore,
    hitDimensions,
    signals,
    densityAdjust,
    weightedScore,
  };
}

/**
 * 提取传播力高光片段
 * @param text 完整文稿
 * @param signals 传播力信号
 * @param contextChars 上下文字符数（前后各多少字符）
 * @returns 高光片段列表
 */
export function extractHighlights(
  text: string,
  signals: ViralitySignal[],
  contextChars: number = 50,
): ViralityHighlight[] {
  // 按位置排序
  const sorted = [...signals].sort((a, b) => b.score - a.score || a.startIndex - b.startIndex);

  // 去重：重叠超过 50% 的保留高分项
  const kept: ViralityHighlight[] = [];
  const keptRanges: Array<{ start: number; end: number }> = [];

  for (const signal of sorted) {
    const start = Math.max(0, signal.startIndex - contextChars);
    const end = Math.min(text.length, signal.endIndex + contextChars);

    // 检查重叠
    const signalLen = signal.endIndex - signal.startIndex;
    let overlaps = false;
    for (const range of keptRanges) {
      const overlapStart = Math.max(start, range.start);
      const overlapEnd = Math.min(end, range.end);
      const overlapLen = Math.max(0, overlapEnd - overlapStart);
      if (overlapLen > signalLen * 0.5) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      kept.push({
        text: text.slice(start, end).trim(),
        score: signal.score,
        dimension: signal.dimension,
        reason: DIMENSION_REASONS[signal.dimension],
      });
      keptRanges.push({ start, end });
    }
  }

  return kept;
}

/** 各维度的中文说明 */
const DIMENSION_REASONS: Record<ViralityDimension, string> = {
  hook: "钩子时刻——制造即时好奇心，让观众前3秒停下划屏",
  emotional: "情绪峰值——真实的情感爆发，让观众产生共鸣",
  opinion: "观点炸弹——强烈/反直觉的观点，触发同意或反对",
  revelation: "揭示时刻——令人惊讶的事实或数据，重构认知",
  conflict: "冲突/张力——正面迎击分歧或对抗，制造紧张感",
  quotable: "可引用金句——适合截图转发的独立金句",
  story: "故事高潮——叙事弧线的顶点或反转",
  practical: "实用价值——观众可立即应用的具体方法或工具",
};

/**
 * 构建传播力评估的 LLM Prompt
 * @param transcriptText 转录文本
 * @param contentType 内容类型
 * @param density 信息密度
 * @returns 完整 prompt
 */
export function buildViralityPrompt(
  transcriptText: string,
  contentType: ContentType = "other",
  density: ContentDensity = "medium",
): string {
  const criteria = `传播力信号优先级（按影响力排序）：
1. 钩子时刻 — 制造即时好奇心的陈述
2. 情绪峰值 — 真实的情感爆发
3. 观点炸弹 — 强烈、极化或反直觉的观点
4. 揭示时刻 — 令人惊讶的事实、数据或坦白
5. 冲突/张力 — 分歧、反驳或问题被正面迎击
6. 可引用金句 — 可独立传播的一句话
7. 故事高潮 — 轶事或故事的高潮或反转
8. 实用价值 — 观众可立即应用的技巧或洞察`;

  return `你是一位研究过数万条爆款短视频的专家编辑。你知道什么让观众停止划屏、看完并分享。

${criteria}

内容类型: ${contentType} | 信息密度: ${density}

你的任务：从以下转录文本中识别传播力最强的高光片段。

规则：
- 每个高光片段必须以强钩子开场（前3秒抓住注意力）
- 片段时长最佳 45-90 秒，金句类可短至 20 秒
- 不要在句子中间切断
- 片段之间不应大幅重叠
- 评分 0-100（传播力潜力，不是一般质量）
- 为每个高光片段标注最佳"钩子句"——让观众停止划屏的开场白
- 用一句话解释为什么这个片段有传播力

只返回 JSON（不要 markdown，不要解释）：
{"highlights":[{"title":"标题","start_time":0.0,"end_time":0.0,"score":0,"hook_sentence":"钩子句","virality_reason":"原因"}]}

转录文本：
${transcriptText}`;
}

/**
 * 容错 JSON 解析 — 适配自 _parse_json_loose()
 * @param raw LLM 返回的原始文本
 * @returns 解析后的对象，失败返回 null
 */
export function parseLooseJson<T = unknown>(raw: string): T | null {
  let text = raw.trim();

  // 剥离 markdown fence
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(text) as T;
  } catch {
    // 尝试提取第一个 JSON 对象
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 文稿分块 — 适配自 chunk_transcript()
 * 长文稿按固定字符数分块，带重叠区域防止跨块信息丢失
 *
 * @param text 完整文稿
 * @param chunkSize 每块字符数（默认 3000）
 * @param overlap 块间重叠字符数（默认 300）
 * @returns 分块后的文本数组
 */
export function chunkTranscript(
  text: string,
  chunkSize: number = 3000,
  overlap: number = 300,
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);

    if (end >= text.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}
