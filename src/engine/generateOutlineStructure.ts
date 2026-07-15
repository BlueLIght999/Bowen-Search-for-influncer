/**
 * 提纲骨架生成纯函数
 *
 * 基于选题+嘉宾画像+知识库召回，
 * 生成提纲结构骨架（不含 LLM 润色）
 */

import type { InterviewOutlineInput } from "../domain/interview/types";
import type { RetrievedKnowledge } from "../domain/types";

/** 嘉宾行业关键词提取 */
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  互联网: ["互联网", "大厂", "程序员", "产品经理", "运营"],
  教育: ["教育", "老师", "培训", "课程"],
  医疗: ["医疗", "医生", "医院", "健康"],
  金融: ["金融", "投资", "银行", "基金"],
  电商: ["电商", "零售", "供应链"],
  内容: ["自媒体", "博主", "创作者", "主播"],
};

/** 钩子模板 */
const HOOK_TEMPLATES = [
  "所有人都觉得{topic}是{positive}，其实那是{negative}",
  "90%的人不知道{topic}背后的真相",
  "三年前我做了一个所有人都不理解的决定——关于{topic}",
  "今天请到的嘉宾，用{topic}改变了我对这个行业的认知",
];

/** 收尾模板 */
const CLOSING_TEMPLATES = [
  "最后，有什么想对正在经历{topic}的人说的？",
  "如果用一句话总结你关于{topic}的经验，会是什么？",
  "对于想要进入{topic}领域的人，你最想给的一个建议是什么？",
];

/** 默认问题模板（无知识库时） */
const DEFAULT_QUESTIONS = [
  "你怎么看待{topic}？",
  "是什么让你选择了{topic}这条路？",
  "在{topic}的过程中，最难的是什么？",
  "有没有一个关键转折点改变了你对{topic}的看法？",
  "对于想要进入{topic}领域的人，你有什么建议？",
];

export interface OutlineSkeleton {
  questionSkeletons: string[];
  followUpDirections: string[][];
  hookTemplates: string[];
  closingTemplate: string;
}

/**
 * 生成提纲骨架
 */
export function generateOutlineStructure(
  input: InterviewOutlineInput,
  knowledge: RetrievedKnowledge[]
): OutlineSkeleton {
  const { topic, guestProfile } = input;

  // 提取嘉宾行业
  const industry = detectIndustry(guestProfile);

  // 生成问题骨架
  const { questionSkeletons, followUpDirections } = generateQuestions(
    topic,
    guestProfile,
    industry,
    knowledge
  );

  // 生成钩子模板
  const hookTemplates = generateHooks(topic);

  // 生成收尾模板
  const closingTemplate = generateClosing(topic);

  return {
    questionSkeletons,
    followUpDirections,
    hookTemplates,
    closingTemplate,
  };
}

/** 检测嘉宾所属行业 */
function detectIndustry(guestProfile: string): string {
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => guestProfile.includes(kw))) {
      return industry;
    }
  }
  return "通用";
}

/** 生成问题骨架 */
function generateQuestions(
  topic: string,
  guestProfile: string,
  industry: string,
  knowledge: RetrievedKnowledge[]
): { questionSkeletons: string[]; followUpDirections: string[][] } {
  const skeletons: string[] = [];
  const followUps: string[][] = [];

  // 1. 从知识库提取提问策略
  const techniques = knowledge
    .filter((k) => k.item.type === "interview_technique")
    .map((k) => k.item);

  const hasOpenAsk = techniques.some((t) =>
    t.strategy.includes("怎么看待") || t.title.includes("开放")
  );

  // 2. 生成基础问题（替换模板变量）
  const topicText = topic || "这个领域";
  for (const template of DEFAULT_QUESTIONS) {
    skeletons.push(template.replace(/\{topic\}/g, topicText));
    followUps.push([
      "能具体说说当时的场景吗？",
      "是什么让你做了这个决定？",
    ]);
  }

  // 3. 如果知识库包含"开放性提问"策略，追加开放性问题
  if (hasOpenAsk) {
    skeletons.push(`你怎么看待${industry}行业的未来？`);
    followUps.push([
      "为什么这样认为？",
      "有没有什么变化让你改变了看法？",
    ]);
  }

  // 4. 基于嘉宾背景生成专属问题
  if (industry !== "通用") {
    skeletons.push(`从${industry}行业的角度来看，${topicText}有什么不同？`);
    followUps.push([
      `${industry}行业的人会怎么看这个问题？`,
      "有没有什么行业特有的挑战？",
    ]);
  }

  // 5. 追问策略知识库增强
  const followUpKnowledge = techniques.filter((t) =>
    t.title.includes("追问") || t.strategy.includes("追问")
  );
  if (followUpKnowledge.length > 0) {
    // 为前两个问题追加知识库建议的追问方向
    for (let i = 0; i < Math.min(2, followUps.length); i++) {
      followUps[i].push("基于受访者回答的关键词进行追问");
    }
  }

  return { questionSkeletons: skeletons, followUpDirections: followUps };
}

/** 生成钩子模板 */
function generateHooks(topic: string): string[] {
  const topicText = topic || "这个话题";
  const positive = topic.includes("创业") ? "勇敢" : "容易";
  const negative = topic.includes("创业") ? "恐惧" : "困难";

  return HOOK_TEMPLATES.map((t) =>
    t
      .replace(/\{topic\}/g, topicText)
      .replace(/\{positive\}/g, positive)
      .replace(/\{negative\}/g, negative)
  ).slice(0, 3);
}

/** 生成收尾模板 */
function generateClosing(topic: string): string {
  const topicText = topic || "这个领域";
  return CLOSING_TEMPLATES[0].replace(/\{topic\}/g, topicText);
}
