/**
 * 评分徽章 — 大号数字 + 可选标签
 *
 * 颜色规则：≥80 浅蓝 / ≥50 深灰 / <50 琥珀
 */
export function ScoreBadge({
  score,
  label,
  size = "default"
}: {
  score: number;
  label?: string;
  size?: "default" | "large";
}) {
  const color =
    score >= 80
      ? "text-flow-deep"
      : score >= 50
        ? "text-ink"
        : "text-amber-deep";

  const sizeClass = size === "large" ? "text-3xl" : "text-2xl";

  return (
    <div className="text-right">
      <p className={`${sizeClass} font-bold ${color}`}>{score}</p>
      {label ? <p className="text-xs text-ink-mute">{label}</p> : null}
    </div>
  );
}
