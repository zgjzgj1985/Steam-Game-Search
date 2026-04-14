"use client";

import { Search, Sword, BarChart3, Layers, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HeroProps {
  className?: string;
}

export function Hero({ className }: HeroProps) {
  return (
    <section className={cn("relative w-full min-w-0 overflow-hidden bg-gradient-to-b from-primary/10 to-background py-20", className)}>
      <div className="container mx-auto w-full min-w-0 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center gap-4 mb-6">
            <Search className="w-8 h-8 text-primary" />
            <Sword className="w-8 h-8 text-primary" />
            <BarChart3 className="w-8 h-8 text-primary" />
            <Layers className="w-8 h-8 text-primary" />
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            回合制战斗分析工具
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8">
            深入分析Steam等平台上的回合制游戏战斗系统
            <br />
            发现创新玩法，评估策略深度，比较数值平衡
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link
              href="/mode2"
              className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors group"
            >
              <span className="font-semibold text-emerald-500">新功能</span> 宝可梦Like筛选器
            </Link>
            <div className="px-4 py-2 bg-background rounded-lg border shadow-sm">
              <span className="font-semibold text-primary">50+</span> 经典游戏
            </div>
            <div className="px-4 py-2 bg-background rounded-lg border shadow-sm">
              <span className="font-semibold text-primary">5</span> 分析维度
            </div>
            <div className="px-4 py-2 bg-background rounded-lg border shadow-sm">
              <span className="font-semibold text-primary">100+</span> 战斗截图
            </div>
          </div>
        </div>
      </div>
      
      <div className="absolute -bottom-1 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}