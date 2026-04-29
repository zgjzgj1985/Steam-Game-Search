"use client";

import { Star, TrendingUp, Target, ChevronDown } from "lucide-react";
import { DifferentiationResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { RichText } from "@/components/ui/rich-text";
import { ContentBlock } from "@/components/ui/expandable-section";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface DifferentiationViewProps {
  differentiation: DifferentiationResult;
  className?: string;
}

interface CollapsibleItemProps {
  title: string;
  content: string;
  color: string;
}

function CollapsibleItem({ title, content, color }: CollapsibleItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className={cn("w-2 h-2 rounded-full shrink-0", color)} />
        <span className="flex-1 text-left text-sm font-medium text-white/80">{title}</span>
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
          <RichText text={content} />
        </div>
      </div>
    </div>
  );
}

export function DifferentiationView({ differentiation, className }: DifferentiationViewProps) {
  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Star className="w-4 h-4 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">差异化创新</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-400/40 to-transparent ml-2" />
      </div>

      {/* 元数据 */}
      {differentiation.metadata && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AnalysisMetadataBadge metadata={differentiation.metadata} />
          {differentiation.metadata.sourceOfTruth.length > 0 && (
            <div className="mt-2">
              <SourceOfTruthBadge sources={differentiation.metadata.sourceOfTruth} />
            </div>
          )}
          {differentiation.metadata.keyInsights.length > 0 && (
            <div className="mt-2">
              <KeyInsightsBadge insights={differentiation.metadata.keyInsights} />
            </div>
          )}
        </div>
      )}

      {/* 核心标签 */}
      <ContentBlock variant="highlight" padding="relaxed" className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-amber-400/60 uppercase tracking-wider">核心定位</span>
        </div>
        <p className="text-base font-semibold text-white">{differentiation.coreTag}</p>
      </ContentBlock>

      {/* 描述 - 使用智能段落渲染 */}
      {differentiation.innovationDescription && (
        <ContentBlock variant="default" padding="relaxed" className="mb-5">
          <RichText text={differentiation.innovationDescription} />
        </ContentBlock>
      )}

      {/* 融合玩法 - 可折叠卡片 */}
      {differentiation.combinedMechanics.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider">融合玩法</span>
          </div>
          <div className="space-y-3">
            {differentiation.combinedMechanics.map((mech, i) => (
              <CollapsibleItem
                key={i}
                title={mech.substring(0, 30) + "..."}
                content={mech}
                color="bg-violet-400"
              />
            ))}
          </div>
        </div>
      )}

      {/* 成功原因 & 市场定位 - 双列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ContentBlock variant="default" padding="normal">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider">成功原因</span>
          </div>
          <RichText text={differentiation.whySuccessful} />
        </ContentBlock>
        <ContentBlock variant="default" padding="normal">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-[#66c0f4]" />
            <span className="text-xs text-white/40 uppercase tracking-wider">市场定位</span>
          </div>
          <RichText text={differentiation.marketPosition} />
        </ContentBlock>
      </div>
    </div>
  );
}
