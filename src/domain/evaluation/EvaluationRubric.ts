export interface EvaluationRubricDimension {
  key:
    | "scriptQuality"
    | "hookStrength"
    | "sceneDesign"
    | "aestheticExperience"
    | "emotionalRhythm"
    | "differentiation"
    | "viralPotential"
    | "aiDramaFit";
  label: string;
  focus: string;
}

export interface EvaluationRubricSummary {
  version: string;
  checksum: string;
  dimensions: EvaluationRubricDimension["key"][];
}

export const BOWEN_CONTENT_EVALUATION_RUBRIC = {
  version: "bowen-content-evaluation-v1",
  checksum: "e72db704602f",
  dimensions: [
    {
      key: "scriptQuality",
      label: "脚本优秀度",
      focus: "文案结构、冲突推进、信息密度和可复用表达。"
    },
    {
      key: "hookStrength",
      label: "前三秒钩子",
      focus: "开场冲突、反常识、身份揭示和利益点前置。"
    },
    {
      key: "sceneDesign",
      label: "分镜表现",
      focus: "镜头承接、反应镜头、证据特写和节奏可拍性。"
    },
    {
      key: "aestheticExperience",
      label: "审美体验",
      focus: "字幕可读性、视觉秩序、画风连续性和观看舒适度。"
    },
    {
      key: "emotionalRhythm",
      label: "情绪节奏",
      focus: "冲突、反转、释放和结尾悬念的情绪曲线。"
    },
    {
      key: "differentiation",
      label: "差异化",
      focus: "选题角度和同类内容的重合度及可识别差异。"
    },
    {
      key: "viralPotential",
      label: "爆点潜力",
      focus: "综合钩子、脚本、情绪和差异化后的传播可能性。"
    },
    {
      key: "aiDramaFit",
      label: "AI 漫剧适配",
      focus: "身份反转、角色一致性、风格漂移、字幕归属和续集动力。"
    }
  ] satisfies EvaluationRubricDimension[]
} as const;

export function createEvaluationRubricSummary(): EvaluationRubricSummary {
  return {
    version: BOWEN_CONTENT_EVALUATION_RUBRIC.version,
    checksum: BOWEN_CONTENT_EVALUATION_RUBRIC.checksum,
    dimensions: BOWEN_CONTENT_EVALUATION_RUBRIC.dimensions.map(
      (dimension) => dimension.key
    )
  };
}
