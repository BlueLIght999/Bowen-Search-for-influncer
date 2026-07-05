import type { DifferentiationPort } from "../ports/DifferentiationPort";
import type { DifferentiationScoreMeta, UploadedVideoAnalysis, UploadedVideoInput } from "../../domain/types";
import { analyzeSample } from "../../engine/analyzeSample";
import { generateCandidateDirections } from "../../engine/generatePlan";
import { retrieveKnowledge } from "../../engine/retrieveKnowledge";
import { scoreDifferentiation } from "../../engine/scoreDifferentiation";

interface AnalyzeUploadedVideoOptions {
  input: UploadedVideoInput;
  differentiator: DifferentiationPort;
  /** 同品类参照池（从热榜抓取的标题/描述列表） */
  referenceTexts?: string[];
}

/**
 * 上传视频差异化分析用例
 *
 * 完整链路：
 *   用户上传视频文案 → 样本拆解 → 知识库召回 → 生成候选方向
 *   → P0 算法评分（sentence-transformers + BERTopic）→ 排序输出
 */
export async function analyzeUploadedVideo(
  options: AnalyzeUploadedVideoOptions
): Promise<UploadedVideoAnalysis> {
  const { input, differentiator, referenceTexts = [] } = options;

  // 1. 样本拆解
  const analysis = analyzeSample({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning,
    sampleText: input.transcript || input.title,
    commentSignals: input.commentSignals
  });

  // 2. 知识库召回
  const knowledgeUsed = retrieveKnowledge({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning,
    sampleText: input.transcript || input.title,
    commentSignals: input.commentSignals
  });

  // 3. 生成候选方向（模板化）
  const candidateDirections = generateCandidateDirections({
    category: input.category,
    hotspot: input.hotspot,
    creatorPositioning: input.creatorPositioning
  });

  // 4. P0 算法评分
  const { directions, meta } = await scoreDifferentiation({
    directions: candidateDirections,
    referenceTexts,
    differentiator
  });

  return {
    summary: `基于「${input.category}」品类和上传视频「${input.title || input.hotspot}」，博闻通过${meta.source === "fallback" ? "启发式" : "语义嵌入+主题聚类"}分析出 ${directions.length} 个差异化制作方向。`,
    analysis,
    knowledgeUsed,
    directions,
    differentiationMeta: meta,
    reviewPrompt: "发布后回填播放量、完播率、收藏率、评论关键词，用于校准差异化评分。"
  };
}
