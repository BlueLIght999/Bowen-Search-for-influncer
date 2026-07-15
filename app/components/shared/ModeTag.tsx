/**
 * 分析模式标签 — 降级状态对用户可见
 *
 * multimodal: 浅蓝（完整分析）
 * text_only:  深灰（仅文稿，视觉模型失败）
 * rules_fallback: 琥珀（规则兜底，推理模型失败）
 */
const MODE_LABELS: Record<string, string> = {
  multimodal: "多模态",
  text_only: "仅文稿",
  rules_fallback: "规则兜底",
};

const MODE_COLORS: Record<string, string> = {
  multimodal: "text-flow-deep",
  text_only: "text-ink-soft",
  rules_fallback: "text-amber-deep",
};

export function ModeTag({
  mode,
  source,
}: {
  mode: "multimodal" | "text_only" | "rules_fallback";
  source?: string;
}) {
  const label = MODE_LABELS[mode] ?? mode;
  const color = MODE_COLORS[mode] ?? "text-ink-mute";

  return (
    <span className={`text-xs ${color}`}>
      {label}
      {source ? ` · ${source}` : ""}
    </span>
  );
}
