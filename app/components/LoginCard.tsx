/**
 * LoginCard — 左下角登录态卡片
 *
 * 「静水·精修」方案：168×56 淡黄区块，
 * 包含头像（琥珀描边环）、账号名、UID、引擎状态。
 */

export type EngineStatus = "online" | "offline" | "fallback";

interface LoginCardProps {
  name: string;
  uid: string;
  engineStatus?: EngineStatus;
}

const STATUS_TEXT: Record<EngineStatus, string> = {
  online: "P0 ENGINE · ONLINE",
  offline: "P0 ENGINE · OFFLINE",
  fallback: "P0 ENGINE · FALLBACK"
};

export function LoginCard({ name, uid, engineStatus = "online" }: LoginCardProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-[10px] border border-amber bg-amber-bg px-4 py-2.5"
      style={{ width: "168px", height: "56px" }}
    >
      {/* 头像：圆形 + 琥珀描边环 */}
      <div className="relative">
        <svg width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="头像">
          <circle cx="16" cy="16" r="15" fill="#FEF3C7" />
          <circle
            cx="16"
            cy="16"
            r="15"
            fill="none"
            stroke="#D97706"
            strokeWidth="1.2"
            className="animate-ring-draw"
            style={{ strokeDasharray: 60, strokeDashoffset: 60 }}
          />
          {/* 简约人形剪影 */}
          <circle cx="16" cy="13" r="4" fill="#D97706" opacity="0.6" />
          <path
            d="M9 24 Q16 18 23 24"
            fill="none"
            stroke="#D97706"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
        {/* 在线状态点：呼吸脉冲 */}
        <span
          className="absolute -bottom-0.5 -right-0.5 block h-2 w-2 rounded-full border border-amber-deep bg-amber animate-amber-pulse"
          aria-label="引擎在线状态"
        />
      </div>

      {/* 文字区 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-amber-text">{name}</p>
        <p className="text-[9px] leading-tight text-amber-deep opacity-80">
          UID {uid}
        </p>
        <p className="text-[8px] leading-tight text-amber-deep opacity-65 tracking-wider">
          {STATUS_TEXT[engineStatus]}
        </p>
      </div>
    </div>
  );
}
