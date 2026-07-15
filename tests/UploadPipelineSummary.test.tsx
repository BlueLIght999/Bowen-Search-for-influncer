import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadPipelineSummary } from "../app/components/UploadPipelineSummary";

describe("UploadPipelineSummary", () => {
  it("focuses the uploaded video result on script understanding, visual reasoning, and viral hooks", () => {
    render(
      <UploadPipelineSummary
        result={{
          asset: {
            id: "video_123",
            fileName: "demo.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            size: 1024,
            storagePath: "storage/uploads/video_123-demo.mp4",
            uploadedAt: "2026-07-09T00:00:00.000Z"
          },
          job: {
            id: "job_123",
            status: "completed",
            progressPercent: 100,
            createdAt: "2026-07-09T00:00:00.000Z",
            updatedAt: "2026-07-09T00:00:00.000Z"
          },
          mediaProcessing: {
            audio: { status: "failed", reason: "ffmpeg unavailable" },
            frames: { status: "failed", everySeconds: 5, reason: "ffmpeg unavailable" }
          },
          transcription: {
            source: "fallback",
            language: "zh",
            fullText: "回退文稿",
            segments: [{ start: 0, end: 0, text: "回退文稿" }]
          },
          ocr: {
            status: "completed",
            source: "paddleocr",
            signals: [
              { frameIndex: 1, text: "她竟然是继承人", confidence: 0.94 }
            ]
          },
          frameSamples: [
            { index: 1, timestampSeconds: 0, path: "storage/frames/video_123/frame-001.jpg" }
          ],
          videoObservation: {
            contentType: "ai_drama",
            scenes: [
              {
                start: 0,
                end: 3,
                summary: "身份反转前置，用人物近景建立冲突。",
                signals: ["frame-001.jpg"]
              }
            ],
            visualTags: ["sampled-frames", "ai-drama"],
            aiDramaSignals: [
              { type: "hook", label: "强钩子", evidence: "开场冲突" }
            ],
            subtitleSignals: [],
            evidenceConfidence: "medium"
          },
          report: {
            jobId: "job_123",
            status: "completed",
            analysisMode: "multimodal",
            modelSummary: {
              provider: "fake",
              model: "fake-temporal-reasoner-v1",
              promptVersion: "fake-reasoning-v1",
              schemaVersion: "multimodal-video-v1",
              analyzedDurationMs: 3000,
              coverageRatio: 1,
              partial: false
            },
            video: { id: "video_123", filename: "demo.mp4" },
            transcript: { text: "回退文稿", confidence: "medium" },
            understanding: {
              contentType: "ai_drama",
              scenes: [
                {
                  start: 0,
                  end: 3,
                  summary: "身份反转前置，用人物近景建立冲突。",
                  signals: ["frame-001.jpg"]
                }
              ],
              visualTags: ["ai-drama"],
              aiDramaSignals: [
                { type: "hook", label: "强钩子", evidence: "开场冲突" }
              ],
              subtitleSignals: [],
              evidenceConfidence: "medium",
              claims: [
                {
                  id: "claim_1",
                  type: "inference",
                  statement: "开场冲突有效",
                  confidence: 0.8,
                  evidenceRefs: [
                    {
                      startMs: 0,
                      endMs: 3000,
                      frameIds: ["frame_1"],
                      transcriptSegmentIds: ["transcript_1"],
                      ocrEvidenceIds: []
                    }
                  ],
                  knowledgeIds: []
                }
              ]
            },
            knowledgeEvidence: [
              {
                item: {
                  id: "ai-verification",
                  category: "AI科技",
                  title: "AI 答案交叉验证",
                  strategy: "给出判断标准。",
                  appliesWhen: ["AI"]
                },
                score: 4,
                matchReasons: ["category: AI科技", "keyword: AI"]
              }
            ],
            creatorInsights: {
              script: {
                mainContent: "用户视频讲述身份反转，并用开场冲突建立剧情吸引力。",
                logicBeats: ["开场冲突", "身份揭示", "结尾悬念"],
                hookHits: ["身份反转", "冲突前置"],
                rewriteDirections: ["把继承人身份揭晓移动到第 3 秒。"],
                timestampEvidence: [
                  { startMs: 0, endMs: 3000, label: "开场冲突有效" }
                ]
              },
              visual: {
                sceneUnderstanding: ["身份反转前置，用人物近景建立冲突。"],
                shotRhythm: ["反应镜头", "证据特写"],
                aestheticIssues: ["字幕需要保持高对比度。"],
                timestampEvidence: [
                  { startMs: 0, endMs: 3000, label: "开场冲突有效" }
                ]
              },
              viral: {
                viralBreakdown: ["前 3 秒冲突清晰，适合做短剧爆点。"],
                hitReasons: ["身份反转", "下一集悬念"],
                weakPoints: ["评论触发问题不足"],
                remakeSuggestions: ["同款爆款应保留身份反转，并增加结尾追问。"],
                timestampEvidence: [
                  { startMs: 0, endMs: 3000, label: "开场冲突有效" }
                ]
              }
            },
            evaluation: {
              summary: "总结",
              scores: {
                scriptQuality: 80,
                hookStrength: 82,
                sceneDesign: 70,
                aestheticExperience: 66,
                emotionalRhythm: 78,
                differentiation: 81,
                viralPotential: 77,
                aiDramaFit: 88
              },
              scoreReasons: {
                scriptQuality: "文案结构完整。",
                hookStrength: "前三秒钩子清晰。",
                sceneDesign: "分镜节奏可执行。",
                aestheticExperience: "审美体验稳定。",
                emotionalRhythm: "情绪节奏有反转。",
                differentiation: "差异化角度明确。",
                viralPotential: "传播潜力中高。",
                aiDramaFit: "AI 漫剧适配较好。"
              },
              keywordRecommendations: [
                {
                  dimension: "scriptQuality",
                  label: "脚本优秀度",
                  keywords: ["身份反转", "冲突前置"],
                  reason: "用于强化剧情推进。"
                },
                {
                  dimension: "sceneDesign",
                  label: "分镜表现",
                  keywords: ["反应镜头", "证据特写"],
                  reason: "用于提升画面可读性。"
                }
              ],
              hitPatterns: ["钩子"],
              missingPatterns: ["评论追问不足"],
              suggestions: [
                {
                  title: "反转前置",
                  target: "hook",
                  reason: "前三秒需要明确利益点。",
                  action: "把继承人身份揭晓移动到第 3 秒。"
                },
                {
                  title: "补足反应镜头",
                  target: "scene",
                  reason: "当前冲突缺少视觉承接。",
                  action: "在证据公开后增加角色反应特写。"
                }
              ]
            },
            generatedOutline: {
              titleOptions: ["title A", "title B"],
              hook: "从反转开场。",
              scriptOutline: ["0-3s：钩子"],
              sceneOutline: ["近景冲突"],
              endingHook: "下一集悬念",
              aiDramaOutline: {
                relationship: "女主与家族反派建立清晰对立。",
                conflict: "背叛证据在第一幕被公开。",
                reversal: "女主真实继承人身份提前揭晓。",
                cliffhanger: "下一集揭晓谁在幕后操控。"
              }
            }
          }
        }}
      />
    );

    expect(screen.getByText("视频文稿理解")).toBeInTheDocument();
    expect(screen.getByText("视频画面/分镜理解")).toBeInTheDocument();
    expect(screen.getByText("爆点拆解与改造建议")).toBeInTheDocument();
    expect(screen.getByText("demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("分析模式：多模态")).toBeInTheDocument();
    expect(screen.getByText("模型：fake / fake-temporal-reasoner-v1")).toBeInTheDocument();
    expect(screen.getByText("当前为演示模型，未调用真实视觉大模型")).toBeInTheDocument();
    expect(screen.getByText("覆盖率：100%")).toBeInTheDocument();
    expect(screen.getByText("证据片段：00:00-00:03")).toBeInTheDocument();
    expect(screen.getByText("回退文稿")).toBeInTheDocument();
    expect(screen.getByText("用户视频讲述身份反转，并用开场冲突建立剧情吸引力。")).toBeInTheDocument();
    expect(screen.getByText("身份反转前置，用人物近景建立冲突。")).toBeInTheDocument();
    expect(screen.getByText("前 3 秒冲突清晰，适合做短剧爆点。")).toBeInTheDocument();
    expect(screen.getByText("把继承人身份揭晓移动到第 3 秒。")).toBeInTheDocument();
    expect(screen.getByText("在证据公开后增加角色反应特写。")).toBeInTheDocument();
    expect(screen.getByText("同款爆款应保留身份反转，并增加结尾追问。")).toBeInTheDocument();
    expect(screen.queryByText("P1 视频解析链路")).not.toBeInTheDocument();
    expect(screen.queryByText("RAG 命中依据")).not.toBeInTheDocument();
  });
});
