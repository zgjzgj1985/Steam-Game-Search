"use client";

import { Gamepad2, Sparkles, Puzzle, ListChecks, Clock } from "lucide-react";
import { CoreGameplayResult } from "@/types/game";
import { cn } from "@/lib/utils";

interface CoreGameplayViewProps {
  coreGameplay: CoreGameplayResult;
  className?: string;
}

/**
 * 核心玩法分析展示
 * 极简高级风格
 */
export function CoreGameplayView({ coreGameplay, className }: CoreGameplayViewProps) {
  const systems = [
    { icon: Sparkles, label: "生物收集", value: coreGameplay.creatureCount, has: coreGameplay.creatureCollection, color: "text-emerald-400", bg: "bg-emerald-400" },
    { icon: Puzzle, label: "获得方式", value: coreGameplay.captureSystem, color: "text-amber-400", bg: "bg-amber-400" },
    { icon: Sparkles, label: "进化系统", value: coreGameplay.evolutionSystem, color: "text-violet-400", bg: "bg-violet-400" },
    { icon: ListChecks, label: "队伍构建", value: coreGameplay.teamBuilding, color: "text-cyan-400", bg: "bg-cyan-400" },
  ];

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Gamepad2 className="w-4 h-4 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">核心玩法</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/40 to-transparent ml-2" />
      </div>

      {/* 整体描述 */}
      <p className="text-sm text-white/60 leading-relaxed mb-6">
        {coreGameplay.description}
      </p>

      {/* 系统网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {systems.map((sys, i) => {
          const Icon = sys.icon;
          return (
            <div key={i} className="p-4 rounded-2xl bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("w-2 h-2 rounded-full", sys.bg)} />
                <span className="text-xs text-white/40">{sys.label}</span>
              </div>
              <p className="text-sm text-white/80">{sys.value || "—"}</p>
            </div>
          );
        })}
      </div>

      {/* 玩家体验 */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03]">
        <Clock className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
        <div>
          <span className="text-xs text-white/30">玩家体验</span>
          <p className="text-sm text-white/60 mt-1">{coreGameplay.playerExperience}</p>
        </div>
      </div>
    </div>
  );
}