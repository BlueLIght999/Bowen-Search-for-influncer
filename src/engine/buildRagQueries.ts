import type { ReasoningClaim } from "../domain/multimodalIntelligence/VideoEvidence";

/**
 * 从多模态理解结果生成 RAG 检索查询
 *
 * 将 ReasoningClaim.statement 转化为精简的检索查询文本，
 * 而非简单拼接 sampleText。
 *
 * 每条 claim 生成一条查询，保持顺序与 claim 一致。
 * 过长 statement 截取前 100 字以控制 embedding 成本。
 */

/** 评估维度关键词映射（用于从 statement 推断检索方向） */
const DIMENSION_KEYWORDS: Record<string, string[]> = {
  hookStrength: ["钩子", "开场", "前三秒", "冲突", "反常识", "悬念"],
  scriptQuality: ["脚本", "结构", "文案", "叙事", "信息密度", "递进"],
  sceneDesign: ["分镜", "镜头", "证据特写", "反应镜头", "画面切换", "机位"],
  aestheticExperience: ["字幕", "可读性", "画风", "审美", "视觉", "滤镜", "色调"],
  emotionalRhythm: ["情绪", "节奏", "反转", "释放", "曲线", "起伏"],
  differentiation: ["差异化", "同质化", "重合度", "角度", "独特"],
  viralPotential: ["爆点", "传播", "完播率", "互动", "转发", "收藏"],
  aiDramaFit: ["AI漫剧", "角色一致性", "身份反转", "风格漂移", "续集", "短剧"]
};

export function buildRagQueries(claims: ReasoningClaim[]): string[] {
  if (claims.length === 0) return [];

  return claims.map((claim) => {
    const statement = claim.statement.trim();
    if (!statement) return "";

    // 截取前 100 字控制 embedding 成本
    const truncated = statement.length > 100 ? statement.slice(0, 100) : statement;

    // 尝试从 statement 中识别维度关键词，增强查询方向性
    const dimensionKeyword = findDimensionKeyword(truncated);

    return dimensionKeyword
      ? `${dimensionKeyword} ${truncated}`
      : truncated;
  }).filter((q) => q.length > 0);
}

function findDimensionKeyword(text: string): string | undefined {
  for (const [dimension, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return dimension;
      }
    }
  }
  return undefined;
}
