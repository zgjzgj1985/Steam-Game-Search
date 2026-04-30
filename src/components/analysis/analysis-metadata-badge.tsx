"use client";

import { AnalysisMetadata } from "@/types/game";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertCircle, XCircle, MessageSquare, FileText, Star } from "lucide-react";

interface AnalysisMetadataBadgeProps {
  metadata: AnalysisMetadata;
  className?: string;
}

const CONFIDENCE_CONFIG = {
  high: {
    label: "高置信度",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    icon: CheckCircle,
  },
  medium: {
    label: "中置信度",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    icon: AlertCircle,
  },
  low: {
    label: "低置信度",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/20",
    icon: XCircle,
  },
};

const DATA_QUALITY_CONFIG = {
  excellent: { label: "数据优秀", color: "text-emerald-400" },
  good: { label: "数据良好", color: "text-[#66c0f4]" },
  limited: { label: "数据有限", color: "text-amber-400" },
};

export function AnalysisMetadataBadge({ metadata, className }: AnalysisMetadataBadgeProps) {
  const confConfig = CONFIDENCE_CONFIG[metadata.confidence];
  const ConfIcon = confConfig.icon;
  const qualityConfig = DATA_QUALITY_CONFIG[metadata.dataQuality];

  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-xs", className)}>
      {/* 置信度 */}
      {confConfig && (
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", confConfig.bg, confConfig.border)}>
          <ConfIcon className={cn("w-3 h-3", confConfig.color)} />
          <span className={confConfig.color}>{confConfig.label}</span>
        </div>
      )}

      {/* 评价数量 */}
      {metadata.basedOnReviews > 0 && (
        <div className="flex items-center gap-1.5 text-white/40">
          <MessageSquare className="w-3 h-3" />
          <span>基于 {metadata.basedOnReviews.toLocaleString()} 条评价</span>
        </div>
      )}

      {/* 字数统计 */}
      {metadata.wordCount > 0 && (
        <div className="flex items-center gap-1.5 text-white/40">
          <FileText className="w-3 h-3" />
          <span>{metadata.wordCount} 字</span>
        </div>
      )}

      {/* 数据质量 */}
      {qualityConfig && (
        <div className={cn("flex items-center gap-1.5", qualityConfig.color)}>
          <Star className="w-3 h-3" />
          <span>{qualityConfig.label}</span>
        </div>
      )}
    </div>
  );
}

interface SourceOfTruthBadgeProps {
  sources: string[];
  className?: string;
}

export function SourceOfTruthBadge({ sources, className }: SourceOfTruthBadgeProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs text-white/30">来源：</span>
      {sources.slice(0, 3).map((source, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs border border-white/10"
        >
          {source}
        </span>
      ))}
    </div>
  );
}

interface KeyInsightsBadgeProps {
  insights: string[];
  className?: string;
}

export function KeyInsightsBadge({ insights, className }: KeyInsightsBadgeProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {insights.slice(0, 5).map((insight, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-300 text-xs"
        >
          {insight}
        </span>
      ))}
    </div>
  );
}
