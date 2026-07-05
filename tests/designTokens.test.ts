import { describe, expect, it } from "vitest";
import { resolve } from "path";
import { readFileSync } from "fs";

/**
 * 设计令牌测试（TDD-Red）
 *
 * 验证「静水·精修」方案的色彩系统已正确写入 tailwind.config.ts：
 * - 黑白浅蓝主色调
 * - 淡黄科技点缀色
 * - 去除旧的 moss/coral/gold 配色
 */

const configPath = resolve(__dirname, "../tailwind.config.ts");
const configContent = readFileSync(configPath, "utf-8");

describe("tailwind 设计令牌 — 静水·精修", () => {
  it("包含 ink 黑色主色 (#111827)", () => {
    expect(configContent).toContain("#111827");
  });

  it("包含 ink-soft 软灰 (#4B5563)", () => {
    expect(configContent).toContain("#4B5563");
  });

  it("包含 ink-mute 浅灰 (#9CA3AF)", () => {
    expect(configContent).toContain("#9CA3AF");
  });

  it("包含 paper 纯白背景 (#FFFFFF)", () => {
    expect(configContent).toContain("#FFFFFF");
  });

  it("包含 line 发丝线色 (#F3F4F6)", () => {
    expect(configContent).toContain("#F3F4F6");
  });

  it("包含 flow 浅蓝 (#60A5FA)", () => {
    expect(configContent).toContain("#60A5FA");
  });

  it("包含 flow-deep 深蓝 (#3B82F6)", () => {
    expect(configContent).toContain("#3B82F6");
  });

  it("包含 amber 暖黄 (#FCD34D)", () => {
    expect(configContent).toContain("#FCD34D");
  });

  it("包含 amber-bg 淡黄背景 (#FFFBEB)", () => {
    expect(configContent).toContain("#FFFBEB");
  });

  it("包含 amber-deep 琥珀 (#D97706)", () => {
    expect(configContent).toContain("#D97706");
  });

  it("包含 amber-text 棕色文字 (#92400E)", () => {
    expect(configContent).toContain("#92400E");
  });

  it("不包含旧的 moss 配色", () => {
    expect(configContent).not.toContain("#3f6b57");
  });

  it("不包含旧的 coral 配色", () => {
    expect(configContent).not.toContain("#d95d4f");
  });

  it("不包含旧的 gold 配色", () => {
    expect(configContent).not.toContain("#c9962f");
  });
});
