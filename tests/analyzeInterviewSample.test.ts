import { describe, expect, it } from "vitest";
import { analyzeInterviewSample } from "../src/engine/analyzeInterviewSample";
import type { InterviewDiagnosisInput } from "../src/domain/interview/types";

function makeInput(transcript: string): InterviewDiagnosisInput {
  return {
    category: "通用" as never,
    topic: "创业心路",
    creatorPositioning: "职场博主",
    guestProfile: "前大厂员工",
    transcript,
    commentSignals: "",
  };
}

const SAMPLE_TRANSCRIPT = `
大家好，今天我们请到了张三，他之前在阿里做了八年，去年出来创业了。
你怎么看待从大厂出来的那一刻？
其实那一刻不是兴奋，是恐惧。所有人都觉得你很勇敢，但你知道自己只是没有退路了。
是什么让你做了这个决定？
是有一天开会的时候，领导说我们要做创新，但我发现所谓的创新只是在PPT上改数字。我就觉得我不能再这样了。
那创业最难的是什么？
创业最难的不是找钱，是找到不骗自己的勇气。你每天都要问自己，我做的事真的有价值吗？
最后有什么想对想出来创业的人说的？
我想说，不要因为 escape 一个地方而创业，要因为 toward 一个东西而创业。
`;

describe("analyzeInterviewSample", () => {
  it("detects question-based opening pattern", () => {
    const input = makeInput("你怎么看待从大厂出来的那一刻？其实那一刻...");
    const result = analyzeInterviewSample(input);

    expect(result.openingPattern).toContain("提问");
  });

  it("detects statement-based opening pattern", () => {
    const input = makeInput("大家好，今天我们请到了张三。他之前在阿里做了八年...");
    const result = analyzeInterviewSample(input);

    expect(result.openingPattern).toContain("陈述");
  });

  it("identifies topic introduction from transcript", () => {
    const input = makeInput("今天我们聊聊创业这个话题。你怎么看待创业？");
    const result = analyzeInterviewSample(input);

    expect(result.topicIntroduction).toBeTruthy();
  });

  it("detects question progression in transcript", () => {
    const input = makeInput(SAMPLE_TRANSCRIPT);
    const result = analyzeInterviewSample(input);

    expect(result.questionProgression).toBeTruthy();
    // 应该识别出多个提问
    expect(result.questionProgression).toContain("提问");
  });

  it("evaluates follow-up depth when questions are chained", () => {
    const input = makeInput(SAMPLE_TRANSCRIPT);
    const result = analyzeInterviewSample(input);

    expect(result.followUpDepth).toBeTruthy();
  });

  it("detects closing pattern with summary or advice", () => {
    const input = makeInput(SAMPLE_TRANSCRIPT);
    const result = analyzeInterviewSample(input);

    expect(result.closingPattern).toBeTruthy();
  });

  it("calculates structure score between 0 and 100", () => {
    const input = makeInput(SAMPLE_TRANSCRIPT);
    const result = analyzeInterviewSample(input);

    expect(result.structureScore).toBeGreaterThanOrEqual(0);
    expect(result.structureScore).toBeLessThanOrEqual(100);
  });

  it("gives higher structure score to well-structured transcript than to flat one", () => {
    const wellStructured = makeInput(SAMPLE_TRANSCRIPT);
    const flat = makeInput("嗯。对。是的。好的。就这样。");

    const goodScore = analyzeInterviewSample(wellStructured).structureScore;
    const badScore = analyzeInterviewSample(flat).structureScore;

    expect(goodScore).toBeGreaterThan(badScore);
  });

  it("handles empty transcript gracefully", () => {
    const input = makeInput("");
    const result = analyzeInterviewSample(input);

    expect(result.structureScore).toBe(0);
    expect(result.openingPattern).toContain("未知");
  });

  it("handles transcript with no questions", () => {
    const input = makeInput("这是一段陈述性内容，没有问句，只是讲述一个故事。");
    const result = analyzeInterviewSample(input);

    expect(result.questionProgression).toContain("未检测到");
  });

  it("counts questions in transcript", () => {
    const input = makeInput("你怎么看待这个？是什么让你做这个决定？那最难的是什么？");
    const result = analyzeInterviewSample(input);

    // 内部辅助信息通过 questionProgression 体现
    expect(result.questionProgression).toContain("3");
  });
});
