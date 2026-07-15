import { describe, expect, it } from "vitest";
import { buildRagQueries } from "../src/engine/buildRagQueries";
import type { ReasoningClaim } from "../src/domain/multimodalIntelligence/VideoEvidence";

function makeClaim(statement: string, type: "observation" | "inference" | "recommendation" = "inference"): ReasoningClaim {
  return {
    id: `claim-${Math.random()}`,
    type,
    statement,
    confidence: 0.8,
    evidenceRefs: [],
    knowledgeIds: []
  };
}

describe("P3-#20: buildRagQueries — 从多模态理解结果生成 RAG 查询", () => {
  it("从 ReasoningClaim.statement 提取关键词生成检索查询", () => {
    const claims: ReasoningClaim[] = [
      makeClaim("前三秒缺乏冲突，开场过于平淡，没有反常识钩子"),
      makeClaim("全程单机位口播，没有证据特写和反应镜头")
    ];

    const queries = buildRagQueries(claims);

    expect(queries).toHaveLength(2);
    expect(queries[0].length).toBeGreaterThan(0);
    expect(queries[1].length).toBeGreaterThan(0);
  });

  it("每个查询是原 statement 的精简版（去冗余词）", () => {
    const claims: ReasoningClaim[] = [
      makeClaim("字幕被角色面部遮挡，字幕停留时间不足，可读性差")
    ];

    const queries = buildRagQueries(claims);

    expect(queries).toHaveLength(1);
    // 查询应包含关键信息
    expect(queries[0]).toContain("字幕");
  });

  it("空 claims 返回空数组", () => {
    expect(buildRagQueries([])).toEqual([]);
  });

  it("多条 claims 生成多条查询，保持顺序", () => {
    const claims: ReasoningClaim[] = [
      makeClaim("钩子强度不足"),
      makeClaim("脚本结构散乱"),
      makeClaim("分镜缺乏证据特写")
    ];

    const queries = buildRagQueries(claims);

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("钩子");
    expect(queries[1]).toContain("脚本");
    expect(queries[2]).toContain("分镜");
  });

  it("recommendation 类型的 claim 也生成查询", () => {
    const claims: ReasoningClaim[] = [
      makeClaim("建议在开场加入反常识数据增强钩子", "recommendation")
    ];

    const queries = buildRagQueries(claims);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("钩子");
  });

  it("对过长 statement 截取前 100 字", () => {
    const longStatement = "这是一个非常非常非常长的陈述".repeat(20);
    const claims: ReasoningClaim[] = [makeClaim(longStatement)];

    const queries = buildRagQueries(claims);

    expect(queries[0].length).toBeLessThanOrEqual(100);
  });
});
