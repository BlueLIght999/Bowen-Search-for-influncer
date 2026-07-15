/**
 * 提问质量评分纯函数
 *
 * 基于 InterviewStructure 和文稿内容，
 * 计算提问质量的四个维度评分。
 */

import type {
  InterviewStructure,
  QuestionQuality,
} from "../domain/interview/types";

/** 开放性提问关键词 */
const OPEN_KEYWORDS = [
  "怎么看待", "如何看待", "为什么", "什么感受", "什么想法",
  "什么场景", "具体什么", "能说说", "能聊聊", "怎样的",
  "什么让你", "怎么决定", "怎么理解", "什么变化",
];

/** 封闭性提问关键词 */
const CLOSED_KEYWORDS = [
  "是不是", "有没有", "会不会", "好不好", "对不对",
  "难不难", "忙不忙", "累不累", "值不值", "能不能",
  "觉得", "认为...吗",
];

/** 深度提问关键词（体现具体性） */
const DEPTH_KEYWORDS = [
  "具体", "细节", "场景", "什么时候", "在哪里",
  "哪个", "什么阶段", "最后", "第一次",
];

/** 提问句正则 */
const QUESTION_REGEX = /[^。！？\n]*[？?]/g;

/**
 * 评估提问质量
 */
export function scoreInterviewQuality(
  transcript: string,
  structure: InterviewStructure
): QuestionQuality {
  const text = transcript.trim();

  if (!text) {
    return {
      questionDepth: 0,
      openness: 0,
      followUpEffectiveness: 0,
      paceControl: 0,
      weakQuestions: [],
      strongQuestions: [],
    };
  }

  const questions = extractQuestions(text);

  if (questions.length === 0) {
    return {
      questionDepth: 0,
      openness: 0,
      followUpEffectiveness: 0,
      paceControl: 0,
      weakQuestions: [],
      strongQuestions: [],
    };
  }

  // 分类强弱问题
  const { strongQuestions, weakQuestions } = classifyQuestions(questions);

  // 计算各维度评分
  const openness = calculateOpenness(questions);
  const questionDepth = calculateDepth(questions, strongQuestions, weakQuestions);
  const followUpEffectiveness = calculateFollowUpEffectiveness(questions, structure);
  const paceControl = calculatePaceControl(text, questions);

  return {
    questionDepth,
    openness,
    followUpEffectiveness,
    paceControl,
    weakQuestions,
    strongQuestions,
  };
}

/** 提取问句 */
function extractQuestions(text: string): string[] {
  const matches = text.match(QUESTION_REGEX);
  if (!matches) return [];
  return matches.map((q) => q.trim()).filter((q) => q.length > 0);
}

/** 分类强弱问题 */
function classifyQuestions(questions: string[]): {
  strongQuestions: string[];
  weakQuestions: string[];
} {
  const strong: string[] = [];
  const weak: string[] = [];

  for (const q of questions) {
    const isOpen = OPEN_KEYWORDS.some((kw) => q.includes(kw));
    const isClosed = CLOSED_KEYWORDS.some((kw) => q.includes(kw));

    if (isOpen) {
      strong.push(q);
    } else if (isClosed) {
      weak.push(q);
    }
    // 既不开放也不封闭的问题不分类
  }

  return { strongQuestions: strong, weakQuestions: weak };
}

/** 计算开放性评分 */
function calculateOpenness(questions: string[]): number {
  if (questions.length === 0) return 0;

  let openCount = 0;
  let closedCount = 0;

  for (const q of questions) {
    if (OPEN_KEYWORDS.some((kw) => q.includes(kw))) openCount++;
    if (CLOSED_KEYWORDS.some((kw) => q.includes(kw))) closedCount++;
  }

  // 开放性问题占比越高，评分越高
  const openRatio = openCount / questions.length;
  const closedPenalty = closedCount / questions.length;

  // 基础分 = 开放占比 * 80，减去封闭占比 * 30
  const score = Math.round(openRatio * 80 - closedPenalty * 30 + 20);

  return clamp(score, 0, 100);
}

/** 计算提问深度评分 */
function calculateDepth(
  questions: string[],
  strong: string[],
  weak: string[]
): number {
  if (questions.length === 0) return 0;

  let depthScore = 0;

  // 强问题加分
  depthScore += strong.length * 15;

  // 弱问题扣分
  depthScore -= weak.length * 5;

  // 包含深度关键词加分
  let depthKeywordCount = 0;
  for (const q of questions) {
    if (DEPTH_KEYWORDS.some((kw) => q.includes(kw))) depthKeywordCount++;
  }
  depthScore += depthKeywordCount * 10;

  // 问题长度加分（长问题通常更深入）
  const avgLength = questions.reduce((sum, q) => sum + q.length, 0) / questions.length;
  if (avgLength > 15) depthScore += 10;
  if (avgLength > 25) depthScore += 5;

  // 基础分
  depthScore += 20;

  return clamp(depthScore, 0, 100);
}

/** 计算追问有效性评分 */
function calculateFollowUpEffectiveness(
  questions: string[],
  structure: InterviewStructure
): number {
  if (questions.length === 0) return 0;

  // 基础分来自追问链
  let score = 0;

  if (questions.length >= 3) {
    score += 50; // 多轮追问
  } else if (questions.length >= 2) {
    score += 30; // 有追问
  } else {
    score += 10; // 单次提问
  }

  // 结构分数调制（好的结构意味着追问更有效）
  const structureModifier = Math.round(structure.structureScore * 0.3);
  score += structureModifier;

  return clamp(score, 0, 100);
}

/** 计算节奏控制评分 */
function calculatePaceControl(text: string, questions: string[]): number {
  if (questions.length === 0) return 0;

  // 找到每个问句在文中的位置
  const positions: number[] = [];
  let searchStart = 0;
  for (const q of questions) {
    const idx = text.indexOf(q, searchStart);
    if (idx >= 0) {
      positions.push(idx);
      searchStart = idx + q.length;
    }
  }

  if (positions.length <= 1) return 50; // 单个问题，节奏一般

  // 计算问句间距
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i++) {
    gaps.push(positions[i] - positions[i - 1]);
  }

  // 计算间距的变异系数（越低越均匀）
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const cv = avgGap > 0 ? stdDev / avgGap : 1;

  // 变异系数越低，节奏越均匀
  // cv=0 → 100分, cv>=2 → 30分
  const score = Math.round(Math.max(30, 100 - cv * 35));

  return clamp(score, 0, 100);
}

/** 限制范围 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
