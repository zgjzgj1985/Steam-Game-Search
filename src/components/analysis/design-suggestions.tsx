"use client";

import { Lightbulb, Shield, Gauge, CheckCircle2, XCircle } from "lucide-react";
import { DesignSuggestionsResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { cn } from "@/lib/utils";

interface DesignSuggestionsViewProps {
  designSuggestions: DesignSuggestionsResult;
  className?: string;
}

/**
 * 设计建议展示
 * 极简风格
 */
export function DesignSuggestionsView({ designSuggestions, className }: DesignSuggestionsViewProps) {
  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">设计建议</h3>
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

      {/* 优点 & 坑 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* 值得学习的优点 */}
        {designSuggestions.strengthsToLearn.length > 0 && (
          <div className="p-4 rounded-2xl bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300">值得学习</span>
            </div>
            <ul className="space-y-2">
              {designSuggestions.strengthsToLearn.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-emerald-200/70">
                  <span className="text-emerald-400 shrink-0">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 需要避开的坑 */}
        {designSuggestions.pitfallsToAvoid.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-500/5">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-sm text-rose-300">避坑提示</span>
            </div>
            <ul className="space-y-2">
              {designSuggestions.pitfallsToAvoid.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-rose-200/70">
                  <span className="text-rose-500 shrink-0">−</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 难度 & 肝度 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 rounded-2xl bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-xs text-white/30">难度</span>
          </div>
          <p className="text-sm text-white/60">{designSuggestions.difficultyBalance}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-white/30">肝度</span>
          </div>
          <p className="text-sm text-white/60">{designSuggestions.grindAnalysis}</p>
        </div>
      </div>

      {/* 综合建议 */}
      <div className="p-4 rounded-2xl bg-[#66c0f4]/5">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-[#66c0f4]" />
          <span className="text-xs text-[#66c0f4]/70">综合建议</span>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">
          {designSuggestions.recommendation}
        </p>
      </div>
    </div>
  );
}