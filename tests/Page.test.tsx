import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "../app/page";

describe("Bowen upload workspace", () => {
  it("starts with video upload and removes the selectable trend-video workspace", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading");
    expect(headings[1]).toHaveTextContent("上传视频开始分析");
    expect(screen.getByRole("heading", { name: "视频文稿理解" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "视频画面/分镜理解" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "爆点拆解与改造建议" })).toBeInTheDocument();
    expect(screen.queryByText(/热榜 TOP 10/)).not.toBeInTheDocument();
    expect(screen.queryByText("选中视频")).not.toBeInTheDocument();
    expect(screen.queryByText("趋势预测")).not.toBeInTheDocument();
  });
});
