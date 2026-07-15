import type { ReactNode } from "react";

/**
 * 空状态占位 — 无数据时展示功能说明
 *
 * 遵循 frontend-skill：无卡片，仅 border-top + 文字
 */
export function EmptyState({
  icon,
  title,
  body,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <div className="border-t-2 border-line pt-4">
      <div className="flex items-center gap-2 text-ink-soft">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-4 max-w-md text-sm leading-6 text-ink-mute">{body}</p>
      {hint ? (
        <p className="mt-2 text-xs text-ink-mute">{hint}</p>
      ) : null}
    </div>
  );
}
