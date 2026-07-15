import { describe, expect, it, beforeEach, vi } from "vitest";
import { InterviewKnowledgeRepository } from "../src/infrastructure/interview/InterviewKnowledgeRepository";
import type { DistilledCaseFile } from "../src/domain/interview/types";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Mock 数据：模拟 interview-collector 输出目录
// ---------------------------------------------------------------------------
function makeCaseFile(id: string, title: string): DistilledCaseFile {
  return {
    video: { id, platform: "bilibili", title, author: "test", url: "", duration: 600 },
    transcript: { source: "cc_subtitle", full_text: "text", segments: [], language: "zh", duration: 600 },
    distilled: {
      interview_techniques: [
        {
          technique: "开放性提问",
          description: "用'你怎么看待'引导深度回答",
          example_quote: "你怎么看待这个行业？",
          timestamp_range: "00:30-00:35",
          applicable_scene: "行业分析访谈",
        },
      ],
      hook_patterns: [
        {
          pattern: "数据冲击开场",
          opening_line: "90%的人不知道这个数据",
          psychological_trigger: "好奇心",
          retention_mechanism: "信息差",
          score_estimate: 80,
        },
      ],
      virality_signals: [
        { dimension: "opinion", matched_text: "这个行业其实...", score: 85, reason: "反直觉" },
      ],
      content_structure: {
        overall_structure: "数据开场 → 行业拆解 → 案例佐证 → 金句收尾",
        sections: [{ name: "开场", duration_ratio: 0.1, purpose: "吸引", technique: "数据" }],
        rhythm_pattern: "快-慢-快",
      },
      emotional_design: {},
      collectible_moments: [
        { moment: "行业核心壁垒不是技术，是信任", reason: "金句", timestamp_range: "05:00-05:05" },
      ],
      reusable_formulas: ["数据开场 → 深入拆解 → 金句收尾"],
    },
    collected_at: "2026-07-13T10:00:00Z",
  };
}

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe("InterviewKnowledgeRepository", () => {
  let repo: InterviewKnowledgeRepository;
  const mockFs = fs as unknown as {
    readFileSync: ReturnType<typeof vi.fn>;
    readdirSync: ReturnType<typeof vi.fn>;
    existsSync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([] as never);
    mockFs.readFileSync.mockImplementation((path: string) => {
      if (path.endsWith(".json")) {
        const filename = path.split(/[\\/]/).pop() || "";
        if (filename.includes("case1")) return JSON.stringify(makeCaseFile("BV001", "对话A"));
        if (filename.includes("case2")) return JSON.stringify(makeCaseFile("BV002", "对话B"));
        return JSON.stringify(makeCaseFile("BV000", "default"));
      }
      return "";
    });
    repo = new InterviewKnowledgeRepository("/mock/output");
  });

  it("loads distilled case files from output directory on initialization", () => {
    mockFs.readdirSync.mockReturnValue(["case1.json", "case2.json"] as never);
    repo.reload();

    expect(mockFs.readdirSync).toHaveBeenCalledWith("/mock/output");
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it("retrieves interview technique knowledge items", async () => {
    mockFs.readdirSync.mockReturnValue(["case1.json"] as never);
    repo.reload();

    const results = await repo.retrieve({
      category: "通用" as never,
      hotspot: "行业分析",
      creatorPositioning: "",
      sampleText: "怎么看待这个行业",
      commentSignals: "",
    });

    const techniqueItems = results.filter(
      (r) => r.item.type === "interview_technique"
    );
    expect(techniqueItems.length).toBeGreaterThan(0);
    expect(techniqueItems[0].item.title).toContain("开放性提问");
  });

  it("returns empty array when output directory does not exist", async () => {
    mockFs.existsSync.mockReturnValue(false);
    const emptyRepo = new InterviewKnowledgeRepository("/nonexistent");
    emptyRepo.reload();

    const results = await emptyRepo.retrieve({
      category: "通用" as never,
      hotspot: "",
      creatorPositioning: "",
      sampleText: "",
      commentSignals: "",
    });

    expect(results).toEqual([]);
  });

  it("handles corrupted JSON file without crashing", () => {
    mockFs.readdirSync.mockReturnValue(["bad.json"] as never);
    mockFs.readFileSync.mockImplementation(() => "not valid json {{{");
    repo.reload();
    // 不抛出异常即通过
    expect(true).toBe(true);
  });

  it("filters results by interview knowledge types only", async () => {
    mockFs.readdirSync.mockReturnValue(["case1.json"] as never);
    repo.reload();

    const results = await repo.retrieve({
      category: "通用" as never,
      hotspot: "",
      creatorPositioning: "",
      sampleText: "",
      commentSignals: "",
    });

    const interviewTypes = [
      "interview_technique",
      "interview_hook",
      "interview_structure",
      "interview_collectible",
    ];
    for (const r of results) {
      expect(r.item.type).toBeDefined();
      expect(interviewTypes).toContain(r.item.type);
    }
  });

  it("includes score and matchReasons in retrieved items", async () => {
    mockFs.readdirSync.mockReturnValue(["case1.json"] as never);
    repo.reload();

    const results = await repo.retrieve({
      category: "通用" as never,
      hotspot: "行业分析",
      creatorPositioning: "",
      sampleText: "开放性提问",
      commentSignals: "",
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("supports reload to pick up new files", () => {
    mockFs.readdirSync.mockReturnValue(["case1.json"] as never);
    repo.reload();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    mockFs.readdirSync.mockReturnValue(["case1.json", "case2.json"] as never);
    repo.reload();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(3); // 1 + 2
  });

  it("handles empty directory gracefully", async () => {
    mockFs.readdirSync.mockReturnValue([] as never);
    repo.reload();

    const results = await repo.retrieve({
      category: "通用" as never,
      hotspot: "",
      creatorPositioning: "",
      sampleText: "",
      commentSignals: "",
    });

    expect(results).toEqual([]);
  });

  it("extracts knowledge from multiple case files", async () => {
    mockFs.readdirSync.mockReturnValue(["case1.json", "case2.json"] as never);
    repo.reload();

    const results = await repo.retrieve({
      category: "通用" as never,
      hotspot: "",
      creatorPositioning: "",
      sampleText: "提问",
      commentSignals: "",
    });

    // 两个案例文件，每个至少有 1 个技巧 + 1 个钩子 + 1 个结构 + 1 个收藏
    expect(results.length).toBeGreaterThanOrEqual(4);
  });
});
