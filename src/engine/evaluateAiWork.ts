import type { MvpInput, SampleAnalysis, WorkEvaluationDimension } from "../domain/types";

export function evaluateAiWork(input: MvpInput, analysis: SampleAnalysis): WorkEvaluationDimension[] {
  const text = `${input.hotspot}\n${input.sampleText}\n${input.commentSignals}`;
  const hasContrast = includesAny(text, ["对比", "替代", "反常识", "误区"]);
  const hasList = includesAny(text, ["清单", "标准", "方法", "步骤", "模板"]);
  const hasScene = includesAny(text, ["拍摄", "镜头", "场景", "画面", "屏幕", "口播"]);
  const hasEmotion = includesAny(text, ["焦虑", "机会", "不确定", "担心", "被点名"]);

  return [
    {
      dimension: "脚本优秀度",
      score: clampScore(76 + (hasContrast ? 8 : 0) + (hasList ? 6 : 0)),
      description: "评估开头钩子、信息密度、论证递进和结尾收藏触发是否清晰可复用。",
      keywords: uniqueKeywords(["反常识开头", "三段式递进", "信息密度", "收藏触发", analysis.hookPattern])
    },
    {
      dimension: "分镜",
      score: clampScore(70 + (hasScene ? 10 : 0) + (analysis.shotRhythm.length > 10 ? 5 : 0)),
      description: "评估画面切换、字幕节奏、口播与屏幕录制是否能支撑完播。",
      keywords: uniqueKeywords(["前三秒定帧", "关键字大字卡", "20秒切换", "屏幕录制", analysis.shotRhythm])
    },
    {
      dimension: "审美体验",
      score: clampScore(72 + (hasScene ? 6 : 0)),
      description: "评估视觉秩序、字体层级、色彩克制、画面可信感和观看舒适度。",
      keywords: uniqueKeywords(["干净背景", "高对比字幕", "克制配色", "真实工作流", analysis.sceneStyle])
    },
    {
      dimension: "传播记忆点",
      score: clampScore(74 + (hasEmotion ? 8 : 0) + (hasList ? 4 : 0)),
      description: "评估用户是否能记住一句判断、一个方法或一个可转述观点。",
      keywords: uniqueKeywords(["一句话判断", "可转述观点", "评论提问", "清单命名", analysis.collectibleMoment])
    },
    {
      dimension: "差异化",
      score: clampScore(73 + (hasContrast ? 7 : 0)),
      description: "评估是否避开同质化热点复述，能否给出独立视角和创作者立场。",
      keywords: uniqueKeywords(["对立翻转", "人群下钻", "场景化解释", "误区拆解", "低成本验证"])
    }
  ];
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function uniqueKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 6);
}
