import { describe, it, expect } from "vitest";
import {
  detectViralitySignals,
  scoreVirality,
  extractHighlights,
  buildViralityPrompt,
  parseLooseJson,
  chunkTranscript,
} from "../src/engine/scoreVirality";
import {
  detectContentTypeByRules,
  buildContentTypePrompt,
  parseContentTypeResponse,
  getViralityWeights,
  VIRALITY_WEIGHTS,
  DENSITY_BASELINE_ADJUST,
} from "../src/engine/detectContentType";

describe("detectContentTypeByRules", () => {
  it("检测访谈类型内容", () => {
    const text = "请问您当时是什么感觉？能聊聊那段经历吗？您觉得这个决定对吗？";
    const result = detectContentTypeByRules(text);
    expect(result.contentType).toBe("interview");
  });

  it("检测教程类型内容", () => {
    const text = "第一步打开软件，第二步点击导出，然后按演示操作。这是手把手教程。";
    const result = detectContentTypeByRules(text);
    expect(result.contentType).toBe("tutorial");
  });

  it("无法分类时返回 other", () => {
    const text = "系统初始化完成，等待指令输入。配置已加载。";
    const result = detectContentTypeByRules(text);
    expect(result.contentType).toBe("other");
  });

  it("检测低密度内容（短句+重复）", () => {
    const text = "嗯。啊。对。嗯。啊。对。嗯。啊。对。嗯。啊。对。嗯。啊。对。";
    const result = detectContentTypeByRules(text);
    expect(result.density).toBe("low");
  });

  it("检测高密度内容（长句+无重复）", () => {
    const text = "根据最新统计数据显示，2024年全球AI市场规模达到五千亿美元，同比增长百分之四十二，远超预期。其中大语言模型占比百分之三十五，计算机视觉占比百分之二十八，语音识别占比百分之十五，其余细分领域共同瓜分剩余市场份额。";
    const result = detectContentTypeByRules(text);
    expect(result.density).toBe("high");
  });
});

describe("VIRALITY_WEIGHTS", () => {
  it("访谈类型的钩子权重应最高", () => {
    const weights = VIRALITY_WEIGHTS.interview;
    expect(weights.hook).toBe(1.5);
    expect(weights.hook).toBeGreaterThan(weights.practical);
  });

  it("教程类型的实用价值权重应最高", () => {
    const weights = VIRALITY_WEIGHTS.tutorial;
    expect(weights.practical).toBe(1.8);
    expect(weights.practical).toBeGreaterThan(weights.hook);
  });

  it("辩论类型的冲突权重应最高", () => {
    const weights = VIRALITY_WEIGHTS.debate;
    expect(weights.conflict).toBe(2.0);
  });
});

describe("detectViralitySignals", () => {
  it("检测钩子信号", () => {
    const text = "99%的人都不知道这个秘密，秘密是这个行业最大的谎言。";
    const signals = detectViralitySignals(text);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.dimension === "hook")).toBe(true);
  });

  it("检测观点炸弹信号", () => {
    const text = "我认为读书无用论是错的，但比读书更没用的是盲目努力。这是反常识的。";
    const signals = detectViralitySignals(text);
    expect(signals.some((s) => s.dimension === "opinion")).toBe(true);
  });

  it("检测实用价值信号", () => {
    const text = "第一步注册账号，第二步选择模板，工具推荐清单在这里。";
    const signals = detectViralitySignals(text);
    expect(signals.some((s) => s.dimension === "practical")).toBe(true);
  });

  it("检测揭示时刻信号", () => {
    const text = "统计数据显示，原来90%的用户都是这样的。没想到是这个原因。";
    const signals = detectViralitySignals(text);
    expect(signals.some((s) => s.dimension === "revelation")).toBe(true);
  });

  it("无传播力信号的文本返回空数组", () => {
    const text = "今天去公园散步，天气很好，心情不错。";
    const signals = detectViralitySignals(text);
    expect(signals.length).toBe(0);
  });
});

describe("scoreVirality", () => {
  it("命中多个维度的分数应高于单维度", () => {
    const multiDimText = "99%的人都不知道，统计数据表明原来读书无用论是错的。第一步改变认知。我不同意你的观点。";
    const signals = detectViralitySignals(multiDimText);
    const result = scoreVirality(signals, "other", "medium");

    const singleDimText = "今天天气不错，去公园散步。";
    const singleSignals = detectViralitySignals(singleDimText);
    const singleResult = scoreVirality(singleSignals, "other", "medium");

    expect(result.totalScore).toBeGreaterThan(singleResult.totalScore);
    expect(result.hitDimensions).toBeGreaterThan(singleResult.hitDimensions);
  });

  it("高密度内容的基线调整应为正", () => {
    const signals = detectViralitySignals("测试钩子 99%的人都不知道");
    const result = scoreVirality(signals, "other", "high");
    expect(result.densityAdjust).toBe(10);
  });

  it("低密度内容的基线调整应为负", () => {
    const signals = detectViralitySignals("测试钩子 99%的人都不知道");
    const result = scoreVirality(signals, "other", "low");
    expect(result.densityAdjust).toBe(-10);
  });

  it("加权分数受内容类型影响", () => {
    const signals = detectViralitySignals("99%的人都不知道这个秘密。");
    const interviewResult = scoreVirality(signals, "interview", "medium");
    const tutorialResult = scoreVirality(signals, "tutorial", "medium");
    // 访谈类型的钩子权重 1.5 > 教程的 1.0
    expect(interviewResult.weightedScore).toBeGreaterThanOrEqual(tutorialResult.weightedScore);
  });
});

describe("extractHighlights", () => {
  it("高光片段按分数排序", () => {
    const text = "99%的人都不知道这个秘密。然后今天天气不错。我试了100次才发现这个工具推荐。";
    const signals = detectViralitySignals(text);
    const highlights = extractHighlights(text, signals, 20);
    expect(highlights.length).toBeGreaterThan(0);
    // 高分在前
    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i - 1].score).toBeGreaterThanOrEqual(highlights[i].score);
    }
  });

  it("重叠片段被去重", () => {
    const text = "99%的人都不知道这个秘密是真相。";
    const signals = detectViralitySignals(text);
    const highlights = extractHighlights(text, signals, 100);
    // 大量上下文会导致重叠，应被去重
    expect(highlights.length).toBeLessThanOrEqual(signals.length);
  });
});

describe("parseLooseJson", () => {
  it("解析标准 JSON", () => {
    const raw = '{"key": "value", "num": 42}';
    const result = parseLooseJson(raw);
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("解析带 markdown fence 的 JSON", () => {
    const raw = '```json\n{"key": "value"}\n```';
    const result = parseLooseJson(raw);
    expect(result).toEqual({ key: "value" });
  });

  it("解析嵌入文本中的 JSON", () => {
    const raw = 'Here is the result:\n{"highlights": []}\nDone.';
    const result = parseLooseJson(raw);
    expect(result).toEqual({ highlights: [] });
  });

  it("无效 JSON 返回 null", () => {
    const raw = "not json at all";
    const result = parseLooseJson(raw);
    expect(result).toBeNull();
  });
});

describe("chunkTranscript", () => {
  it("短文本不需要分块", () => {
    const text = "短文本";
    const chunks = chunkTranscript(text, 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("长文本正确分块", () => {
    const text = "a".repeat(500);
    const chunks = chunkTranscript(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // 每块不超过 chunkSize
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("分块有重叠区域", () => {
    const text = "0123456789".repeat(50); // 500 chars
    const chunks = chunkTranscript(text, 100, 20);
    // 第二块的前 20 字符应与第一块的后 20 字符重叠
    if (chunks.length >= 2) {
      const overlap = chunks[0].slice(-20);
      expect(chunks[1].startsWith(overlap)).toBe(true);
    }
  });
});

describe("buildContentTypePrompt", () => {
  it("prompt 包含转录文本样本", () => {
    const prompt = buildContentTypePrompt("这是测试文本");
    expect(prompt).toContain("这是测试文本");
    expect(prompt).toContain("content_type");
    expect(prompt).toContain("density");
  });
});

describe("parseContentTypeResponse", () => {
  it("解析合法响应", () => {
    const raw = '{"content_type": "interview", "density": "high"}';
    const result = parseContentTypeResponse(raw);
    expect(result.contentType).toBe("interview");
    expect(result.density).toBe("high");
  });

  it("解析带 markdown fence 的响应", () => {
    const raw = '```json\n{"content_type": "tutorial", "density": "medium"}\n```';
    const result = parseContentTypeResponse(raw);
    expect(result.contentType).toBe("tutorial");
    expect(result.density).toBe("medium");
  });

  it("无效类型降级为 other", () => {
    const raw = '{"content_type": "unknown", "density": "medium"}';
    const result = parseContentTypeResponse(raw);
    expect(result.contentType).toBe("other");
  });

  it("JSON 解析失败返回默认值", () => {
    const raw = "not json";
    const result = parseContentTypeResponse(raw);
    expect(result.contentType).toBe("other");
    expect(result.density).toBe("medium");
  });
});

describe("buildViralityPrompt", () => {
  it("prompt 包含 8 维传播力框架", () => {
    const prompt = buildViralityPrompt("测试文稿", "interview", "high");
    expect(prompt).toContain("钩子时刻");
    expect(prompt).toContain("情绪峰值");
    expect(prompt).toContain("观点炸弹");
    expect(prompt).toContain("实用价值");
    expect(prompt).toContain("interview");
    expect(prompt).toContain("high");
  });

  it("prompt 包含转录文本", () => {
    const prompt = buildViralityPrompt("这是完整文稿内容", "other", "medium");
    expect(prompt).toContain("这是完整文稿内容");
  });
});
