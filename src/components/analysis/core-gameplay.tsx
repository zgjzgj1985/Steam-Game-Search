"use client";

import { Gamepad2, Sparkles, Puzzle, ListChecks, Clock, Sparkle, ChevronDown } from "lucide-react";
import { CoreGameplayResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { RichText } from "@/components/ui/rich-text";
import { ContentBlock } from "@/components/ui/expandable-section";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface CoreGameplayViewProps {
  coreGameplay: CoreGameplayResult;
  className?: string;
}

interface SystemBlockProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  defaultExpanded?: boolean;
}

function SystemBlock({ icon: Icon, label, value, color, defaultExpanded = false }: SystemBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl bg-white/[0.02] overflow-hidden">
      {/* 标题栏 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color, "/10")}>
          <Icon className={cn("w-4 h-4", color.replace("bg-", "text-"))} />
        </div>
        <span className="flex-1 text-left text-sm font-medium text-white/80">{label}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-white/40 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* 内容区 */}
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

export function CoreGameplayView({ coreGameplay, className }: CoreGameplayViewProps) {
  const systems = [
    { icon: Sparkles, label: "生物收集", value: coreGameplay.creatureCollection ? coreGameplay.creatureCount : "—", color: "bg-emerald-400" },
    { icon: Puzzle, label: "获得方式", value: coreGameplay.captureSystem || "—", color: "bg-amber-400" },
    { icon: Sparkle, label: "进化系统", value: coreGameplay.evolutionSystem || "—", color: "bg-violet-400" },
    { icon: ListChecks, label: "队伍构建", value: coreGameplay.teamBuilding || "—", color: "bg-cyan-400" },
  ];

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Gamepad2 className="w-4 h-4 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">核心玩法</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/40 to-transparent ml-2" />
      </div>

      {/* 元数据 */}
      {coreGameplay.metadata && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AnalysisMetadataBadge metadata={coreGameplay.metadata} />
          {coreGameplay.metadata.sourceOfTruth.length > 0 && (
            <div className="mt-2">
              <SourceOfTruthBadge sources={coreGameplay.metadata.sourceOfTruth} />
            </div>
          )}
          {coreGameplay.metadata.keyInsights.length > 0 && (
            <div className="mt-2">
              <KeyInsightsBadge insights={coreGameplay.metadata.keyInsights} />
            </div>
          )}
        </div>
      )}

      {/* 整体描述 - 使用智能段落渲染 */}
      {coreGameplay.description && (
        <ContentBlock variant="highlight" padding="relaxed" className="mb-5">
          <RichText text={coreGameplay.description} />
        </ContentBlock>
      )}

      {/* 系统网格 - 改为可折叠的展开区块 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {systems.map((sys, i) => (
          <SystemBlock key={i} {...sys} />
        ))}
      </div>

      {/* 玩家体验 */}
      <ContentBlock variant="default" padding="relaxed">
        <div className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-white/30 shrink-0 mt-1" />
          <div className="flex-1">
            <span className="text-xs text-white/40 uppercase tracking-wider">玩家体验</span>
            <div className="mt-3">
              <RichText text={coreGameplay.playerExperience} />
            </div>
          </div>
        </div>
      </ContentBlock>
    </div>
  );
}
