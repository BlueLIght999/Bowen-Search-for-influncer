import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "博闻 MVP",
  description: "本地选题闭环演示"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
