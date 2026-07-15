import { describe, expect, it } from "vitest";
import { scoreInterviewQuality } from "../src/engine/scoreInterviewQuality";
import type { InterviewStructure } from "../src/domain/interview/types";

function makeStructure(overrides: Partial<InterviewStructure> = {}): InterviewStructure {
  return {
    openingPattern: "提问开场",
    topicIntroduction: "直接引入话题",
    questionProgression: "检测到3个提问，形成追问链",
    followUpDepth: "追问深度良好",
    closingPattern: "金句收尾",
    structureScore: 75,
    ...overrides,
  };
}

describe("scoreInterviewQuality", () => {
  it("scores open-ended questions higher than closed questions", () => {
    const openTranscript = "你怎么看待这个行业？为什么这样认为？什么感受？";
    const closedTranscript = "你觉得难吗？是不是很累？有没有后悔？";

    const openResult = scoreInterviewQuality(openTranscript, makeStructure());
    const closedResult = scoreInterviewQuality(closedTranscript, makeStructure());

    expect(openResult.openness).toBeGreaterThan(closedResult.openness);
  });

  it("identifies strong questions with open-ended patterns", () => {
    const transcript = "你怎么看待这个决定？是什么让你选择了这条路？";
    const result = scoreInterviewQuality(transcript, makeStructure());

    expect(result.strongQuestions.length).toBeGreaterThan(0);
    expect(result.strongQuestions[0]).toContain("怎么看待");
  });

  it("identifies weak questions as closed-ended", () => {
    const transcript = "你觉得难吗？是不是很累？有没有后悔？工作忙不忙？";
    const result = scoreInterviewQuality(transcript, makeStructure());

    expect(result.weakQuestions.length).toBeGreaterThan(0);
  });

  it("calculates question depth based on specificity and context", () => {
    const deepTranscript = "你在阿里最后一年负责的具体业务是什么？那个决定是在什么场景下做出的？";
    const shallowTranscript = "工作忙吗？累不累？";

    const deepResult = scoreInterviewQuality(deepTranscript, makeStructure());
    const shallowResult = scoreInterviewQuality(shallowTranscript, makeStructure());

    expect(deepResult.questionDepth).toBeGreaterThan(shallowResult.questionDepth);
  });

  it("evaluates follow-up effectiveness from question chaining", () => {
    const chainedTranscript = "你怎么看待创业？是什么让你做了这个决定？那创业最难的是什么？";
    const isolatedTranscript = "你觉得创业怎么样？今天天气不错。工作忙吗？";

    const chainedResult = scoreInterviewQuality(chainedTranscript, makeStructure());
    const isolatedResult = scoreInterviewQuality(isolatedTranscript, makeStructure());

    expect(chainedResult.followUpEffectiveness).toBeGreaterThan(isolatedResult.followUpEffectiveness);
  });

  it("calculates pace control from question distribution", () => {
    // 均匀分布的问题 vs 集中在一起的问题
    const evenPace = "问题1？回答。问题2？回答。问题3？回答。问题4？回答。";
    const clusteredPace = "问题1？问题2？问题3？问题4？回答。回答。回答。回答。";

    const evenResult = scoreInterviewQuality(evenPace, makeStructure());
    const clusteredResult = scoreInterviewQuality(clusteredPace, makeStructure());

    expect(evenResult.paceControl).toBeGreaterThanOrEqual(clusteredResult.paceControl);
  });

  it("returns all scores between 0 and 100", () => {
    const transcript = "你怎么看待这个行业？";
    const result = scoreInterviewQuality(transcript, makeStructure());

    expect(result.questionDepth).toBeGreaterThanOrEqual(0);
    expect(result.questionDepth).toBeLessThanOrEqual(100);
    expect(result.openness).toBeGreaterThanOrEqual(0);
    expect(result.openness).toBeLessThanOrEqual(100);
    expect(result.followUpEffectiveness).toBeGreaterThanOrEqual(0);
    expect(result.followUpEffectiveness).toBeLessThanOrEqual(100);
    expect(result.paceControl).toBeGreaterThanOrEqual(0);
    expect(result.paceControl).toBeLessThanOrEqual(100);
  });

  it("handles transcript with no questions", () => {
    const transcript = "这是一段陈述，没有任何问句。只是讲述。";
    const result = scoreInterviewQuality(transcript, makeStructure());

    expect(result.questionDepth).toBe(0);
    expect(result.openness).toBe(0);
    expect(result.weakQuestions).toEqual([]);
    expect(result.strongQuestions).toEqual([]);
  });

  it("handles empty transcript", () => {
    const result = scoreInterviewQuality("", makeStructure());

    expect(result.questionDepth).toBe(0);
    expect(result.openness).toBe(0);
    expect(result.followUpEffectiveness).toBe(0);
    expect(result.paceControl).toBe(0);
  });

  it("uses structure score to modulate follow-up effectiveness", () => {
    const transcript = "你怎么看待创业？是什么让你做了这个决定？";
    const highStructure = makeStructure({ structureScore: 90 });
    const lowStructure = makeStructure({ structureScore: 20 });

    const highResult = scoreInterviewQuality(transcript, highStructure);
    const lowResult = scoreInterviewQuality(transcript, lowStructure);

    expect(highResult.followUpEffectiveness).toBeGreaterThanOrEqual(lowResult.followUpEffectiveness);
  });
});
