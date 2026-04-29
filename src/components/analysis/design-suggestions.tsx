"use client";

import { Lightbulb, Shield, Gauge, CheckCircle2, XCircle, ChevronDown, Clock, Zap } from "lucide-react";
import { DesignSuggestionsResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { RichText } from "@/components/ui/rich-text";
import { ContentBlock } from "@/components/ui/expandable-section";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface DesignSuggestionsViewProps {
  designSuggestions: DesignSuggestionsResult;
  className?: string;
}

interface CollapsibleItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}

function CollapsibleItem({ icon: Icon, label, value, color }: CollapsibleItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isLongText = value && value.length > 80;

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
        <span className="flex-1 text-left text-sm font-medium text-white/80">{label}</span>
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

export function DesignSuggestionsView({ designSuggestions, className }: DesignSuggestionsViewProps) {
  const hasStrengths = designSuggestions.strengthsToLearn.length > 0;
  const hasPitfalls = designSuggestions.pitfallsToAvoid.length > 0;

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">设计建议</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-emerald-400/40 to-transparent ml-2" />
      </div>

      {/* 元数据 */}
      {designSuggestions.metadata && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AnalysisMetadataBadge metadata={designSuggestions.metadata} />
          {designSuggestions.metadata.sourceOfTruth.length > 0 && (
            <div className="mt-2">
              <SourceOfTruthBadge sources={designSuggestions.metadata.sourceOfTruth} />
            </div>
          )}
          {designSuggestions.metadata.keyInsights.length > 0 && (
            <div className="mt-2">
              <KeyInsightsBadge insights={designSuggestions.metadata.keyInsights} />
            </div>
          )}
        </div>
      )}

      {/* 优点 & 坑 - 双列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* 值得学习的优点 */}
        {hasStrengths && (
          <ContentBlock variant="success" padding="relaxed">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">值得学习</span>
              <span className="ml-auto text-xs text-emerald-400/60">{designSuggestions.strengthsToLearn.length} 项</span>
            </div>
            <div className="space-y-5">
              {designSuggestions.strengthsToLearn.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <RichText text={item} />
                  </div>
                </div>
              ))}
            </div>
          </ContentBlock>
        )}

        {/* 需要避开的坑 */}
        {hasPitfalls && (
          <ContentBlock variant="warning" padding="relaxed">
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-sm text-rose-300 font-medium">避坑提示</span>
              <span className="ml-auto text-xs text-rose-400/60">{designSuggestions.pitfallsToAvoid.length} 项</span>
            </div>
            <div className="space-y-5">
              {designSuggestions.pitfallsToAvoid.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 text-xs font-medium flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <RichText text={item} />
                  </div>
                </div>
              ))}
            </div>
          </ContentBlock>
        )}
      </div>

      {/* 难度 & 肝度 - 改为可折叠卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <CollapsibleItem
          icon={Gauge}
          label="难度"
          value={designSuggestions.difficultyBalance}
          color="bg-cyan-400"
        />
        <CollapsibleItem
          icon={Zap}
          label="肝度"
          value={designSuggestions.grindAnalysis}
          color="bg-amber-400"
        />
      </div>

      {/* 综合建议 */}
      <ContentBlock variant="highlight" padding="relaxed">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-[#66c0f4]" />
          <span className="text-xs text-[#66c0f4]/70 uppercase tracking-wider">综合建议</span>
        </div>
        <RichText text={designSuggestions.recommendation} />
      </ContentBlock>
    </div>
  );
}
