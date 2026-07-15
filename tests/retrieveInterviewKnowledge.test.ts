import { describe, expect, it, vi } from "vitest";
import { retrieveInterviewKnowledge } from "../src/application/useCases/retrieveInterviewKnowledge";
import type { KnowledgeRepositoryPort } from "../src/application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge, KnowledgeItem } from "../src/domain/types";

function makeFakeRepo(items: RetrievedKnowledge[]): KnowledgeRepositoryPort {
  return {
    retrieve: vi.fn().mockResolvedValue(items),
  };
}

function makeKnowledgeItem(
  overrides: Partial<KnowledgeItem> = {}
): KnowledgeItem {
  return {
    id: "test-1",
    category: "通用",
    title: "开放性提问",
    strategy: "用'你怎么看待'引导深度回答",
    appliesWhen: ["提问技巧", "行业分析"],
    type: "interview_technique",
    source: "interview-collector",
    ...overrides,
  };
}

describe("retrieveInterviewKnowledge", () => {
  it("retrieves knowledge items from the repository", async () => {
    const item = makeKnowledgeItem();
    const fakeRepo = makeFakeRepo([
      { item, score: 5, matchReasons: ["keyword: 提问技巧"] },
    ]);

    const results = await retrieveInterviewKnowledge(
      {
        topic: "行业分析访谈",
        guestProfile: "互联网行业从业者",
        creatorPositioning: "职场博主",
        sampleText: "怎么看待这个行业",
      },
      fakeRepo
    );

    expect(results.length).toBe(1);
    expect(results[0].item.title).toBe("开放性提问");
    expect(results[0].score).toBe(5);
  });

  it("passes correct query fields to repository", async () => {
    const item = makeKnowledgeItem();
    const fakeRepo = makeFakeRepo([
      { item, score: 3, matchReasons: [] },
    ]);

    await retrieveInterviewKnowledge(
      {
        topic: "创业心路",
        guestProfile: "连续创业者",
        creatorPositioning: "商业博主",
        sampleText: "从大厂出来创业",
      },
      fakeRepo
    );

    expect(fakeRepo.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        hotspot: "创业心路",
        creatorPositioning: "商业博主",
        sampleText: expect.stringContaining("创业"),
      })
    );
  });

  it("returns empty array when repository returns no results", async () => {
    const fakeRepo = makeFakeRepo([]);

    const results = await retrieveInterviewKnowledge(
      {
        topic: "不相关的话题",
        guestProfile: "",
        creatorPositioning: "",
        sampleText: "",
      },
      fakeRepo
    );

    expect(results).toEqual([]);
  });

  it("handles repository errors gracefully", async () => {
    const errorRepo: KnowledgeRepositoryPort = {
      retrieve: vi.fn().mockRejectedValue(new Error("connection failed")),
    };

    const results = await retrieveInterviewKnowledge(
      {
        topic: "测试",
        guestProfile: "",
        creatorPositioning: "",
        sampleText: "",
      },
      errorRepo
    );

    expect(results).toEqual([]);
  });

  it("combines topic and guestProfile into sampleText for better matching", async () => {
    const item = makeKnowledgeItem();
    const fakeRepo = makeFakeRepo([
      { item, score: 2, matchReasons: [] },
    ]);

    await retrieveInterviewKnowledge(
      {
        topic: "行业分析",
        guestProfile: "张三是互联网从业者",
        creatorPositioning: "",
        sampleText: "",
      },
      fakeRepo
    );

    const callArg = (fakeRepo.retrieve as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.sampleText).toContain("行业分析");
    expect(callArg.sampleText).toContain("张三是互联网从业者");
  });
});
