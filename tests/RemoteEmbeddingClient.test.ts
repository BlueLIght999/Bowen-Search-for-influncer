import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RemoteEmbeddingClient } from "../src/infrastructure/embedding/RemoteEmbeddingClient";

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("RemoteEmbeddingClient", () => {
  beforeEach(() => {
    vi.stubEnv("BOWEN_EMBEDDING_SERVICE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("调用 /embed 端点批量嵌入文本", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        vectors: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
        model: "paraphrase-multilingual-MiniLM-L12-v2",
        dimension: 3,
        source: "sentence-transformers"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });
    const vectors = await client.embed(["第一段", "第二段"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test:8766/embed",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("embedQuery 调用 /embed 并返回单个向量", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({
        vectors: [[0.7, 0.8, 0.9]],
        model: "test-model",
        dimension: 3,
        source: "sentence-transformers"
      })
    ));

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });
    const vector = await client.embedQuery("测试查询");

    expect(vector).toEqual([0.7, 0.8, 0.9]);
  });

  it("默认端点从环境变量 BOWEN_EMBEDDING_SERVICE_URL 读取", () => {
    vi.stubEnv("BOWEN_EMBEDDING_SERVICE_URL", "http://env-host:9999");
    const client = new RemoteEmbeddingClient();
    expect(client.endpoint).toBe("http://env-host:9999");
  });

  it("默认端点回退到 http://localhost:8766", () => {
    const client = new RemoteEmbeddingClient();
    expect(client.endpoint).toBe("http://localhost:8766");
  });

  it("model 和 dimension 属性从首次成功响应中填充", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({
        vectors: [[0.1]],
        model: "test-model-v2",
        dimension: 768,
        source: "sentence-transformers"
      })
    ));

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });
    await client.embed(["测试"]);

    expect(client.model).toBe("test-model-v2");
    expect(client.dimension).toBe(768);
  });

  it("HTTP 错误时抛出可识别错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ error: "Internal Error" }, false, 500)
    ));

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });

    await expect(client.embed(["测试"])).rejects.toThrow(/Embedding service responded 500/);
  });

  it("空输入返回空数组，不发起网络请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });
    const vectors = await client.embed([]);

    expect(vectors).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("超时时抛出 AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        if (opts.signal) {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    }));

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766", timeoutMs: 50 });
    await expect(client.embed(["测试"])).rejects.toThrow();
  });

  it("fetch fallback 响应（source=fallback, vectors=[]）时抛出错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({
        vectors: [],
        model: "fallback",
        dimension: 0,
        source: "fallback"
      })
    ));

    const client = new RemoteEmbeddingClient({ endpoint: "http://test:8766" });
    await expect(client.embed(["测试"])).rejects.toThrow(/fallback/);
  });
});
