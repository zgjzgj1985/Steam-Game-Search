"use client";

import { Star, TrendingUp } from "lucide-react";
import { DifferentiationResult } from "@/types/game";

interface DifferentiationViewProps {
  differentiation: DifferentiationResult;
  className?: string;
}

/**
 * 差异化创新展示
 * 极简风格
 */
export function DifferentiationView({ differentiation, className }: DifferentiationViewProps) {
  return (
    <div className={className}>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Star className="w-4 h-4 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">差异化创新</h3>
      </div>

      {/* 核心标签 */}
      <div className="p-4 rounded-2xl bg-amber-500/5 mb-5">
        <span className="text-xs text-amber-400/60">核心定位</span>
        <p className="text-base font-semibold text-white mt-1">{differentiation.coreTag}</p>
      </div>

      {/* 描述 */}
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        {differentiation.innovationDescription}
      </p>

      {/* 融合玩法 */}
      {differentiation.combinedMechanics.length > 0 && (
        <div className="mb-5">
          <span className="text-xs text-white/30 mb-3 block">融合玩法</span>
          <div className="flex flex-wrap gap-2">
            {differentiation.combinedMechanics.map((mech, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-violet-400/10 text-violet-300 text-xs">
                {mech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 成功原因 & 市场定位 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-white/30">成功原因</span>
          </div>
          <p className="text-sm text-white/60">{differentiation.whySuccessful}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-[#66c0f4]" />
            <span className="text-xs text-white/30">市场定位</span>
          </div>
          <p className="text-sm text-white/60">{differentiation.marketPosition}</p>
        </div>
      </div>
    </div>
  );
}