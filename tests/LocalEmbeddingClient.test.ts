import { describe, expect, it } from "vitest";
import { LocalEmbeddingClient } from "../src/infrastructure/embedding/LocalEmbeddingClient";

describe("LocalEmbeddingClient", () => {
  it("embed 返回与输入数量一致的零向量", async () => {
    const client = new LocalEmbeddingClient();
    const vectors = await client.embed(["第一段", "第二段", "第三段"]);

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(client.dimension);
    expect(vectors[0].every((v) => v === 0)).toBe(true);
  });

  it("embedQuery 返回单个零向量", async () => {
    const client = new LocalEmbeddingClient();
    const vector = await client.embedQuery("测试查询");

    expect(vector).toHaveLength(client.dimension);
    expect(vector.every((v) => v === 0)).toBe(true);
  });

  it("model 属性标识为 fallback", () => {
    const client = new LocalEmbeddingClient();
    expect(client.model).toBe("fallback");
  });

  it("dimension 为固定值 384", () => {
    const client = new LocalEmbeddingClient();
    expect(client.dimension).toBe(384);
  });

  it("空输入返回空数组", async () => {
    const client = new LocalEmbeddingClient();
    const vectors = await client.embed([]);
    expect(vectors).toEqual([]);
  });
});
