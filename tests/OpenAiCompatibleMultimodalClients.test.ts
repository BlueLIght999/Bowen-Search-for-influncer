import { describe, expect, it, vi } from "vitest";
import { buildVideoEvidenceBundle } from "../src/application/useCases/buildVideoEvidenceBundle";
import { understandVideoSlices } from "../src/application/useCases/understandVideoSlices";
import {
  OpenAiCompatibleContentReasoningClient,
  OpenAiCompatibleMultimodalUnderstandingClient
} from "../src/infrastructure/multimodal/OpenAiCompatibleMultimodalClients";
import { FakeMultimodalUnderstandingClient } from "../src/infrastructure/multimodal/FakeMultimodalUnderstandingClient";

describe("OpenAI-compatible multimodal clients", () => {
  it("normalizes a structured slice response with frame inputs", async () => {
    const fixture = createEvidenceFixture();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Opening identity reveal with a readable subtitle.",
                visibleSubjects: ["heroine", "family"],
                actions: ["reveals hidden identity"],
                shotTypes: ["close-up"],
                subtitleLegibility: "clear",
                aiDramaSignals: ["identity_reversal"],
                confidence: 0.86,
                claims: [
                  {
                    statement: "The first shot makes the identity reversal visible.",
                    type: "observation",
                    confidence: 0.84
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 120, completion_tokens: 80 }
      })
    );
    const client = new OpenAiCompatibleMultimodalUnderstandingClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "vision-test",
      fetch: fetchMock,
      readFile: vi.fn(async () => Buffer.from("fake image"))
    });

    const result = await client.understandSlice({
      jobId: fixture.bundle.jobId,
      videoId: fixture.bundle.videoId,
      evidenceBundle: fixture.bundle,
      slice: fixture.bundle.timelineSlices[0],
      frameAssets: fixture.frameAssets
    });

    expect(result.status).toBe("completed");
    expect(result.observation).toMatchObject({
      summary: "Opening identity reveal with a readable subtitle.",
      visibleSubjects: ["heroine", "family"],
      aiDramaSignals: ["identity_reversal"]
    });
    expect(result.execution).toMatchObject({
      provider: "openai_compatible",
      model: "vision-test",
      promptVersion: "openai-compatible-slice-v1",
      schemaVersion: "multimodal-slice-v1",
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        imageCount: 1,
        frameCount: 1
      }
    });

    const body = JSON.stringify(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("data:image/jpeg;base64");
    expect(body).not.toContain("storage/frames");
    expect(body).toContain("storyboard");
    expect(body).toContain("viralVisualHook");
    expect(body).toContain("remakeCue");
  });

  it("retries malformed JSON once and returns a recognizable failure", async () => {
    const fixture = createEvidenceFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "not json" } }]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "{still broken" } }]
        })
      );
    const client = new OpenAiCompatibleMultimodalUnderstandingClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "vision-test",
      fetch: fetchMock,
      readFile: vi.fn(async () => Buffer.from("fake image"))
    });

    const result = await client.understandSlice({
      jobId: fixture.bundle.jobId,
      videoId: fixture.bundle.videoId,
      evidenceBundle: fixture.bundle,
      slice: fixture.bundle.timelineSlices[0],
      frameAssets: fixture.frameAssets
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "failed",
      retryable: true
    });
    expect(result.reason).toContain("OpenAI-compatible slice output invalid");
  });

  it("normalizes video-level reasoning into a multimodal understanding", async () => {
    const fixture = createEvidenceFixture();
    const sliceUnderstanding = await understandVideoSlices({
      evidenceBundle: fixture.bundle,
      frameAssets: fixture.frameAssets,
      multimodal: new FakeMultimodalUnderstandingClient()
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contentType: "ai_drama",
                narrative: {
                  premise: { statement: "A heroine is betrayed and returns stronger." },
                  hook: { statement: "The opening frame exposes the betrayal." },
                  conflict: { statement: "The family blocks her return." },
                  reversal: { statement: "Her new identity changes the power relation." },
                  ending: { statement: "The ending leaves a next-episode question." }
                },
                visualCraft: {
                  composition: [{ statement: "Close-up composition supports conflict." }],
                  shotVariety: [{ statement: "Reaction shots clarify the relationship." }],
                  continuity: [],
                  subtitleLegibility: [{ statement: "Subtitle is readable enough for silent viewing." }],
                  styleConsistency: [],
                  pacing: [{ statement: "Opening and ending beats are clear." }]
                },
                aiDrama: {
                  conflict: [{ statement: "Betrayal is visually obvious." }],
                  reversals: [{ statement: "Identity reversal is present." }],
                  styleDrift: [],
                  cliffhanger: { statement: "The ending invites the next episode." },
                  seriesPotential: { statement: "The setup can continue as a series." }
                }
              })
            }
          }
        ],
        usage: { prompt_tokens: 180, completion_tokens: 110 }
      })
    );
    const client = new OpenAiCompatibleContentReasoningClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "vision-test",
      fetch: fetchMock
    });

    const result = await client.reason({
      jobId: fixture.bundle.jobId,
      videoId: fixture.bundle.videoId,
      evidenceBundle: fixture.bundle,
      sliceObservations: sliceUnderstanding.observations,
      coverage: sliceUnderstanding.coverage
    });

    expect(result.status).toBe("completed");
    expect(result.understanding).toMatchObject({
      contentType: "ai_drama",
      narrative: {
        hook: expect.objectContaining({
          statement: "The opening frame exposes the betrayal."
        })
      },
      execution: {
        provider: "openai_compatible",
        model: "vision-test",
        usage: {
          inputTokens: 180,
          outputTokens: 110
        }
      }
    });

    const body = JSON.stringify(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("frontend_sections");
    expect(body).toContain("visual.sceneUnderstanding");
    expect(body).toContain("viral.viralBreakdown");
    expect(body).toContain("viral.remakeSuggestions");
    expect(body).toContain("Chinese");
  });

  it("accepts Qwen-style reasoning claims with alternate text fields and singleton claim values", async () => {
    const fixture = createEvidenceFixture();
    const sliceUnderstanding = await understandVideoSlices({
      evidenceBundle: fixture.bundle,
      frameAssets: fixture.frameAssets,
      multimodal: new FakeMultimodalUnderstandingClient()
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contentType: "mixed",
                narrative: {
                  premise: {
                    text: "The video builds curiosity through surreal warning signs."
                  },
                  hook: {
                    description: "The first beat makes the sign feel uncanny."
                  }
                },
                visualCraft: {
                  composition:
                    "Surreal signage is placed as the main visual anchor.",
                  shotVariety: {
                    summary: "Close-ups and wide shots alternate to keep novelty."
                  },
                  pacing: [
                    {
                      description:
                        "The montage moves quickly enough to preserve curiosity."
                    }
                  ]
                },
                aiDrama: {
                  conflict: "The setting frames an ordinary world becoming unstable.",
                  cliffhanger: {
                    summary: "The premise can continue through stranger signs."
                  }
                }
              })
            }
          }
        ],
        usage: { prompt_tokens: 180, completion_tokens: 110 }
      })
    );
    const client = new OpenAiCompatibleContentReasoningClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "qwen3-vl-plus",
      fetch: fetchMock
    });

    const result = await client.reason({
      jobId: fixture.bundle.jobId,
      videoId: fixture.bundle.videoId,
      evidenceBundle: fixture.bundle,
      sliceObservations: sliceUnderstanding.observations,
      coverage: sliceUnderstanding.coverage
    });

    expect(result.status).toBe("completed");
    expect(result.understanding?.narrative.premise.statement).toBe(
      "The video builds curiosity through surreal warning signs."
    );
    expect(result.understanding?.narrative.hook?.statement).toBe(
      "The first beat makes the sign feel uncanny."
    );
    expect(result.understanding?.visualCraft.composition[0].statement).toBe(
      "Surreal signage is placed as the main visual anchor."
    );
    expect(result.understanding?.visualCraft.shotVariety[0].statement).toBe(
      "Close-ups and wide shots alternate to keep novelty."
    );
    expect(result.understanding?.aiDrama?.conflict[0].statement).toBe(
      "The setting frames an ordinary world becoming unstable."
    );
  });

  it("synthesizes a premise when video-level reasoning omits narrative.premise", async () => {
    const fixture = createEvidenceFixture();
    const sliceUnderstanding = await understandVideoSlices({
      evidenceBundle: fixture.bundle,
      frameAssets: fixture.frameAssets,
      multimodal: new FakeMultimodalUnderstandingClient()
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contentType: "mixed",
                narrative: {
                  summary:
                    "A surreal sign story turns ordinary rules into a curiosity hook."
                },
                visualCraft: {
                  pacing: ["The sequence keeps a quick reveal rhythm."]
                }
              })
            }
          }
        ],
        usage: { prompt_tokens: 180, completion_tokens: 110 }
      })
    );
    const client = new OpenAiCompatibleContentReasoningClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "qwen3-vl-plus",
      fetch: fetchMock
    });

    const result = await client.reason({
      jobId: fixture.bundle.jobId,
      videoId: fixture.bundle.videoId,
      evidenceBundle: fixture.bundle,
      sliceObservations: sliceUnderstanding.observations,
      coverage: sliceUnderstanding.coverage
    });

    expect(result.status).toBe("completed");
    expect(result.understanding?.narrative.premise.statement).toBe(
      "A surreal sign story turns ordinary rules into a curiosity hook."
    );
    expect(result.understanding?.visualCraft.pacing[0].statement).toBe(
      "The sequence keeps a quick reveal rhythm."
    );
  });
});

function createEvidenceFixture() {
  return buildVideoEvidenceBundle({
    jobId: "job_vision",
    videoId: "video_vision",
    durationSeconds: 12,
    transcription: {
      source: "funasr",
      language: "zh",
      duration: 12,
      fullText: "The heroine is betrayed. She returns with a hidden identity.",
      segments: [
        {
          start: 0,
          end: 12,
          text: "The heroine is betrayed. She returns with a hidden identity."
        }
      ]
    },
    frames: [
      {
        index: 1,
        timestampSeconds: 0,
        path: "storage/frames/video_vision/frame-001.jpg"
      }
    ],
    frameSampling: {
      status: "completed",
      everySeconds: 5
    },
    ocr: {
      status: "completed",
      source: "paddleocr",
      signals: [
        {
          frameIndex: 1,
          text: "She is the heir",
          confidence: 0.91
        }
      ]
    }
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
