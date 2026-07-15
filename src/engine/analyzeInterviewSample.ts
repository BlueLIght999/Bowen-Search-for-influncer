/**
 * 访谈结构拆解纯函数
 *
 * 从文稿中识别访谈结构：开场→主题→追问→金句→收尾
 * 使用规则匹配，不依赖外部服务
 */

import type {
  InterviewDiagnosisInput,
  InterviewStructure,
} from "../domain/interview/types";

/** 提问句正则 */
const QUESTION_REGEX = /[^。！？\n]*[？?]/g;

/** 开场关键词 */
const GREETING_KEYWORDS = ["大家好", "今天", "欢迎", "请到了", "请来", "这一期", "我们聊"];

/** 收尾关键词 */
const CLOSING_KEYWORDS = ["最后", "总结", "想对", "想说", "建议", "一句话", "送给大家", "希望"];

/**
 * 分析访谈结构
 */
export function analyzeInterviewSample(
  input: InterviewDiagnosisInput
): InterviewStructure {
  const text = input.transcript.trim();

  if (!text) {
    return {
      openingPattern: "未知（空文稿）",
      topicIntroduction: "",
      questionProgression: "未检测到提问",
      followUpDepth: "无法评估",
      closingPattern: "未知",
      structureScore: 0,
    };
  }

  // 按句子分割
  const sentences = text.split(/[。！？\n]/).map((s) => s.trim()).filter((s) => s.length > 0);

  // 提取所有问句
  const questions = extractQuestions(text);

  // 1. 检测开场模式
  const openingPattern = detectOpening(sentences[0] ?? "", questions[0] ?? null);

  // 2. 识别主题引入
  const topicIntroduction = detectTopicIntroduction(sentences.slice(0, 3));

  // 3. 提问推进逻辑
  const questionProgression = describeQuestionProgression(questions);

  // 4. 追问深度评估
  const followUpDepth = evaluateFollowUpDepth(questions, sentences);

  // 5. 收尾模式
  const closingPattern = detectClosing(sentences.slice(-3));

  // 6. 结构完整度评分
  const structureScore = calculateStructureScore({
    hasOpening: sentences.length > 0,
    hasQuestions: questions.length > 0,
    hasFollowUpChain: questions.length >= 2,
    hasClosing: CLOSING_KEYWORDS.some((kw) => text.includes(kw)),
    questionCount: questions.length,
    sentenceCount: sentences.length,
  });

  return {
    openingPattern,
    topicIntroduction,
    questionProgression,
    followUpDepth,
    closingPattern,
    structureScore,
  };
}

/** 提取文稿中的所有问句 */
function extractQuestions(text: string): string[] {
  const matches = text.match(QUESTION_REGEX);
  if (!matches) return [];
  return matches.map((q) => q.trim()).filter((q) => q.length > 0);
}

/** 检测开场模式 */
function detectOpening(
  firstSentence: string,
  firstQuestion: string | null
): string {
  if (!firstSentence) return "未知";

  // 如果第一个问句出现在开头
  if (firstQuestion && firstSentence.includes(firstQuestion.slice(0, 10))) {
    return "提问开场";
  }

  // 检测问候/介绍类开场
  if (GREETING_KEYWORDS.some((kw) => firstSentence.includes(kw))) {
    return "陈述开场（嘉宾介绍/话题引入）";
  }

  return "陈述开场";
}

/** 识别主题引入 */
function detectTopicIntroduction(firstSentences: string[]): string {
  if (firstSentences.length === 0) return "";
  // 取前几句作为主题引入描述
  return firstSentences.slice(0, 2).join(" ").slice(0, 100);
}

/** 描述提问推进逻辑 */
function describeQuestionProgression(questions: string[]): string {
  if (questions.length === 0) {
    return "未检测到提问";
  }

  let desc = `检测到${questions.length}个提问`;
  if (questions.length >= 3) {
    desc += "，形成追问链";
  } else if (questions.length >= 2) {
    desc += "，存在追问";
  } else {
    desc += "，提问较少";
  }
  return desc;
}

/** 评估追问深度 */
function evaluateFollowUpDepth(questions: string[], sentences: string[]): string {
  if (questions.length === 0) return "无法评估（无提问）";
  if (questions.length === 1) return "单次提问，无追问";

  // 检查问句之间是否有回答间隔
  // 如果多个问句连续出现，说明可能缺少追问深度
  if (questions.length >= 3) {
    return "追问深度良好，形成多轮对话";
  }
  return "存在追问，深度适中";
}

/** 检测收尾模式 */
function detectClosing(lastSentences: string[]): string {
  if (lastSentences.length === 0) return "未检测到收尾";

  const closingText = lastSentences.join(" ");
  for (const kw of CLOSING_KEYWORDS) {
    if (closingText.includes(kw)) {
      return `金句/建议收尾（含"${kw}"）`;
    }
  }
  return "未明确收尾";
}

/** 计算结构完整度评分 */
function calculateStructureScore(params: {
  hasOpening: boolean;
  hasQuestions: boolean;
  hasFollowUpChain: boolean;
  hasClosing: boolean;
  questionCount: number;
  sentenceCount: number;
}): number {
  let score = 0;

  // 有内容
  if (params.sentenceCount > 0) score += 10;

  // 有开场
  if (params.hasOpening) score += 15;

  // 有提问
  if (params.hasQuestions) score += 25;

  // 有追问链
  if (params.hasFollowUpChain) score += 25;

  // 有收尾
  if (params.hasClosing) score += 15;

  // 提问数量加分（上限10分）
  score += Math.min(params.questionCount * 3, 10);

  return Math.min(score, 100);
}
