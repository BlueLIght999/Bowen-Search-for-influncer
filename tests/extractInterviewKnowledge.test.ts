import { describe, expect, it } from "vitest";
import { extractInterviewKnowledge } from "../src/engine/extractInterviewKnowledge";
import type { DistilledCaseFile } from "../src/domain/interview/types";
import type { KnowledgeItem } from "../src/domain/types";

// ---------------------------------------------------------------------------
// 测试数据：模拟 interview-collector 输出的 DistilledCaseFile JSON
// ---------------------------------------------------------------------------
function makeSampleCaseFile(): DistilledCaseFile {
  return {
    video: {
      id: "BV1xx001",
      platform: "bilibili",
      title: "对话张三：从大厂到创业的真实心路",
      author: "车干轩",
      url: "https://bilibili.com/video/BV1xx001",
      duration: 720,
    },
    transcript: {
      source: "cc_subtitle",
      full_text: "今天我们请到了张三...",
      segments: [{ start: 0, end: 5, text: "今天我们请到了张三" }],
      language: "zh",
      duration: 720,
    },
    distilled: {
      interview_techniques: [
        {
          technique: "开放性提问",
          description: "用'你怎么看待'代替'是不是'引导深度回答",
          example_quote: "你怎么看待从大厂出来的那一刻？",
          timestamp_range: "00:30-00:35",
          applicable_scene: "转型类访谈",
        },
        {
          technique: "沉默策略",
          description: "在受访者回答后停顿2秒，引导补充更深层想法",
          example_quote: "（停顿）...",
          timestamp_range: "02:15-02:20",
          applicable_scene: "情感类话题",
        },
      ],
      hook_patterns: [
        {
          pattern: "反常识开场",
          opening_line: "所有人都觉得从大厂出来是勇敢，其实那是恐惧",
          psychological_trigger: "反常识/好奇心",
          retention_mechanism: "信息差——想知道真正的理由",
          score_estimate: 82,
        },
      ],
      virality_signals: [
        {
          dimension: "opinion",
          matched_text: "从大厂出来不是因为勇敢，是因为恐惧",
          score: 88,
          reason: "反直觉观点，触发同意/不同意",
        },
        {
          dimension: "hook",
          matched_text: "所有人都觉得...其实...",
          score: 75,
          reason: "即时制造好奇心",
        },
      ],
      content_structure: {
        overall_structure: "反常识开场 → 个人经历 → 转型决策 → 创业心得 → 金句收尾",
        sections: [
          { name: "开场", duration_ratio: 0.05, purpose: "制造好奇", technique: "反常识" },
          { name: "经历分享", duration_ratio: 0.4, purpose: "建立共情", technique: "故事化" },
          { name: "决策拆解", duration_ratio: 0.35, purpose: "提供增量", technique: "追问" },
          { name: "收尾金句", duration_ratio: 0.2, purpose: "触发收藏", technique: "金句" },
        ],
        rhythm_pattern: "前紧后松，开场高能，中段深入，结尾收束",
      },
      emotional_design: {
        primary_emotion: "共鸣",
        emotion_arc: "好奇 → 共情 → 佩服 → 收藏冲动",
        climax_point: "06:30",
      },
      collectible_moments: [
        {
          moment: "创业最难的不是找钱，是找到不骗自己的勇气",
          reason: "金句，可独立传播",
          timestamp_range: "06:30-06:35",
        },
      ],
      reusable_formulas: [
        "反常识开场 → 个人经历 → 追问决策 → 金句收尾",
        "用'你怎么看待'代替'是不是'",
      ],
    },
    collected_at: "2026-07-13T10:00:00Z",
  };
}

describe("extractInterviewKnowledge", () => {
  it("extracts interview techniques into knowledge items with correct type", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const techniqueItems = items.filter((i) => i.type === "interview_technique");
    expect(techniqueItems.length).toBe(2);

    const openAsk = techniqueItems.find((i) => i.title.includes("开放性提问"));
    expect(openAsk).toBeDefined();
    expect(openAsk?.strategy).toContain("用'你怎么看待'代替'是不是'");
    expect(openAsk?.appliesWhen).toEqual(
      expect.arrayContaining(["转型类访谈", "开放性提问", "提问技巧"])
    );
    expect(openAsk?.source).toBe("interview-collector");
  });

  it("extracts hook patterns into knowledge items with interview_hook type", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const hookItems = items.filter((i) => i.type === "interview_hook");
    expect(hookItems.length).toBe(1);

    const hook = hookItems[0];
    expect(hook.title).toContain("反常识开场");
    expect(hook.strategy).toContain("所有人都觉得从大厂出来是勇敢");
    expect(hook.dimension).toBe("hookStrength");
  });

  it("extracts content structure into knowledge item with interview_structure type", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const structItems = items.filter((i) => i.type === "interview_structure");
    expect(structItems.length).toBe(1);

    const struct = structItems[0];
    expect(struct.title).toContain("反常识开场");
    expect(struct.strategy).toContain("反常识开场 → 个人经历");
    expect(struct.tags).toEqual(
      expect.arrayContaining(["结构模板", "反常识"])
    );
  });

  it("extracts collectible moments into knowledge items with interview_collectible type", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const collectibleItems = items.filter((i) => i.type === "interview_collectible");
    expect(collectibleItems.length).toBe(1);

    const moment = collectibleItems[0];
    expect(moment.title).toContain("创业最难的不是找钱");
    expect(moment.strategy).toContain("金句");
    expect(moment.dimension).toBe("viralPotential");
  });

  it("tags all items with source=interview-collector", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.source).toBe("interview-collector");
    }
  });

  it("preserves virality signal dimensions as tags on related items", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    // virality_signals 应该增强已有条目的 tags，而不是独立条目
    const allTags = items.flatMap((i) => i.tags ?? []);
    expect(allTags).toEqual(
      expect.arrayContaining(["opinion", "hook"])
    );
  });

  it("includes reusable formulas in structure item strategy", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const structItem = items.find((i) => i.type === "interview_structure");
    expect(structItem).toBeDefined();
    // 可复用公式应该出现在某个知识条目中
    const allStrategies = items.map((i) => i.strategy).join(" ");
    expect(allStrategies).toContain("反常识开场 → 个人经历 → 追问决策 → 金句收尾");
  });

  it("handles empty distilled case gracefully", () => {
    const file: DistilledCaseFile = {
      video: {
        id: "empty",
        platform: "bilibili",
        title: "空案例",
        author: "test",
        url: "",
        duration: 0,
      },
      transcript: {
        source: "fallback",
        full_text: "",
        segments: [],
        language: "zh",
        duration: 0,
      },
      distilled: {
        interview_techniques: [],
        hook_patterns: [],
        virality_signals: [],
        content_structure: null,
        emotional_design: {},
        collectible_moments: [],
        reusable_formulas: [],
      },
      collected_at: "2026-07-13T10:00:00Z",
    };

    const items = extractInterviewKnowledge(file);
    expect(items).toEqual([]);
  });

  it("handles null content_structure without error", () => {
    const file = makeSampleCaseFile();
    file.distilled.content_structure = null;

    const items = extractInterviewKnowledge(file);
    const structItems = items.filter((i) => i.type === "interview_structure");
    expect(structItems).toEqual([]);
  });

  it("generates unique ids for each knowledge item", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    const ids = items.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("sets category to 通用 for all extracted items", () => {
    const file = makeSampleCaseFile();
    const items = extractInterviewKnowledge(file);

    for (const item of items) {
      expect(item.category).toBe("通用");
    }
  });
});
