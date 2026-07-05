import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginCard } from "../app/components/LoginCard";

/**
 * LoginCard 组件测试（TDD-Red）
 *
 * 验证「静水·精修」方案的左下角登录态卡片：
 * - 渲染头像（圆形 + 琥珀描边环）
 * - 渲染账号名
 * - 渲染 UID
 * - 渲染引擎状态文字
 * - 在线状态点存在
 * - 卡片使用淡黄背景
 */

describe("LoginCard", () => {
  it("渲染账号名", () => {
    render(<LoginCard name="观点观察者" uid="10248573" />);
    expect(screen.getByText("观点观察者")).toBeInTheDocument();
  });

  it("渲染 UID", () => {
    render(<LoginCard name="观点观察者" uid="10248573" />);
    expect(screen.getByText(/UID\s+10248573/)).toBeInTheDocument();
  });

  it("渲染引擎状态文字", () => {
    render(<LoginCard name="观点观察者" uid="10248573" engineStatus="online" />);
    expect(screen.getByText(/P0 ENGINE/)).toBeInTheDocument();
  });

  it("online 状态显示 ONLINE", () => {
    render(<LoginCard name="观点观察者" uid="10248573" engineStatus="online" />);
    expect(screen.getByText(/ONLINE/)).toBeInTheDocument();
  });

  it("offline 状态显示 OFFLINE", () => {
    render(<LoginCard name="观点观察者" uid="10248573" engineStatus="offline" />);
    expect(screen.getByText(/OFFLINE/)).toBeInTheDocument();
  });

  it("fallback 状态显示 FALLBACK", () => {
    render(<LoginCard name="观点观察者" uid="10248573" engineStatus="fallback" />);
    expect(screen.getByText(/FALLBACK/)).toBeInTheDocument();
  });

  it("渲染头像区域（aria-label）", () => {
    render(<LoginCard name="观点观察者" uid="10248573" />);
    expect(screen.getByRole("img", { name: "头像" })).toBeInTheDocument();
  });

  it("渲染在线状态点（aria-label）", () => {
    render(<LoginCard name="观点观察者" uid="10248573" engineStatus="online" />);
    expect(screen.getByLabelText("引擎在线状态")).toBeInTheDocument();
  });

  it("卡片根元素包含淡黄背景类名", () => {
    const { container } = render(<LoginCard name="观点观察者" uid="10248573" />);
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-amber-bg");
  });

  it("卡片根元素包含圆角类名", () => {
    const { container } = render(<LoginCard name="观点观察者" uid="10248573" />);
    const card = container.firstElementChild;
    expect(card?.className).toContain("rounded");
  });
});
