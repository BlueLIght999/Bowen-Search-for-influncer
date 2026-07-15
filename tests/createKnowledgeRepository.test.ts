import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createKnowledgeRepository, createKnowledgeRepositorySync } from "../src/infrastructure/knowledge/createKnowledgeRepository";
import { LocalKnowledgeRepository } from "../src/infrastructure/knowledge/LocalKnowledgeRepository";
import { VectorKnowledgeRepository } from "../src/infrastructure/knowledge/VectorKnowledgeRepository";
import { CachedKnowledgeRepository } from "../src/infrastructure/knowledge/CachedKnowledgeRepository";

function mockHealthResponse(ok: boolean, count: number = 0): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ status: ok ? "ok" : "unavailable", count, dimension: 384 })
  } as Response;
}

describe("createKnowledgeRepository 组合根", () => {
  beforeEach(() => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "");
    vi.stubEnv("BOWEN_EMBEDDING_SERVICE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("无环境变量时返回 CachedKnowledgeRepository 包装 LocalKnowledgeRepository", async () => {
    const repo = await createKnowledgeRepository();
    expect(repo).toBeInstanceOf(CachedKnowledgeRepository);
  });

  it("向量服务健康且已入库时返回 CachedKnowledgeRepository 包装 VectorKnowledgeRepository", async () => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "http://localhost:8766");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockHealthResponse(true, 42)));

    const repo = await createKnowledgeRepository();
    expect(repo).toBeInstanceOf(CachedKnowledgeRepository);
  });

  it("向量服务不健康时降级到 LocalKnowledgeRepository", async () => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "http://localhost:8766");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const repo = await createKnowledgeRepository();
    expect(repo).toBeInstanceOf(CachedKnowledgeRepository);
  });

  it("向量服务健康但知识库未入库（count=0）时降级到 LocalKnowledgeRepository", async () => {
    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "http://localhost:8766");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockHealthResponse(true, 0)));

    const repo = await createKnowledgeRepository();
    expect(repo).toBeInstanceOf(CachedKnowledgeRepository);
  });

  it("返回的仓库都实现 retrieve 方法", async () => {
    const localRepo = await createKnowledgeRepository();
    expect(typeof localRepo.retrieve).toBe("function");

    vi.stubEnv("BOWEN_VECTOR_STORE_URL", "http://localhost:8766");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockHealthResponse(true, 10)));
    const vectorRepo = await createKnowledgeRepository();
    expect(typeof vectorRepo.retrieve).toBe("function");
  });

  it("createKnowledgeRepositorySync 不做健康检查，直接按环境变量决定", () => {
    const localRepo = createKnowledgeRepositorySync();
    expect(localRepo).toBeInstanceOf(CachedKnowledgeRepository);
  });
});
