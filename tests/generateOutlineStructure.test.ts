import { describe, expect, it } from "vitest";
import { generateOutlineStructure } from "../src/engine/generateOutlineStructure";
import type { InterviewOutlineInput } from "../src/domain/interview/types";
import type { RetrievedKnowledge, KnowledgeItem } from "../src/domain/types";

function makeInput(overrides: Partial<InterviewOutlineInput> = {}): InterviewOutlineInput {
  return {
    topic: "创业心路",
    guestProfile: "前大厂员工，现在创业做教育",
    creatorPositioning: "职场博主",
    category: "通用" as never,
    ...overrides,
  };
}

function makeKnowledge(title: string, strategy: string): RetrievedKnowledge {
  return {
    item: {
      id: `k-${title}`,
      category: "通用",
      title,
      strategy,
      appliesWhen: ["访谈"],
      type: "interview_technique",
      source: "interview-collector",
    } as KnowledgeItem,
    score: 5,
    matchReasons: ["keyword"],
  };
}

describe("generateOutlineStructure", () => {
  it("generates question skeletons based on topic and guest profile", () => {
    const input = makeInput();
    const result = generateOutlineStructure(input, []);

    expect(result.questionSkeletons.length).toBeGreaterThanOrEqual(5);
    // 骨架应该是问句
    expect(result.questionSkeletons.some((q) => q.includes("?") || q.includes("？"))).toBe(true);
  });

  it("generates follow-up directions arrays for each question", () => {
    const input = makeInput();
    const result = generateOutlineStructure(input, []);

    expect(result.followUpDirections.length).toBe(result.questionSkeletons.length);
    // 每个问题至少有 1 个追问方向
    for (const followUps of result.followUpDirections) {
      expect(followUps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("generates hook templates", () => {
    const input = makeInput();
    const result = generateOutlineStructure(input, []);

    expect(result.hookTemplates.length).toBeGreaterThanOrEqual(2);
    for (const hook of result.hookTemplates) {
      expect(hook.length).toBeGreaterThan(0);
    }
  });

  it("generates closing template", () => {
    const input = makeInput();
    const result = generateOutlineStructure(input, []);

    expect(result.closingTemplate.length).toBeGreaterThan(0);
  });

  it("incorporates knowledge items into question skeletons", () => {
    const input = makeInput();
    const knowledge = [
      makeKnowledge("开放性提问", "用'你怎么看待'引导深度回答"),
    ];

    const result = generateOutlineStructure(input, knowledge);

    // 至少有一个骨架应该包含知识库中的策略元素
    const allSkeletons = result.questionSkeletons.join(" ");
    expect(allSkeletons).toContain("怎么看待");
  });

  it("adapts questions based on guest profile", () => {
    const input1 = makeInput({ guestProfile: "互联网行业从业者" });
    const input2 = makeInput({ guestProfile: "医疗行业从业者" });

    const result1 = generateOutlineStructure(input1, []);
    const result2 = generateOutlineStructure(input2, []);

    // 不同嘉宾背景应该生成不同的问题
    expect(result1.questionSkeletons).not.toEqual(result2.questionSkeletons);
  });

  it("handles empty topic gracefully", () => {
    const input = makeInput({ topic: "" });
    const result = generateOutlineStructure(input, []);

    // 仍然应该生成基本骨架
    expect(result.questionSkeletons.length).toBeGreaterThanOrEqual(3);
  });

  it("handles empty guest profile gracefully", () => {
    const input = makeInput({ guestProfile: "" });
    const result = generateOutlineStructure(input, []);

    expect(result.questionSkeletons.length).toBeGreaterThanOrEqual(3);
  });

  it("generates more questions with knowledge context than without", () => {
    const input = makeInput();
    const noKnowledge = generateOutlineStructure(input, []);
    const withKnowledge = generateOutlineStructure(input, [
      makeKnowledge("追问策略", "基于回答关键词追问"),
      makeKnowledge("沉默策略", "停顿2秒引导补充"),
    ]);

    // 有知识库时可能生成更丰富的骨架
    expect(withKnowledge.questionSkeletons.length).toBeGreaterThanOrEqual(
      noKnowledge.questionSkeletons.length
    );
  });
});
