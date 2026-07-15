/**
 * 访谈知识仓储适配器
 *
 * 从 interview-collector 输出目录加载蒸馏案例 JSON，
 * 使用 extractInterviewKnowledge 纯函数转换为 KnowledgeItem[]，
 * 再通过 retrieveKnowledgeEvidence 纯函数引擎进行检索。
 *
 * 降级链：
 * 1. 正常：目录存在 + JSON 有效 → 知识检索
 * 2. 目录不存在：返回空数组（调用方应回退到 LocalKnowledgeRepository）
 * 3. JSON 损坏：跳过该文件，记录日志
 */

import * as fs from "fs";
import { join } from "path";
import type {
  KnowledgeQuery,
  KnowledgeRepositoryPort,
} from "../../application/ports/KnowledgeRepositoryPort";
import type { RetrievedKnowledge, KnowledgeItem } from "../../domain/types";
import type { DistilledCaseFile } from "../../domain/interview/types";
import { extractInterviewKnowledge } from "../../engine/extractInterviewKnowledge";
import { retrieveKnowledgeEvidence } from "../../engine/retrieveKnowledge";

const INTERVIEW_TYPES = new Set([
  "interview_technique",
  "interview_hook",
  "interview_structure",
  "interview_collectible",
]);

export class InterviewKnowledgeRepository implements KnowledgeRepositoryPort {
  private readonly outputDir: string;
  private items: KnowledgeItem[] = [];

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.reload();
  }

  /** 重新加载目录中的所有案例文件 */
  reload(): void {
    this.items = [];

    if (!fs.existsSync(this.outputDir)) {
      return;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(this.outputDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;

      const fullPath = join(this.outputDir, entry);
      try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        const file = JSON.parse(raw) as DistilledCaseFile;
        const extracted = extractInterviewKnowledge(file);
        this.items.push(...extracted);
      } catch {
        // 跳过损坏的 JSON 文件，不影响其他文件加载
      }
    }
  }

  async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledge[]> {
    if (this.items.length === 0) {
      return [];
    }

    // 先按访谈类型过滤
    const interviewItems = this.items.filter(
      (item) => item.type && INTERVIEW_TYPES.has(item.type)
    );

    if (interviewItems.length === 0) {
      return [];
    }

    // 复用现有检索引擎
    return retrieveKnowledgeEvidence(query, interviewItems);
  }

  /** 获取已加载的知识条目总数（测试用） */
  get itemCount(): number {
    return this.items.length;
  }
}
