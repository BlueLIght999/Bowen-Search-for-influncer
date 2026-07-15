import { describe, expect, it, vi, afterEach } from "vitest";
import { RemoteVectorStoreClient } from "../src/infrastructure/knowledge/RemoteVectorStoreClient";
import type { VectorEntry } from "../src/application/ports/VectorStorePort";

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("RemoteVectorStoreClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upsert 调用 /vector/upsert 并返回写入数量", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({ upserted: 2, collection: "bowen-knowledge" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    const entries: VectorEntry[] = [
      { id: "a", vector: [0.1], text: "文本A", metadata: { title: "A", category: "通用", type: "hook_strategy" } },
      { id: "b", vector: [0.2], text: "文本B", metadata: { title: "B", category: "通用", type: "script_structure" } }
    ];

    await client.upsert(entries);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://test:8766/vector/upsert",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].id).toBe("a");
  });

  it("query 调用 /vector/query 并返回排序结果", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({
        results: [
          { id: "hook-001", score: 0.92, metadata: { title: "反常识", category: "通用", type: "hook_strategy" } },
          { id: "hook-002", score: 0.85, metadata: { title: "冲突开场", category: "通用", type: "hook_strategy" } }
        ]
      })
    ));

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    const results = await client.query([0.1, 0.2], 5);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("hook-001");
    expect(results[0].score).toBe(0.92);
    expect(results[0].metadata.title).toBe("反常识");
  });

  it("query 带 filter 时传递过滤条件", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({ results: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    await client.query([0.1], 5, { dimension: "hookStrength" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filter).toEqual({ dimension: "hookStrength" });
  });

  it("delete 调用 /vector/delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({ deleted: 2 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    await client.delete(["id-1", "id-2"]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.ids).toEqual(["id-1", "id-2"]);
  });

  it("count 调用 /vector/health 获取条目数", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ status: "ok", count: 42, dimension: 384 })
    ));

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    const count = await client.count();

    expect(count).toBe(42);
  });

  it("默认端点从环境变量读取", () => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "http://env:8888");
    const client = new RemoteVectorStoreClient();
    expect(client.endpoint).toBe("http://env:8888");
    vi.unstubAllEnvs();
  });

  it("默认端点回退到 localhost:8766", () => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "");
    const client = new RemoteVectorStoreClient();
    expect(client.endpoint).toBe("http://localhost:8766");
    vi.unstubAllEnvs();
  });

  it("HTTP 错误时抛出可识别错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      mockFetchResponse({ error: "fail" }, false, 500)
    ));

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    await expect(client.query([0.1], 5)).rejects.toThrow(/Vector store responded 500/);
  });

  it("upsert 空列表不发起请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    await client.upsert([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("query 失败时返回空数组而非抛出", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    const results = await client.query([0.1], 5);

    expect(results).toEqual([]);
  });

  it("count 失败时返回 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    const count = await client.count();

    expect(count).toBe(0);
  });

  it("collectionName 默认为 bowen-knowledge", () => {
    const client = new RemoteVectorStoreClient({ endpoint: "http://test:8766" });
    expect(client.collectionName).toBe("bowen-knowledge");
  });
});
