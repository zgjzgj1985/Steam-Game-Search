"use client";

import { Sword, Zap, Target, Clock } from "lucide-react";
import { BattleSystemResult } from "@/types/game";
import { cn } from "@/lib/utils";

interface BattleSystemViewProps {
  battleSystem: BattleSystemResult;
  className?: string;
}

/**
 * 战斗系统分析展示
 * 极简风格
 */
export function BattleSystemView({ battleSystem, className }: BattleSystemViewProps) {
  const items = [
    { icon: Clock, label: "回合机制", value: battleSystem.turnMechanism, color: "bg-cyan-400" },
    { icon: Target, label: "属性克制", value: battleSystem.typeAdvantages, color: "bg-amber-400" },
    { icon: Zap, label: "技能设计", value: battleSystem.moveSystem, color: "bg-emerald-400" },
    { icon: Clock, label: "战斗节奏", value: battleSystem.battlePace, color: "bg-rose-400" },
  ];

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Sword className="w-4 h-4 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">战斗系统</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-purple-400/40 to-transparent ml-2" />
      </div>

      {/* 数据网格 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="p-4 rounded-2xl bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("w-2 h-2 rounded-full", item.color)} />
                <span className="text-xs text-white/40">{item.label}</span>
              </div>
              <p className="text-sm text-white/70">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* 独特机制 */}
      {battleSystem.uniqueMechanics.length > 0 && (
        <div className="p-4 rounded-2xl bg-white/[0.03]">
          <span className="text-xs text-white/30 mb-3 block">独特机制</span>
          <div className="flex flex-wrap gap-2">
            {battleSystem.uniqueMechanics.map((mech, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-purple-400/10 text-purple-300 text-xs">
                {mech}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}