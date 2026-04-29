"use client";

import { Sword, Zap, Target, Clock, Sparkles, ChevronDown } from "lucide-react";
import { BattleSystemResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { RichText } from "@/components/ui/rich-text";
import { ContentBlock } from "@/components/ui/expandable-section";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface BattleSystemViewProps {
  battleSystem: BattleSystemResult;
  className?: string;
}

interface BattleItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}

function BattleItem({ icon: Icon, label, value, color }: BattleItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isLongText = value && value.length > 80;

  if (!isLongText) {
    return (
      <ContentBlock variant="default" padding="normal">
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color, "/10")}>
            <Icon className={cn("w-4 h-4", color.replace("bg-", "text-"))} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
            <p className="text-sm font-medium text-white/80 truncate">{value}</p>
          </div>
        </div>
      </ContentBlock>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color, "/10")}>
          <Icon className={cn("w-4 h-4", color.replace("bg-", "text-"))} />
        </div>
        <div className="flex-1 text-left">
          <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-4">
          <RichText text={value} />
        </div>
      </div>
    </div>
  );
}

export function BattleSystemView({ battleSystem, className }: BattleSystemViewProps) {
  const items = [
    { icon: Clock, label: "回合机制", value: battleSystem.turnMechanism || "—", color: "bg-cyan-400" },
    { icon: Target, label: "属性克制", value: battleSystem.typeAdvantages || "—", color: "bg-amber-400" },
    { icon: Zap, label: "技能设计", value: battleSystem.moveSystem || "—", color: "bg-emerald-400" },
    { icon: Clock, label: "战斗节奏", value: battleSystem.battlePace || "—", color: "bg-rose-400" },
  ];

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Sword className="w-4 h-4 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">战斗系统</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-purple-400/40 to-transparent ml-2" />
      </div>

      {/* 元数据 */}
      {battleSystem.metadata && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AnalysisMetadataBadge metadata={battleSystem.metadata} />
          {battleSystem.metadata.sourceOfTruth.length > 0 && (
            <div className="mt-2">
              <SourceOfTruthBadge sources={battleSystem.metadata.sourceOfTruth} />
            </div>
          )}
          {battleSystem.metadata.keyInsights.length > 0 && (
            <div className="mt-2">
              <KeyInsightsBadge insights={battleSystem.metadata.keyInsights} />
            </div>
          )}
        </div>
      )}

      {/* 数据网格 - 改为可折叠的展开区块 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {items.map((item, i) => (
          <BattleItem key={i} {...item} />
        ))}
      </div>

      {/* 独特机制 */}
      {battleSystem.uniqueMechanics.length > 0 && (
        <ContentBlock variant="default" padding="relaxed">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider">独特机制</span>
          </div>
          <div className="space-y-4">
            {battleSystem.uniqueMechanics.map((mech, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <RichText text={mech} />
                </div>
              </div>
            ))}
          </div>
        </ContentBlock>
      )}
    </div>
  );
}
