import { describe, expect, it, vi, afterEach } from "vitest";
import { checkVectorStoreHealth } from "../src/infrastructure/knowledge/checkVectorStoreHealth";

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("P3-#25: checkVectorStoreHealth — 向量数据库健康检查", () => {
  afterEach(() => vi.restoreAllMocks());

  it("服务正常返回 healthy=true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ status: "ok", collection: "bowen-knowledge", count: 42, dimension: 384 })
    ));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.healthy).toBe(true);
    expect(health.count).toBe(42);
    expect(health.dimension).toBe(384);
  });

  it("服务返回 status=unavailable 时 healthy=false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ status: "unavailable", collection: "bowen-knowledge", count: 0, dimension: 0 })
    ));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.healthy).toBe(false);
  });

  it("HTTP 错误时 healthy=false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ error: "fail" }, false, 500)
    ));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.healthy).toBe(false);
  });

  it("网络错误时 healthy=false 且不抛出", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.healthy).toBe(false);
  });

  it("count > 0 时 ready=true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ status: "ok", collection: "bowen-knowledge", count: 20, dimension: 384 })
    ));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.ready).toBe(true);
  });

  it("count = 0 时 ready=false（知识库未入库）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ status: "ok", collection: "bowen-knowledge", count: 0, dimension: 384 })
    ));

    const health = await checkVectorStoreHealth("http://localhost:8766");

    expect(health.healthy).toBe(true);
    expect(health.ready).toBe(false);
  });
});
