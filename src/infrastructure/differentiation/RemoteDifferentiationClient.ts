import type {
  CompetitionScoreInput,
  CompetitionScoreResult,
  DifferentiationPort,
  UniquenessScoreInput,
  UniquenessScoreResult
} from "../../application/ports/DifferentiationPort";

interface RemoteDifferentiationClientOptions {
  endpoint?: string;
  timeoutMs?: number;
}

/**
 * 远程差异化评分适配器
 *
 * 调用 differentiation-service Python 微服务
 *（sentence-transformers + BERTopic）。
 *
 * 环境变量 DIFFERENTIATION_SERVICE_URL 可覆盖默认地址。
 */
export class RemoteDifferentiationClient implements DifferentiationPort {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: RemoteDifferentiationClientOptions = {}) {
    const base = (options.endpoint ?? process.env.DIFFERENTIATION_SERVICE_URL ?? "http://localhost:8766").replace(/\/$/, "");
    this.endpoint = base;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async scoreUniqueness(input: UniquenessScoreInput): Promise<UniquenessScoreResult> {
    const response = await this.post("/uniqueness", {
      candidateAngles: input.candidateAngles,
      referenceTexts: input.referenceTexts
    });

    const data = (await response.json()) as { scores: number[]; source: string };
    return { scores: data.scores, source: data.source };
  }

  async scoreCompetition(input: CompetitionScoreInput): Promise<CompetitionScoreResult> {
    const response = await this.post("/competition", {
      query: input.query,
      corpus: input.corpus
    });

    const data = (await response.json()) as {
      score: number;
      topicId: number;
      topicSize: number;
      corpusSize: number;
      source: string;
    };

    return {
      score: data.score,
      topicId: data.topicId,
      topicSize: data.topicSize,
      corpusSize: data.corpusSize,
      source: data.source
    };
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Differentiation service responded ${response.status}`);
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
