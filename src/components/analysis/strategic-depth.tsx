import {
  Target,
  Link,
  Puzzle,
  RefreshCw,
  Grid3X3,
  ArrowUp,
  Mountain,
  Layers,
} from "lucide-react";
import {
  StrategicDepth,
  SynergyType,
} from "@/types/game";
import { cn } from "@/lib/utils";

interface StrategicDepthViewProps {
  depth: StrategicDepth;
  detailed?: boolean;
  /** LLM 策略与深度解读 */
  strategyInsight?: string;
  className?: string;
}

const SYNERGY_LABELS: Record<SynergyType, string> = {
  Element: "元素共鸣",
  Class: "职业配合",
  Position: "站位协同",
  Timing: "时机配合",
  Equipment: "装备联动",
  Status: "状态联动",
};

const DIFFICULTY_COLORS = {
  Easy: "bg-green-500/20 text-green-400 border-green-500/30",
  Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Hard: "bg-red-500/20 text-red-400 border-red-500/30",
};

const POWER_COLORS = {
  Low: "bg-gray-400",
  Medium: "bg-yellow-400",
  High: "bg-green-500",
};

/**
 * 策略深度展示组件
 */
export function StrategicDepthView({ depth, detailed, strategyInsight, className }: StrategicDepthViewProps) {
  if (!depth) {
    return (
      <div className={cn(
        "rounded-xl bg-[#1b2838]/50 border border-[#2a475e]/30 overflow-hidden",
        className
      )}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a475e]/30 bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="p-2.5 rounded-lg bg-purple-500/20">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">策略深度分析</h3>
            <p className="text-xs text-white/50">Strategic Depth Analysis</p>
          </div>
        </div>
        <div className="p-8 text-center">
          <Target className="w-12 h-12 text-[#2a475e] mx-auto mb-3" />
          <p className="text-white/40">暂无结构化策略数据</p>
          {strategyInsight?.trim() && (
            <p className="mt-4 text-left text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
              {strategyInsight.trim()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl bg-[#1b2838]/50 border border-[#2a475e]/30 overflow-hidden", className)}>
      {/* 头部 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a475e]/30 bg-gradient-to-r from-purple-500/10 to-transparent">
        <div className="p-2.5 rounded-lg bg-purple-500/20">
          <Target className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">策略深度分析</h3>
          <p className="text-xs text-white/50">Strategic Depth Analysis</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {strategyInsight?.trim() && (
          <div className="rounded-lg border border-purple-500/25 bg-purple-500/[0.06] p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-200/80">
              深度解读
            </p>
            <p className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">{strategyInsight.trim()}</p>
          </div>
        )}

        {/* 站位系统 */}
        <div className="rounded-lg bg-gradient-to-r from-blue-500/10 to-transparent p-4 border border-blue-500/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Grid3X3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h4 className="font-medium text-white">站位系统</h4>
              <p className="text-xs text-white/50">
                {depth.positioning.hasPositioning
                  ? depth.positioning.gridSize
                    ? `网格 ${depth.positioning.gridSize.width}x${depth.positioning.gridSize.height}`
                    : "有站位系统"
                  : "无站位限制"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {depth.positioning.facing && (
              <PositionTag icon={<ArrowUp className="w-3 h-3" />} label="朝向系统" />
            )}
            {depth.positioning.height && (
              <PositionTag icon={<Mountain className="w-3 h-3" />} label="高度差" />
            )}
            {depth.positioning.terrain && (
              <PositionTag icon={<Layers className="w-3 h-3" />} label="地形" />
            )}
            {!depth.positioning.hasPositioning && (
              <span className="px-3 py-1.5 text-sm bg-white/5 rounded-lg text-white/60">
                自由站位
              </span>
            )}
          </div>
        </div>

        {/* 协同系统 */}
        {depth.synergies.hasSynergies && depth.synergies.types.length > 0 && (
          <div className="rounded-lg bg-gradient-to-r from-cyan-500/10 to-transparent p-4 border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Link className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">协同系统</h4>
                <p className="text-xs text-white/50">{depth.synergies.types.length} 种配合方式</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {depth.synergies.types.map((type) => (
                <span
                  key={type}
                  className="px-3 py-1.5 text-sm bg-white/5 rounded-lg border border-white/10 text-white/80 hover:border-cyan-500/30 transition-colors"
                >
                  {SYNERGY_LABELS[type] || type}
                </span>
              ))}
            </div>

            {/* 协同示例 - 详细模式 */}
            {detailed && depth.synergies.examples.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-white/10">
                {depth.synergies.examples.map((ex, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", POWER_COLORS[ex.powerLevel])} />
                    <div>
                      <span className="font-medium text-white">{ex.name}</span>
                      <span className="text-white/60 ml-2">{ex.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 反制策略 - 详细模式 */}
        {detailed && depth.counterStrategies.length > 0 && (
          <div className="rounded-lg bg-gradient-to-r from-red-500/10 to-transparent p-4 border border-red-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Puzzle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">反制策略</h4>
                <p className="text-xs text-white/50">{depth.counterStrategies.length} 种反制手段</p>
              </div>
            </div>
            <div className="space-y-2">
              {depth.counterStrategies.slice(0, 5).map((cs, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-white/5">
                  <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded border shrink-0",
                    DIFFICULTY_COLORS[cs.difficulty]
                  )}>
                    {cs.difficulty === "Easy" ? "简单" : cs.difficulty === "Medium" ? "中等" : "困难"}
                  </span>
                  <div>
                    <span className="font-medium text-white text-sm">{cs.name}</span>
                    <p className="text-xs text-white/60 mt-0.5">{cs.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 战术选项 - 详细模式 */}
        {detailed && depth.tacticalOptions.length > 0 && (
          <div className="rounded-lg bg-gradient-to-r from-green-500/10 to-transparent p-4 border border-green-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Target className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">战术选项</h4>
                <p className="text-xs text-white/50">{depth.tacticalOptions.length} 种战术分类</p>
              </div>
            </div>
            <div className="space-y-3">
              {depth.tacticalOptions.map((to, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-white/5">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white mb-1">{to.category}</div>
                    <div className="flex flex-wrap gap-1">
                      {to.options.map((opt) => (
                        <span key={opt} className="px-2 py-0.5 text-xs bg-white/10 rounded text-white/70">
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={cn(
                    "px-2 py-1 text-xs font-bold rounded",
                    to.importanceScore >= 80 && "bg-green-500/20 text-green-400",
                    to.importanceScore >= 50 && to.importanceScore < 80 && "bg-yellow-500/20 text-yellow-400",
                    to.importanceScore < 50 && "bg-gray-500/20 text-gray-400"
                  )}>
                    {to.importanceScore}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 重玩性 */}
        <div className="rounded-lg bg-gradient-to-r from-pink-500/10 to-transparent p-4 border border-pink-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/20">
              <RefreshCw className="w-5 h-5 text-pink-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white">重玩性</h4>
                <span className="text-lg font-bold text-pink-400">{depth.replayabilityScore}%</span>
              </div>
              <div className="h-3 bg-[#2a475e]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-pink-400 rounded-full transition-all duration-500"
                  style={{ width: `${depth.replayabilityScore}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionTag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/5 rounded-lg border border-white/10 text-white/80 hover:border-blue-500/30 transition-colors">
      {icon}
      {label}
    </span>
  );
}
