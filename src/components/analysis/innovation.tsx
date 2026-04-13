import { Sparkles, TrendingUp, Lightbulb, Star, Zap } from "lucide-react";
import { BattleAnalysis } from "@/types/game";
import { cn } from "@/lib/utils";

type InnovationElement = BattleAnalysis["innovationElements"][number];

interface InnovationViewProps {
  innovations: BattleAnalysis["innovationElements"];
  compact?: boolean;
  className?: string;
}

const CATEGORY_ICONS = {
  Mechanic: Lightbulb,
  Visual: Star,
  System: TrendingUp,
  Narrative: Sparkles,
};

const CATEGORY_LABELS = {
  Mechanic: "机制创新",
  Visual: "视觉创新",
  System: "系统创新",
  Narrative: "叙事创新",
};

const CATEGORY_COLORS = {
  Mechanic: { bg: "from-orange-500/20 to-orange-500/5", border: "border-orange-500/30", icon: "text-orange-400" },
  Visual: { bg: "from-purple-500/20 to-purple-500/5", border: "border-purple-500/30", icon: "text-purple-400" },
  System: { bg: "from-blue-500/20 to-blue-500/5", border: "border-blue-500/30", icon: "text-blue-400" },
  Narrative: { bg: "from-green-500/20 to-green-500/5", border: "border-green-500/30", icon: "text-green-400" },
};

const IMPACT_CONFIG = {
  High: { label: "高影响", bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  Medium: { label: "中影响", bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  Low: { label: "低影响", bg: "bg-gray-500/20", text: "text-gray-400", border: "border-gray-500/30" },
};

/**
 * 创新亮点展示组件
 * 支持紧凑模式 (compact) 和完整模式
 */
export function InnovationView({ innovations, compact = false, className }: InnovationViewProps) {
  if (innovations.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center py-12 rounded-xl bg-[#1b2838]/30 border border-[#2a475e]/30",
        className
      )}>
        <div className="text-center">
          <Zap className="w-10 h-10 text-[#2a475e] mx-auto mb-3" />
          <p className="text-white/40">暂无创新要素记录</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("grid md:grid-cols-3 gap-4", className)}>
        {innovations.map((innovation, index) => {
          const Icon = CATEGORY_ICONS[innovation.category];
          const categoryConfig = CATEGORY_COLORS[innovation.category];
          const impactConfig = IMPACT_CONFIG[innovation.impact];

          return (
            <div
              key={index}
              className={cn(
                "relative rounded-xl p-5 bg-gradient-to-br border transition-all duration-200",
                "hover:scale-[1.02] cursor-default group",
                categoryConfig.bg,
                categoryConfig.border
              )}
            >
              {/* 顶部图标 */}
              <div className="flex items-start justify-between mb-4">
                <div className={cn("p-2.5 rounded-lg bg-white/5", categoryConfig.icon)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  "px-2 py-1 text-xs font-medium rounded-full border",
                  impactConfig.bg,
                  impactConfig.text,
                  impactConfig.border
                )}>
                  {impactConfig.label}
                </span>
              </div>

              {/* 标题 */}
              <h4 className="font-semibold text-white mb-2 group-hover:text-[#66c0f4] transition-colors">
                {innovation.name}
              </h4>

              {/* 描述 */}
              <p className="text-sm text-white/60 line-clamp-2">
                {innovation.detail || innovation.description}
              </p>

              {/* 底部标签 */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
                <span className="px-2 py-0.5 text-xs bg-white/10 rounded text-white/50">
                  {CATEGORY_LABELS[innovation.category]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 完整模式
  return (
    <div className={cn("space-y-4", className)}>
      {innovations.map((innovation, index) => {
        const Icon = CATEGORY_ICONS[innovation.category];
        const categoryConfig = CATEGORY_COLORS[innovation.category];
        const impactConfig = IMPACT_CONFIG[innovation.impact];

        return (
          <div
            key={index}
            className={cn(
              "relative rounded-xl overflow-hidden border transition-all duration-200",
              "hover:border-[#66c0f4]/30",
              categoryConfig.bg,
              categoryConfig.border
            )}
          >
            <div className="flex">
              {/* 左侧图标区域 */}
              <div className={cn(
                "w-20 md:w-28 flex-shrink-0 flex flex-col items-center justify-center gap-2 p-4",
                "bg-gradient-to-b from-white/5 to-transparent border-r border-white/10"
              )}>
                <div className={cn("p-3 rounded-xl bg-white/5", categoryConfig.icon)}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-xs text-white/60">{CATEGORY_LABELS[innovation.category]}</span>
              </div>

              {/* 右侧内容 */}
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{innovation.name}</h4>
                    <p className="text-sm text-white/50 mt-1">创新要素 #{index + 1}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border shrink-0",
                    impactConfig.bg,
                    impactConfig.text,
                    impactConfig.border
                  )}>
                    {impactConfig.label}
                  </span>
                </div>

                <p className="text-white/80 leading-relaxed">
                  {innovation.detail || innovation.description}
                </p>

                {/* 辅助信息 */}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-white/10">
                  <span className="px-2 py-1 text-xs bg-white/10 rounded text-white/60">
                    类别: {CATEGORY_LABELS[innovation.category]}
                  </span>
                  <span className={cn("px-2 py-1 text-xs rounded", impactConfig.bg, impactConfig.text)}>
                    影响度: {impactConfig.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
