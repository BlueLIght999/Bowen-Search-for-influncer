import type { MvpInput, SampleAnalysis } from "../domain/types";

export function analyzeSample(input: MvpInput): SampleAnalysis {
  const hasQuestion = input.commentSignals.includes("怎么") || input.commentSignals.includes("如何");
  const hasContrast = input.sampleText.includes("对比") || input.sampleText.includes("替代");

  return {
    hookPattern: hasContrast ? "反常识/替代关系开头：先打破用户原有判断" : "问题压迫式开头：先指出用户正在遇到的困惑",
    copyLogic: [
      `用一句和「${input.hotspot}」相关的反常识判断开场`,
      "解释为什么这个变化和目标用户有关",
      "用一个具体场景降低理解门槛",
      "给出可执行判断标准或行动清单"
    ],
    emotionalTrigger: hasQuestion ? "不确定感：用户担心自己跟不上变化，需要明确判断标准" : "机会感：用户希望找到更早、更省力的行动方式",
    sceneStyle: "半身口播 + 屏幕录制/关键词字幕，适合低成本本地拍摄",
    shotRhythm: "前5秒强判断，中段每20秒切一次案例或对比，结尾给清单",
    collectibleMoment: "收藏触发点放在结尾：给出3条判断标准或工具清单"
  };
}
