import type { Category, DifferentiatedDirection, GeneratedPlan, MvpInput } from "../domain/types";
import { analyzeSample } from "./analyzeSample";
import { evaluateAiWork } from "./evaluateAiWork";
import { retrieveKnowledge } from "./retrieveKnowledge";

export interface CandidateDirectionsInput {
  category: Category;
  hotspot: string;
  creatorPositioning: string;
}

/**
 * 生成候选差异化方向（模板化）
 *
 * 从四种差异化策略模板中生成 3 个候选方向，
 * 初始 uniquenessScore / competitionScore 为占位值，
 * 真实评分由 scoreDifferentiation 引擎通过 P0 算法计算。
 */
export function generateCandidateDirections(
  input: CandidateDirectionsInput
): DifferentiatedDirection[] {
  return [
    {
      title: `别急着追${input.hotspot}，先看它让谁吃亏`,
      angle: "对立翻转：从机会叙事转向代价和误判",
      uniquenessScore: 80,
      competitionScore: 45,
      explosionStrategy: "用反常识开头制造停留，用代价清单制造收藏。",
      filmingAdvice: "半身口播，左侧放热点关键词，右侧逐条弹出误区。",
      outline: ["开头：一句反常识判断", "解释：为什么大众叙事只讲了一半", "案例：普通用户最容易踩的坑", "收束：3条判断标准"]
    },
    {
      title: `${input.creatorPositioning}最该关心的不是工具，而是判断标准`,
      angle: "人群下钻：把热点翻译成目标用户的具体处境",
      uniquenessScore: 75,
      competitionScore: 50,
      explosionStrategy: "让用户产生被点名感，降低泛热点同质化。",
      filmingAdvice: "桌面场景 + 屏幕录制，展示一个真实使用路径。",
      outline: ["开头：点名目标用户", "问题：他们为什么会被热点误导", "演示：一个低成本判断流程", "结尾：给出可复制模板"]
    },
    {
      title: `用${input.hotspot}做一期收藏型清单`,
      angle: "维度升降：从观点争论降到方法清单",
      uniquenessScore: 70,
      competitionScore: 48,
      explosionStrategy: "用清单结构提高保存动机，把评论问题变成下一期选题。",
      filmingAdvice: "正面口播 + 大字卡，每条清单控制在12字以内。",
      outline: ["开头：承诺给出一张判断清单", "清单1：何时值得用", "清单2：何时必须交叉验证", "清单3：怎么避免信息误判", "评论引导：让用户留言自己的使用场景"]
    }
  ];
}

/**
 * 生成完整计划（同步版本，保留原有行为兼容）
 *
 * 注意：此函数返回的 uniquenessScore / competitionScore 是占位值。
 * 如需真实评分，请使用 scoreDifferentiation 引擎 + DifferentiationPort。
 */
export function generatePlan(input: MvpInput): GeneratedPlan {
  const analysis = analyzeSample(input);
  const knowledgeUsed = retrieveKnowledge(input);
  const evaluation = evaluateAiWork(input, analysis);
  const directions = generateCandidateDirections({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning
  });

  return {
    summary: `基于「${input.category}」品类和「${input.hotspot}」热点，博闻建议先从样本结构中提取爆点，再做差异化重写。`,
    analysis,
    knowledgeUsed,
    directions,
    evaluation,
    reviewPrompt: "发布后回填播放量、完播率、收藏率、评论关键词，用于校准差异化评分。"
  };
}
