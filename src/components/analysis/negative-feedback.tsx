"use client";

import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { NegativeFeedbackResult } from "@/types/game";
import { cn } from "@/lib/utils";

interface NegativeFeedbackViewProps {
  negativeFeedback: NegativeFeedbackResult;
  pool: "A" | "B" | "C" | null;
  className?: string;
}

/**
 * 差评分析展示
 * 极简警示风格
 */
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
        <div className="p-6 rounded-2xl bg-white/[0.03] text-center">
          <p className="text-sm text-white/40">暂无明显差评问题</p>
        </div>
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

      {/* C池特别提示 */}
      {pool === "C" && (
        <div className="p-4 rounded-2xl bg-rose-500/5 mb-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-200/70">
              这是一款宝可梦Like但评价中等的游戏。分析玩家抱怨点，帮你避开同类设计陷阱。
            </p>
          </div>
        </div>
      )}

      {/* 差评概述 */}
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        {negativeFeedback.summary}
      </p>

      {/* 主要抱怨点 */}
      {negativeFeedback.topComplaints.length > 0 && (
        <div className="mb-5">
          <span className="text-xs text-white/30 mb-3 block">玩家主要抱怨</span>
          <ul className="space-y-2">
            {negativeFeedback.topComplaints.map((complaint, index) => (
              <li key={index} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]">
                <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 text-xs flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <span className="text-sm text-white/70">{complaint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 设计缺陷警示 */}
      {negativeFeedback.designPitfalls.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="text-sm text-rose-300">设计缺陷警示</span>
          </div>
          <ul className="space-y-2">
            {negativeFeedback.designPitfalls.map((pitfall, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-rose-200/70">
                <span className="text-rose-400 mt-1">•</span>
                {pitfall}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}