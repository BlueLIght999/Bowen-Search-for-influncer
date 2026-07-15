import type { FrameSampleAsset } from "../ports/FrameCatalogPort";
import type {
  AiDramaSignal,
  SubtitleSignal,
  VideoObservation
} from "../../domain/types";

interface OcrTextSignal {
  frameIndex: number;
  text: string;
  confidence: number;
}

interface UnderstandUploadedVideoInput {
  transcript: string;
  frames: FrameSampleAsset[];
  ocrTexts?: OcrTextSignal[];
}

const AI_DRAMA_KEYWORDS = [
  "heroine",
  "villain",
  "betray",
  "revenge",
  "hidden identity",
  "next episode",
  "cliffhanger",
  "ai drama",
  "漫剧",
  "短剧",
  "复仇",
  "背叛",
  "身份",
  "下一集"
];

export function understandUploadedVideo({
  transcript,
  frames,
  ocrTexts = []
}: UnderstandUploadedVideoInput): VideoObservation {
  const combinedText = [transcript, ...ocrTexts.map((item) => item.text)].join(" ").toLowerCase();
  const isAiDrama = hasAny(combinedText, AI_DRAMA_KEYWORDS);
  const subtitleSignals: SubtitleSignal[] = ocrTexts
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      frameIndex: item.frameIndex,
      text: item.text.trim(),
      confidence: clampConfidence(item.confidence)
    }));

  return {
    contentType: isAiDrama ? "ai_drama" : inferNonDramaContentType(combinedText),
    scenes: buildScenes(frames, transcript),
    visualTags: buildVisualTags({ frames, subtitleSignals, isAiDrama }),
    aiDramaSignals: isAiDrama ? detectAiDramaSignals(combinedText) : [],
    subtitleSignals,
    evidenceConfidence: getEvidenceConfidence(frames.length, subtitleSignals.length)
  };
}

function buildScenes(frames: FrameSampleAsset[], transcript: string): VideoObservation["scenes"] {
  if (frames.length === 0) {
    return [
      {
        start: 0,
        end: 0,
        summary: transcript.slice(0, 120) || "仅基于文稿生成，未采样到画面。",
        signals: ["transcript-only"]
      }
    ];
  }

  const sortedFrames = [...frames].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const fallbackInterval =
    sortedFrames.length > 1
      ? Math.max(1, sortedFrames[1].timestampSeconds - sortedFrames[0].timestampSeconds)
      : 5;

  return sortedFrames.map((frame, index) => ({
    start: frame.timestampSeconds,
    end: sortedFrames[index + 1]?.timestampSeconds ?? frame.timestampSeconds + fallbackInterval,
    summary: `第 ${frame.index} 帧抽样画面。`,
    signals: [frame.path]
  }));
}

function detectAiDramaSignals(text: string): AiDramaSignal[] {
  const signals: AiDramaSignal[] = [
    {
      type: "hook",
      label: "强开场候选",
      evidence: "冲突驱动故事可以把决定性事件前置到前三秒。"
    },
    {
      type: "relationship",
      label: "人物关系",
      evidence: "文稿包含角色身份或人物关系信号。"
    }
  ];

  if (hasAny(text, ["betray", "revenge", "villain", "背叛", "复仇", "反派"])) {
    signals.push({
      type: "conflict",
      label: "冲突可视化",
      evidence: "背叛、复仇或反派语言能形成明确冲突。"
    });
  }

  if (hasAny(text, ["hidden identity", "returns", "reveal", "身份", "归来", "揭露", "反转"])) {
    signals.push({
      type: "reversal",
      label: "身份反转",
      evidence: "内容包含身份、归来、揭露或反转语言。"
    });
  }

  if (hasAny(text, ["next episode", "cliffhanger", "下一集", "续集"])) {
    signals.push({
      type: "cliffhanger",
      label: "下一集钩子",
      evidence: "结尾包含明确的后续展开信号。"
    });
  }

  return signals;
}

function buildVisualTags({
  frames,
  subtitleSignals,
  isAiDrama
}: {
  frames: FrameSampleAsset[];
  subtitleSignals: SubtitleSignal[];
  isAiDrama: boolean;
}): string[] {
  const tags: string[] = [];
  if (frames.length === 0) {
    tags.push("transcript-only");
  } else {
    tags.push("sampled-frames");
  }
  if (subtitleSignals.length > 0) {
    tags.push("subtitle-driven");
  }
  if (isAiDrama) {
    tags.push("ai-drama", "character-conflict");
  }
  return tags;
}

function inferNonDramaContentType(text: string): VideoObservation["contentType"] {
  return hasAny(text, ["presenter", "compare", "explain", "口播", "讲解", "对比"])
    ? "talking_head"
    : "mixed";
}

function getEvidenceConfidence(frameCount: number, subtitleCount: number): VideoObservation["evidenceConfidence"] {
  if (subtitleCount > 0) {
    return "high";
  }
  if (frameCount > 0) {
    return "medium";
  }
  return "low";
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
