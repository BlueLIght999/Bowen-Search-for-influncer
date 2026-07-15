import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

function getImportLines(filePath: string): string[] {
  return readFile(filePath)
    .split("\n")
    .filter((line) => line.trim().startsWith("import"));
}

describe("架构依赖规则 — engine 层必须是纯函数层", () => {
  it("engine/ 下不得 import application/ 或 knowledge/", () => {
    const engineDir = join(root, "engine");
    const files = listTsFiles(engineDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const lines = getImportLines(file).filter(
        (line) => line.includes("../application/") || line.includes("../knowledge/")
      );
      for (const line of lines) {
        violations.push(`${file.replace(root, "")}: ${line.trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("engine/retrieveKnowledge 不得直接 import 知识数据源（循环依赖根因）", () => {
    const file = join(root, "engine", "retrieveKnowledge.ts");
    const content = readFile(file);

    const hasKnowledgeImport = content
      .split("\n")
      .filter((line) => line.trim().startsWith("import"))
      .some((line) => line.includes("knowledge/"));

    expect(hasKnowledgeImport).toBe(false);
  });

  it("engine/ 下不得存在已删除的 scoreDifferentiation.ts（应已迁移到 application）", () => {
    const engineDir = join(root, "engine");
    const files = listTsFiles(engineDir);
    const hasScoreDifferentiation = files.some((f) =>
      f.endsWith("scoreDifferentiation.ts")
    );
    expect(hasScoreDifferentiation).toBe(false);
  });

  it("application/useCases/scoreDifferentiation.ts 应存在且使用纯函数排序", () => {
    const file = join(root, "application", "useCases", "scoreDifferentiation.ts");
    const content = readFile(file);

    expect(content).toContain("rankByCompositeScore");
    expect(content).toContain("DifferentiationPort");
  });

  it("engine/rankByCompositeScore.ts 应为纯函数，不依赖端口", () => {
    const file = join(root, "engine", "rankByCompositeScore.ts");
    const content = readFile(file);

    expect(content).toContain("export function rankByCompositeScore");
    expect(content).not.toContain("DifferentiationPort");
    expect(content).not.toContain("async");
  });
});
