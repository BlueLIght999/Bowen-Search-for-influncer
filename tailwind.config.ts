import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 黑白主色调
        ink: "#111827",
        "ink-soft": "#4B5563",
        "ink-mute": "#9CA3AF",
        paper: "#FFFFFF",
        "paper-soft": "#F9FAFB",
        line: "#F3F4F6",
        // 浅蓝点缀
        flow: "#60A5FA",
        "flow-deep": "#3B82F6",
        // 淡黄科技区
        amber: "#FCD34D",
        "amber-bg": "#FFFBEB",
        "amber-soft": "#FEF3C7",
        "amber-deep": "#D97706",
        "amber-text": "#92400E"
      },
      animation: {
        "soft-rise": "softRise 0.7s ease-out both",
        "soft-rise-2": "softRise 0.7s ease-out 0.25s both",
        "soft-rise-3": "softRise 0.7s ease-out 0.5s both",
        "amber-pulse": "amberPulse 2.4s ease-in-out infinite",
        "ring-draw": "ringDraw 1s ease-out forwards"
      },
      keyframes: {
        softRise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        amberPulse: {
          "0%, 100%": { opacity: "0.65" },
          "50%": { opacity: "1" }
        },
        ringDraw: {
          "0%": { strokeDashoffset: "60" },
          "100%": { strokeDashoffset: "0" }
        }
      }
    }
  },
  plugins: []
};

export default config;
