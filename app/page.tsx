"use client";

import { RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { categories } from "../src/domain/categories";
import { platforms } from "../src/domain/platforms";
import { defaultInput } from "../src/domain/sampleInputs";
import type { Category, GeneratedPlan, MvpInput, Platform, TranscriptionResult, TrendFetchResult, UploadedVideoAnalysis, VideoTrend } from "../src/domain/types";
import { LoginCard } from "./components/LoginCard";

export default function Page() {
  const [category, setCategory] = useState<Category>(defaultInput.category);
  const [platform, setPlatform] = useState<Platform>("bilibili");
  const [trendResult, setTrendResult] = useState<TrendFetchResult | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [transcript, setTranscript] = useState<TranscriptionResult | null>(null);
  const [viralDraft, setViralDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [error, setError] = useState("");

  // 上传视频差异化分析状态
  const [uploadedTitle, setUploadedTitle] = useState("");
  const [uploadedTranscript, setUploadedTranscript] = useState("");
  const [uploadedAnalysis, setUploadedAnalysis] = useState<UploadedVideoAnalysis | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [isUploadAnalyzing, setIsUploadAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const selectedVideo = useMemo(() => {
    return trendResult?.videos.find((video) => video.id === selectedVideoId) ?? trendResult?.videos[0] ?? null;
  }, [selectedVideoId, trendResult]);

  const input = useMemo(() => {
    return selectedVideo ? buildInputFromVideo(selectedVideo, category) : defaultInput;
  }, [category, selectedVideo]);

  async function fetchHotVideos(nextCategory = category, nextPlatform = platform) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/hot-videos?category=${encodeURIComponent(nextCategory)}&platform=${encodeURIComponent(nextPlatform)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
      }

      const result = (await response.json()) as TrendFetchResult;
      setTrendResult(result);
      setSelectedVideoId(result.videos[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "抓取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchHotVideos(category, platform);
  }, [category, platform]);

  useEffect(() => {
    setViralDraft("");
  }, [category, platform, selectedVideoId]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchTranscript() {
      if (!selectedVideo) {
        setTranscript(null);
        return;
      }

      try {
        const response = await fetch("/api/transcribe-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(selectedVideo),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`转写失败：${response.status}`);
        }

        const nextTranscript = (await response.json()) as TranscriptionResult;
        setTranscript(nextTranscript);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setTranscript({
          source: "fallback",
          language: "zh",
          fullText: selectedVideo.description || selectedVideo.title,
          segments: [
            {
              start: 0,
              end: 0,
              text: selectedVideo.description || selectedVideo.title
            }
          ]
        });
      }
    }

    fetchTranscript();

    return () => controller.abort();
  }, [selectedVideo]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPlan() {
      setIsPlanLoading(true);

      try {
        const response = await fetch("/api/generate-plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`生成建议失败：${response.status}`);
        }

        const nextPlan = (await response.json()) as GeneratedPlan;
        setPlan(nextPlan);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setError(err instanceof Error ? err.message : "生成建议失败");
      } finally {
        if (!controller.signal.aborted) {
          setIsPlanLoading(false);
        }
      }
    }

    fetchPlan();

    return () => controller.abort();
  }, [input]);

  if (!plan) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <p className="text-sm text-ink-mute">
          {isPlanLoading ? "正在生成博闻建议..." : "等待生成博闻建议..."}
        </p>
      </main>
    );
  }

  const currentPlan = plan;
  const leadingDirection = currentPlan.directions[0];
  const hitProbability = selectedVideo ? estimateHitProbability(selectedVideo.growthScore) : 0;
  const transcriptText = transcript?.fullText || selectedVideo?.description || selectedVideo?.title || "等待选择视频后生成文稿摘要。";

  function generateSameViralDraft() {
    if (!selectedVideo || !leadingDirection) {
      return;
    }

    const outline = leadingDirection.outline.map((item, index) => `${index + 1}. ${item}`).join("\n");
    setViralDraft(
      [
        `同款爆款标题：${leadingDirection.title}`,
        `开场钩子：${currentPlan.analysis.hookPattern}`,
        `核心观点：围绕「${selectedVideo.title}」延展为 ${category} 受众更容易转发的判断。`,
        `爆点策略：${leadingDirection.explosionStrategy}`,
        `拍摄建议：${leadingDirection.filmingAdvice}`,
        "视频大纲：",
        outline,
        `结尾动作：用「${currentPlan.analysis.collectibleMoment}」做收藏/评论触发。`
      ].join("\n")
    );
  }

  async function analyzeUploadedVideo() {
    if (!uploadedTranscript.trim() && !uploadedTitle.trim()) {
      setUploadError("请输入视频标题或粘贴视频文案/转写文本");
      return;
    }

    setIsUploadAnalyzing(true);
    setUploadError("");
    setUploadedAnalysis(null);

    try {
      const referenceTexts = (trendResult?.videos ?? []).map(
        (video) => `${video.title} ${video.description}`
      );

      const response = await fetch("/api/analyze-uploaded-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          hotspot: uploadedTitle || "上传视频分析",
          title: uploadedTitle,
          transcript: uploadedTranscript,
          creatorPositioning: defaultInput.creatorPositioning,
          referenceTexts
        })
      });

      if (!response.ok) {
        throw new Error(`分析失败：${response.status}`);
      }

      const result = (await response.json()) as UploadedVideoAnalysis;
      setUploadedAnalysis(result);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setIsUploadAnalyzing(false);
    }
  }

  async function uploadVideoForAnalysis(file: File | null) {
    if (!file) {
      return;
    }

    setIsVideoUploading(true);
    setUploadError("");
    setUploadedAnalysis(null);

    try {
      const referenceTexts = (trendResult?.videos ?? []).map(
        (video) => `${video.title} ${video.description}`
      );
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("title", uploadedTitle || file.name.replace(/\.[^.]+$/, ""));
      formData.append("hotspot", uploadedTitle || "上传视频分析");
      formData.append("creatorPositioning", defaultInput.creatorPositioning);
      formData.append("referenceTexts", JSON.stringify(referenceTexts));

      const response = await fetch("/api/upload-video", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `上传失败：${response.status}`);
      }

      const result = (await response.json()) as {
        uploadedVideo: { fileName: string };
        prefill: { title: string; transcript: string };
        analysis: UploadedVideoAnalysis;
      };
      setUploadedFileName(result.uploadedVideo.fileName);
      setUploadedTitle(result.prefill.title);
      setUploadedTranscript(result.prefill.transcript);
      setUploadedAnalysis(result.analysis);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setIsVideoUploading(false);
    }
  }

  // 引擎状态：根据上传分析结果判断
  const engineStatus = uploadedAnalysis?.differentiationMeta.source === "fallback" ? "fallback" : "online";

  return (
    <main className="min-h-screen bg-paper">
      {/* 顶部品牌栏 + 克制流光 */}
      <header className="mx-auto max-w-7xl px-4 pt-6 lg:px-6">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-tight text-ink">博闻--内容自媒体分析助手</h1>
            <p className="text-xs text-ink-mute">选题闭环操作系统</p>
          </div>
          <p className="text-xs text-ink-mute">{category} · {platforms.find((item) => item.id === platform)?.label}</p>
        </div>
        {/* 克制流光：仅顶部短段细线 */}
        <svg className="mt-2 h-1 w-full" viewBox="0 0 720 4" preserveAspectRatio="none">
          <path className="flow-line" d="M0 2 L200 2" />
        </svg>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-6 lg:grid-cols-[400px_1fr] lg:px-6">
        {/* 左列：品类 + 热榜 */}
        <aside className="animate-soft-rise">
          <div className="mb-4">
            <p className="mb-2 text-xs text-ink-mute">品类</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    category === item
                      ? "bg-ink text-paper"
                      : "bg-paper-soft text-ink-soft hover:text-ink"
                  }`}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs text-ink-mute">平台</p>
            <div className="flex gap-2">
              {platforms.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    platform === item.id
                      ? "bg-ink text-paper"
                      : "bg-paper-soft text-ink-soft hover:text-ink"
                  }`}
                  onClick={() => setPlatform(item.id)}
                  type="button"
                  title={item.description}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="mb-6 flex items-center gap-2 text-xs text-ink-mute transition hover:text-ink"
            onClick={() => fetchHotVideos(category, platform)}
            disabled={isLoading}
            type="button"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "抓取中" : "刷新热榜"}
          </button>

          {error ? <p className="mb-4 text-xs text-flow-deep">{error}</p> : null}

          <div>
            <p className="mb-3 text-xs text-ink-mute">
              热榜 TOP 10 · {trendResult?.source === "live" ? "实时" : "回退"}
            </p>
            <div className="space-y-3">
              {(trendResult?.videos ?? []).map((video, index) => {
                const isSelected = selectedVideo?.id === video.id;
                return (
                  <button
                    key={video.id}
                    className={`flex w-full gap-3 pl-2 text-left transition ${
                      isSelected ? "border-l-2 border-flow-deep pl-1.5" : "border-l-2 border-transparent"
                    }`}
                    onClick={() => setSelectedVideoId(video.id)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-5 ${isSelected ? "font-semibold text-flow-deep" : "font-medium text-ink"}`}>
                        {video.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-mute">
                        +{video.growthScore} · {video.growthReason}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 左下角登录态卡片 */}
          <div className="mt-8">
            <LoginCard name="观点观察者" uid="10248573" engineStatus={engineStatus} />
          </div>
        </aside>

        {/* 右列：详情 + 分析 */}
        <section className="space-y-8">
          {/* 选中视频 */}
          <div className="animate-soft-rise-2">
            <p className="mb-2 text-xs text-ink-mute">选中视频</p>
            <h2 className="text-base font-semibold leading-tight text-ink">
              {selectedVideo?.title ?? "等待榜单抓取"}
            </h2>
            {selectedVideo ? (
              <a className="mt-1 inline-block text-xs text-flow-deep underline" href={selectedVideo.url} target="_blank" rel="noreferrer">
                打开原视频
              </a>
            ) : null}

            {/* 指标条：无边框，大字 + 标签 */}
            {selectedVideo ? (
              <div className="mt-4 flex gap-8">
                <Metric label="播放" value={formatCount(selectedVideo.viewCount)} />
                <Metric label="点赞" value={formatCount(selectedVideo.likeCount)} />
                <Metric label="收藏" value={formatCount(selectedVideo.favoriteCount)} />
                <Metric label="增长分" value={`${selectedVideo.growthScore}`} />
                <Metric label="独特性" value={`${leadingDirection?.uniquenessScore ?? "—"}`} accent />
              </div>
            ) : null}

            <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-soft">{plan.summary}</p>
          </div>

          {/* 文案拆解 */}
          <div className="animate-soft-rise-2 border-t border-line pt-6">
            <p className="mb-3 text-xs text-ink-mute">文案拆解</p>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="text-sm leading-6 text-ink-soft">{transcriptText}</p>
                <p className="mt-2 text-xs text-ink-mute">
                  文稿来源：{transcript?.source === "funasr" ? "FunASR 转写" : "标题/简介"}
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-ink">
                  {plan.analysis.hookPattern}
                </p>
              </div>
              <div className="space-y-3">
                <InfoBlock label="情绪触发" body={plan.analysis.emotionalTrigger} />
                <InfoBlock label="收藏触发" body={plan.analysis.collectibleMoment} />
                <InfoBlock label="拍摄场景" body={plan.analysis.sceneStyle} />
              </div>
            </div>
            <ol className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              {plan.analysis.copyLogic.map((item, index) => (
                <li key={item} className="flex gap-2 text-ink-soft">
                  <span className="text-xs text-ink-mute">{String(index + 1).padStart(2, "0")}</span>
                  <span className="leading-5">{item}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* 趋势预测 */}
          <div className="animate-soft-rise-2 border-t border-line pt-6">
            <p className="mb-3 text-xs text-ink-mute">趋势预测</p>
            <div className="grid gap-6 md:grid-cols-[160px_1fr]">
              <div>
                <p className="text-xs text-ink-mute">成为爆点几率</p>
                <p className="mt-1 text-3xl font-bold text-ink">{hitProbability}%</p>
                <p className="mt-1 text-xs leading-4 text-ink-mute">基于 5 日增长率、互动强度和品类热度估算</p>
              </div>
              <div className="space-y-3">
                <InfoBlock label="跟进方向" body={leadingDirection?.angle ?? "等待生成方向"} />
                <InfoBlock label="爆点策略" body={leadingDirection?.explosionStrategy ?? "等待生成策略"} />
                <InfoBlock label="差异化建议" body={plan.knowledgeUsed[0]?.strategy ?? plan.reviewPrompt} />
              </div>
            </div>
          </div>

          {/* 同款爆款生成 */}
          <div className="animate-soft-rise-2 border-t border-line pt-6">
            <p className="mb-3 text-xs text-ink-mute">同款爆款生成</p>
            {plan.evaluation.length > 0 ? (
              <div className="mb-6 border-b border-line pb-6">
                <p className="mb-3 text-xs text-ink-mute">AI作品评估</p>
                <div className="grid gap-4 md:grid-cols-2">
                  {plan.evaluation.map((item) => (
                    <section key={item.dimension} className="border-b border-line pb-4">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-ink">{item.dimension}</h3>
                          <p className="mt-1 text-xs leading-5 text-ink-mute">{item.description}</p>
                        </div>
                        <span className="text-lg font-bold text-ink">{item.score}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.keywords.map((keyword) => (
                          <span key={keyword} className="rounded-full border border-line px-2 py-1 text-xs text-ink-soft">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
            {viralDraft ? (
              <pre className="mb-4 whitespace-pre-line text-sm leading-6 text-ink-soft">{viralDraft}</pre>
            ) : (
              <p className="mb-4 text-sm leading-6 text-ink-mute">
                点击按钮后，根据文稿结构、爆点触发和趋势预测，生成一版可拍摄的同款爆款脚本。
              </p>
            )}
            <div className="flex justify-end">
              <button
                className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-paper transition hover:bg-ink-soft disabled:bg-ink-mute"
                onClick={generateSameViralDraft}
                disabled={!selectedVideo || !leadingDirection}
                type="button"
              >
                一键生成
              </button>
            </div>
          </div>

          {/* 上传视频 → AI 差异化分析 */}
          <div className="animate-soft-rise-3 border-t border-line pt-6">
            <p className="mb-3 text-xs text-ink-mute">上传视频 → AI 差异化分析</p>
            <p className="mb-4 max-w-2xl text-sm leading-6 text-ink-soft">
              粘贴视频标题和文案，博闻调用 sentence-transformers 语义嵌入和 BERTopic 主题聚类，
              计算每个差异化方向的真实独特性和竞争密度评分。
            </p>

            <div className="mb-4 border-b border-line pb-4">
              <label className="mb-2 block text-xs text-ink-mute">上传视频文件</label>
              <input
                className="block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-xs file:font-medium file:text-paper"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,video/x-m4v,video/mpeg,.mp4,.mov,.webm,.mkv,.avi,.m4v,.mpeg,.mpg"
                disabled={isVideoUploading}
                onChange={(event) => uploadVideoForAnalysis(event.target.files?.[0] ?? null)}
                type="file"
              />
              <p className="mt-2 text-xs leading-5 text-ink-mute">
                支持 mp4、mov、webm、mkv、avi、m4v、mpeg。上传后会自动生成 AI 解析配置，并填入下方分析区。
              </p>
              {uploadedFileName ? <p className="mt-1 text-xs text-flow-deep">已载入：{uploadedFileName}</p> : null}
              {isVideoUploading ? <p className="mt-1 text-xs text-flow-deep">正在解析视频配置...</p> : null}
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-ink-mute">视频标题</label>
              <input
                className="w-full border-b border-line bg-transparent px-0 py-2 text-sm text-ink outline-none transition focus:border-flow-deep"
                placeholder="例如：别再只用传统搜索了，AI搜索正在改变信息获取"
                value={uploadedTitle}
                onChange={(event) => setUploadedTitle(event.target.value)}
                type="text"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-ink-mute">视频文案 / 转写文本</label>
              <textarea
                className="w-full border-b border-line bg-transparent px-0 py-2 text-sm leading-6 text-ink outline-none transition focus:border-flow-deep"
                placeholder="粘贴视频字幕、文案或转写文本..."
                rows={4}
                value={uploadedTranscript}
                onChange={(event) => setUploadedTranscript(event.target.value)}
              />
            </div>

            <div className="mb-4 flex items-center gap-3">
              <span className="text-xs text-ink-mute">品类：{category}</span>
              <span className="text-xs text-ink-mute">参照池：{trendResult?.videos.length ?? 0} 条</span>
            </div>

            {uploadError ? (
              <p className="mb-3 text-xs text-flow-deep">{uploadError}</p>
            ) : null}

            <div className="mb-6 flex justify-end">
              <button
                className="flex items-center gap-2 rounded-full bg-flow-deep px-5 py-2 text-xs font-medium text-paper transition hover:bg-flow disabled:bg-ink-mute"
                onClick={analyzeUploadedVideo}
                disabled={isUploadAnalyzing || (!uploadedTranscript.trim() && !uploadedTitle.trim())}
                type="button"
              >
                <Upload className="h-3 w-3" />
                {isUploadAnalyzing ? "AI 分析中..." : "分析差异化制作途径"}
              </button>
            </div>

            {uploadedAnalysis ? (
              <div className="space-y-4">
                <div className="border-l-2 border-flow pl-4">
                  <p className="text-xs text-ink-mute">
                    评分来源：{uploadedAnalysis.differentiationMeta.source === "fallback" ? "本地启发式回退" : "P0 算法（语义嵌入+主题聚类）"}
                    {uploadedAnalysis.differentiationMeta.corpusSize !== undefined
                      ? ` · 参照池 ${uploadedAnalysis.differentiationMeta.corpusSize} 条`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">{uploadedAnalysis.summary}</p>
                </div>

                {uploadedAnalysis.directions.map((direction, index) => (
                  <div key={index} className="border-t border-line pt-4">
                    {/* 顶部流光条 */}
                    <div className="mb-3 h-0.5 w-32 rounded-full bg-flow opacity-60" />
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-tight text-ink">{direction.title}</h3>
                      <span className="text-xs text-ink-mute">#{index + 1}</span>
                    </div>
                    <p className="mb-3 text-xs text-ink-mute">{direction.angle}</p>
                    <div className="mb-3 flex gap-8">
                      <div>
                        <p className="text-2xl font-bold text-flow-deep">{direction.uniquenessScore}</p>
                        <p className="text-xs text-ink-mute">独特性</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-ink">{direction.competitionScore}</p>
                        <p className="text-xs text-ink-mute">竞争密度</p>
                      </div>
                    </div>
                    <p className="mb-1 text-xs leading-5 text-ink-soft">
                      <span className="font-medium text-ink">爆点策略：</span>{direction.explosionStrategy}
                    </p>
                    <p className="mb-2 text-xs leading-5 text-ink-soft">
                      <span className="font-medium text-ink">拍摄建议：</span>{direction.filmingAdvice}
                    </p>
                    <ol className="ml-4 list-decimal space-y-0.5 text-xs leading-5 text-ink-soft">
                      {direction.outline.map((item, outlineIndex) => (
                        <li key={outlineIndex}>{item}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function buildInputFromVideo(video: VideoTrend, category: Category): MvpInput {
  return {
    category,
    hotspot: video.title,
    creatorPositioning: defaultInput.creatorPositioning,
    sampleText: `标题：${video.title}\n简介：${video.description}\n作者：${video.author}\n增长信号：${video.growthReason}`,
    commentSignals: defaultInput.commentSignals
  };
}

function estimateHitProbability(growthScore: number): number {
  return Math.max(35, Math.min(92, Math.round(48 + growthScore * 0.18)));
}

function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return `${value}`;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-bold ${accent ? "text-flow-deep" : "text-ink"}`}>{value}</p>
      <p className="text-xs text-ink-mute">{label}</p>
    </div>
  );
}

function InfoBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="border-l-2 border-line pl-3">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className="mt-0.5 text-sm leading-5 text-ink-soft">{body}</p>
    </div>
  );
}
