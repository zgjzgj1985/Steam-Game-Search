import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

/** 不使用 next/font/google，避免部分地区无法访问 Google 字体导致 dev/build 下静态资源 500 */

export const metadata: Metadata = {
  title: "回合制战斗分析 | Turn-Based Battle Analyzer",
  description: "深入分析回合制游戏的战斗系统，发现创新玩法",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen min-w-0 w-full bg-background text-foreground font-sans antialiased"
        )}
      >
        {children}
      </body>
    </html>
  );
}