import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/analyze-uploaded-video 路由集成测试
 *
 * 通过动态 import 路由模块，mock RemoteDifferentiationClient 的 fetch，
 * 验证：
 * - 正常请求返回分析结果
 * - 缺少 transcript 和 title 时返回 400
 * - 远程服务失败时自动回退本地
 * - 未知品类回退到默认
 */

const originalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

async function callRoute(body: unknown): Promise<{ status: number; data: unknown }> {
  const routeModule = await import("../app/api/analyze-uploaded-video/route");
  const request = new Request("http://localhost/api/analyze-uploaded-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const response = await routeModule.POST(request);
  const data = await response.json();
  return { status: response.status, data };
}

describe("POST /api/analyze-uploaded-video - 正常请求", () => {
  it("远程服务可用时返回分析结果", async () => {
    // mock RemoteDifferentiationClient 的 fetch 调用
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        scores: [88, 75, 62],
        source: "sentence-transformers"
      })
    });

    const { status, data } = await callRoute({
      category: "AI科技",
      hotspot: "AI搜索",
      title: "AI搜索分析",
      transcript: "AI搜索正在改变信息获取方式。",
      creatorPositioning: "面向职场新人"
    });

    expect(status).toBe(200);
    const result = data as { directions: unknown[]; summary: string };
    expect(result.directions).toHaveLength(3);
    expect(result.summary).toContain("AI科技");
  });
});

describe("POST /api/analyze-uploaded-video - 输入校验", () => {
  it("缺少 transcript 和 title 时返回 400", async () => {
    const { status, data } = await callRoute({
      category: "AI科技"
    });

    expect(status).toBe(400);
    expect((data as { error: string }).error).toContain("Missing transcript or title");
  });

  it("空 body 时返回 400", async () => {
    const { status } = await callRoute(null);
    expect(status).toBe(400);
  });

  it("无效 JSON 时返回 400", async () => {
    const routeModule = await import("../app/api/analyze-uploaded-video/route");
    const request = new Request("http://localhost/api/analyze-uploaded-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json"
    });
    const response = await routeModule.POST(request);
    expect(response.status).toBe(400);
  });
});

describe("POST /api/analyze-uploaded-video - 远程失败回退", () => {
  it("远程服务不可用时自动回退到本地评分", async () => {
    // 第一次 fetch 抛错（远程服务不可用）
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { status, data } = await callRoute({
      category: "AI科技",
      title: "AI搜索分析",
      transcript: "AI搜索正在改变信息获取方式。",
      creatorPositioning: "面向职场新人"
    });

    expect(status).toBe(200);
    const result = data as {
      directions: { uniquenessScore: number; competitionScore: number }[];
      differentiationMeta: { source: string };
    };
    expect(result.directions).toHaveLength(3);
    expect(result.differentiationMeta.source).toBe("fallback");
  });

  it("远程服务返回 500 时回退到本地", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal error" })
    });

    const { status, data } = await callRoute({
      category: "知识科普",
      title: "黑洞解析",
      transcript: "黑洞是一个引力极端的区域。"
    });

    expect(status).toBe(200);
    const result = data as { directions: unknown[] };
    expect(result.directions).toHaveLength(3);
  });
});

describe("POST /api/analyze-uploaded-video - 品类处理", () => {
  it("未知品类回退到默认 AI科技", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("remote unavailable"));

    const { status, data } = await callRoute({
      category: "不存在的品类",
      title: "测试标题",
      transcript: "测试文案"
    });

    expect(status).toBe(200);
    const result = data as { summary: string };
    expect(result.summary).toContain("AI科技");
  });

  it("未提供品类时回退到默认 AI科技", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("remote unavailable"));

    const { status, data } = await callRoute({
      title: "测试标题",
      transcript: "测试文案"
    });

    expect(status).toBe(200);
    const result = data as { summary: string };
    expect(result.summary).toContain("AI科技");
  });
});

describe("POST /api/analyze-uploaded-video - referenceTexts 传递", () => {
  it("传入 referenceTexts 时不崩溃", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("remote unavailable"));

    const { status, data } = await callRoute({
      category: "AI科技",
      title: "AI搜索",
      transcript: "AI搜索分析",
      referenceTexts: ["参照1", "参照2", "参照3"]
    });

    expect(status).toBe(200);
    expect((data as { directions: unknown[] }).directions).toHaveLength(3);
  });

  it("不传 referenceTexts 时默认为空数组", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("remote unavailable"));

    const { status, data } = await callRoute({
      category: "AI科技",
      title: "AI搜索",
      transcript: "AI搜索分析"
    });

    expect(status).toBe(200);
  });
});
