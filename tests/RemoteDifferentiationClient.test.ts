import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDifferentiationClient } from "../src/infrastructure/differentiation/RemoteDifferentiationClient";

/**
 * RemoteDifferentiationClient 单元测试
 *
 * 通过 mock global fetch 验证：
 * - 正常请求解析
 * - HTTP 错误抛异常
 * - 网络错误抛异常
 * - 超时中止
 * - 端点/超时配置
 */

describe("RemoteDifferentiationClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("parses uniqueness scores from the remote service", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ scores: [88.5, 72.1, 65.3], source: "sentence-transformers" })
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new RemoteDifferentiationClient({ endpoint: "http://test:8766" });
    const result = await client.scoreUniqueness({
      candidateAngles: ["角度A", "角度B", "角度C"],
      referenceTexts: ["参照1", "参照2"]
    });

    expect(result.scores).toEqual([88.5, 72.1, 65.3]);
    expect(result.source).toBe("sentence-transformers");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test:8766/uniqueness",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateAngles: ["角度A", "角度B", "角度C"],
          referenceTexts: ["参照1", "参照2"]
        })
      })
    );
  });

  it("parses competition score from the remote service", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        score: 42.3,
        topicId: 3,
        topicSize: 12,
        corpusSize: 50,
        source: "bertopic"
      })
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new RemoteDifferentiationClient();
    const result = await client.scoreCompetition({
      query: "对立翻转角度",
      corpus: ["标题1", "标题2", "标题3"]
    });

    expect(result.score).toBe(42.3);
    expect(result.topicId).toBe(3);
    expect(result.topicSize).toBe(12);
    expect(result.corpusSize).toBe(50);
    expect(result.source).toBe("bertopic");
  });

  it("throws when the remote service returns a non-ok status", async () => {
    const mockResponse = { ok: false, status: 500 };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new RemoteDifferentiationClient();
    await expect(
      client.scoreUniqueness({ candidateAngles: ["角度"], referenceTexts: [] })
    ).rejects.toThrow("Differentiation service responded 500");
  });

  it("throws when fetch rejects (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new RemoteDifferentiationClient();
    await expect(
      client.scoreCompetition({ query: "角度", corpus: ["a"] })
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("strips trailing slash from endpoint", () => {
    const client = new RemoteDifferentiationClient({ endpoint: "http://test:8766/" });
    // 内部 endpoint 是私有的，通过 fetch 调用间接验证
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ scores: [], source: "fallback" })
    });

    client.scoreUniqueness({ candidateAngles: [], referenceTexts: [] });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://test:8766/uniqueness",
      expect.anything()
    );
  });

  it("uses DIFFERENTIATION_SERVICE_URL env var when no endpoint provided", () => {
    vi.stubEnv("DIFFERENTIATION_SERVICE_URL", "http://env-host:9999");
    const client = new RemoteDifferentiationClient();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ scores: [], source: "fallback" })
    });

    client.scoreUniqueness({ candidateAngles: [], referenceTexts: [] });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://env-host:9999/uniqueness",
      expect.anything()
    );
  });

  it("sends POST with JSON body and abort signal", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ scores: [90], source: "mock" })
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = fetchMock;

    const client = new RemoteDifferentiationClient({ timeoutMs: 5000 });
    await client.scoreUniqueness({ candidateAngles: ["测试角度"], referenceTexts: ["参照"] });

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].headers).toEqual({ "Content-Type": "application/json" });
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
  });
});
