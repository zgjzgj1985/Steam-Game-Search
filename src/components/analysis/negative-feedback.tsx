"use client";

import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { NegativeFeedbackResult } from "@/types/game";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { RichText } from "@/components/ui/rich-text";
import { ContentBlock } from "@/components/ui/expandable-section";
import { cn } from "@/lib/utils";

interface NegativeFeedbackViewProps {
  negativeFeedback: NegativeFeedbackResult;
  pool: "A" | "B" | "C" | null;
  className?: string;
}

export function NegativeFeedbackView({
  negativeFeedback,
  pool,
  className
}: NegativeFeedbackViewProps) {
  const hasContent = negativeFeedback.topComplaints.length > 0 ||
    negativeFeedback.complaintKeywords.length > 0 ||
    negativeFeedback.designPitfalls.length > 0;

  if (!hasContent) {
    return (
      <div className={className}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">差评分析</h3>
        </div>
        <ContentBlock variant="success" padding="relaxed">
          <div className="text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-white/60">暂无明显差评问题</p>
            <p className="text-xs text-white/40 mt-1">该游戏整体评价良好</p>
          </div>
        </ContentBlock>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center",
          pool === "C" ? "bg-rose-500/10" : "bg-amber-500/10"
        )}>
          <AlertTriangle className={cn("w-4 h-4", pool === "C" ? "text-rose-400" : "text-amber-400")} />
        </div>
        <h3 className="text-lg font-semibold text-white">差评分析</h3>
        {pool === "C" && (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-rose-500/20 text-rose-300 rounded-full">
            重点参考
          </span>
        )}
      </div>

      {/* 元数据 */}
      {negativeFeedback.metadata && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AnalysisMetadataBadge metadata={negativeFeedback.metadata} />
          {negativeFeedback.metadata.sourceOfTruth.length > 0 && (
            <div className="mt-2">
              <SourceOfTruthBadge sources={negativeFeedback.metadata.sourceOfTruth} />
            </div>
          )}
          {negativeFeedback.metadata.keyInsights.length > 0 && (
            <div className="mt-2">
              <KeyInsightsBadge insights={negativeFeedback.metadata.keyInsights} />
            </div>
          )}
        </div>
      )}

      {/* C池特别提示 */}
      {pool === "C" && (
        <ContentBlock variant="warning" className="mb-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-rose-400 font-medium mb-1">避坑指南</p>
              <p className="text-sm text-rose-200/70">
                这是一款宝可梦Like但评价中等的游戏。分析玩家抱怨点，帮你避开同类设计陷阱。
              </p>
            </div>
          </div>
        </ContentBlock>
      )}

      {/* 差评概述 - 使用智能段落渲染 */}
      {negativeFeedback.summary && (
        <ContentBlock variant="default" className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-white/40" />
            <span className="text-xs text-white/40 uppercase tracking-wider">差评概述</span>
          </div>
          <RichText text={negativeFeedback.summary} />
        </ContentBlock>
      )}

      {/* 主要抱怨点 - 改为编号列表，更清晰 */}
      {negativeFeedback.topComplaints.length > 0 && (
        <ContentBlock variant="default" className="mb-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="text-xs text-white/40 uppercase tracking-wider">玩家主要抱怨</span>
            <span className="ml-auto text-xs text-rose-400/60">共 {negativeFeedback.topComplaints.length} 项</span>
          </div>
          <div className="space-y-6">
            {negativeFeedback.topComplaints.map((complaint, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]">
                <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-400 text-xs font-medium flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <RichText text={complaint} />
                </div>
              </div>
            ))}
          </div>
        </ContentBlock>
      )}

      {/* 设计缺陷警示 */}
      {negativeFeedback.designPitfalls.length > 0 && (
        <ContentBlock variant="warning" padding="normal">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="text-sm text-rose-300 font-medium">设计缺陷警示</span>
            <span className="ml-auto text-xs text-rose-400/60">共 {negativeFeedback.designPitfalls.length} 项</span>
          </div>
          <div className="space-y-6">
            {negativeFeedback.designPitfalls.map((pitfall, index) => (
              <div key={index} className="flex items-start gap-3 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-2" />
                <div className="flex-1">
                  <RichText text={pitfall} />
                </div>
              </div>
            ))}
          </div>
        </ContentBlock>
      )}
    </div>
  );
}
