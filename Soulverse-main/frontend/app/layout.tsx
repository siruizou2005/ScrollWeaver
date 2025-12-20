import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soulverse - 平行时空社交沙盒",
  description: "基于多 Agent 模拟的平行时空社交沙盒",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

