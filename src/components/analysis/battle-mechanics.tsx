import {
  Sword,
  Clock,
  Target,
  Zap,
  Flame,
  Star,
  Crosshair,
  Sparkles,
} from "lucide-react";
import { BattleMechanics, StatusEffect } from "@/types/game";
import { cn } from "@/lib/utils";

interface BattleMechanicsViewProps {
  mechanics: BattleMechanics;
  detailed?: boolean;
  /** LLM 战斗深度解读（与下方结构化摘要配合） */
  insight?: string;
  /** 伤害/资源逻辑一句话 */
  damageLine?: string;
  className?: string;
}

const TURN_SYSTEMS = {
  ATB: { name: "ATB (主动时间槽)", icon: Clock },
  Traditional: { name: "传统回合制", icon: Sword },
  Side: { name: "站位式回合制", icon: Target },
  RealTime: { name: "即时回合制混合", icon: Zap },
  Hybrid: { name: "混合系统", icon: Star },
  Unknown: { name: "未知", icon: Star },
};

const ACTION_SYSTEMS = {
  Menu: "菜单选择",
  Card: "卡牌系统",
  Timed: "计时指令",
  Position: "站位指令",
  Combo: "连击指令",
  Mixed: "混合系统",
};

const TARGET_LABELS = {
  All: "全体攻击",
  Multi: "多目标选择",
  Row: "行/列攻击",
  Column: "列攻击",
  Single: "单体攻击",
  Custom: "自定义选择",
};

const CRIT_LABELS = {
  Rate: "概率暴击",
  Fixed: "固定暴击",
  Stack: "叠加暴击",
  Skill: "技能暴击",
  None: "无暴击",
};

/**
 * 战斗机制展示组件
 */
export function BattleMechanicsView({
  mechanics,
  detailed,
  insight,
  damageLine,
  className,
}: BattleMechanicsViewProps) {
  const turnSystem = TURN_SYSTEMS[mechanics.turnSystem] || TURN_SYSTEMS.Unknown;
  const TurnIcon = turnSystem.icon;

  return (
    <div className={cn("rounded-xl bg-[#1b2838]/50 border border-[#2a475e]/30 overflow-hidden", className)}>
      {/* 头部 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a475e]/30 bg-gradient-to-r from-orange-500/10 to-transparent">
        <div className="p-2.5 rounded-lg bg-orange-500/20">
          <Sword className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">战斗机制分析</h3>
          <p className="text-xs text-white/50">Battle Mechanics Analysis</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {(Boolean(insight?.trim()) || Boolean(damageLine?.trim())) && (
          <div className="space-y-3 rounded-lg border border-orange-500/25 bg-orange-500/[0.06] p-4">
            {insight?.trim() && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-200/80">
                  深度解读
                </p>
                <p className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">{insight.trim()}</p>
              </div>
            )}
            {damageLine?.trim() && (
              <div className={insight?.trim() ? "border-t border-white/10 pt-3" : ""}>
                <p className="mb-1 text-xs font-medium text-white/50">伤害与资源逻辑</p>
                <p className="text-sm leading-relaxed text-white/80">{damageLine.trim()}</p>
              </div>
            )}
          </div>
        )}

        {/* 核心系统卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 回合系统 */}
          <FeatureCard
            icon={<TurnIcon className="w-5 h-5" />}
            label="回合系统"
            value={turnSystem.name}
            color="orange"
          />

          {/* 行动系统 */}
          <FeatureCard
            icon={<Zap className="w-5 h-5" />}
            label="行动系统"
            value={ACTION_SYSTEMS[mechanics.actionSystem]}
            color="blue"
          />

          {/* 目标系统 */}
          <FeatureCard
            icon={<Crosshair className="w-5 h-5" />}
            label="目标选择"
            value={TARGET_LABELS[mechanics.targetSystem] || "自定义"}
            color="green"
          />

          {/* 暴击系统 */}
          <FeatureCard
            icon={<Star className="w-5 h-5" />}
            label="暴击系统"
            value={CRIT_LABELS[mechanics.critSystem]}
            color="yellow"
          />
        </div>

        {/* 元素系统 */}
        {mechanics.elements.hasElements && (
          <div className="rounded-lg bg-gradient-to-r from-yellow-500/10 to-transparent p-4 border border-yellow-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Flame className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">元素系统</h4>
                <p className="text-xs text-white/50">{mechanics.elements.elements.length} 种元素</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {mechanics.elements.elements.map((el) => (
                <span
                  key={el}
                  className="px-3 py-1.5 text-sm bg-white/5 rounded-lg border border-white/10 text-white/80 hover:border-yellow-500/30 transition-colors"
                >
                  {el}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 状态效果 - 详细模式 */}
        {detailed && mechanics.statusEffects.length > 0 && (
          <div className="rounded-lg bg-gradient-to-r from-purple-500/10 to-transparent p-4 border border-purple-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">状态效果</h4>
                <p className="text-xs text-white/50">{mechanics.statusEffects.length} 种效果</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {mechanics.statusEffects.map((effect, idx) => (
                <EffectBadge key={idx} effect={effect} />
              ))}
            </div>
          </div>
        )}

        {/* 特殊系统标签 */}
        <div className="flex flex-wrap gap-2">
          {mechanics.ultimateSkills && (
            <SpecialTag label="终极技能" color="purple" />
          )}
          {mechanics.comboSystem && (
            <SpecialTag label="连击系统" color="red" />
          )}
          {mechanics.breakGauge && (
            <SpecialTag label="BREAK槽" color="blue" />
          )}
          {mechanics.specialMechanics.map((mech, idx) => (
            <SpecialTag key={idx} label={mech} color="cyan" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "orange" | "blue" | "green" | "yellow";
}

const FEATURE_COLORS = {
  orange: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  blue: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  green: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  yellow: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
};

function FeatureCard({ icon, label, value, color }: FeatureCardProps) {
  const colorConfig = FEATURE_COLORS[color];

  return (
    <div className={cn(
      "rounded-lg p-3 bg-[#1b2838]/30 border border-[#2a475e]/20",
      "hover:border-[#2a475e]/50 transition-colors"
    )}>
      <div className={cn("p-2 rounded-lg bg-white/5 w-fit mb-2", colorConfig.bg)}>
        <span className={colorConfig.text}>{icon}</span>
      </div>
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-sm font-medium text-white truncate">{value}</p>
    </div>
  );
}

interface SpecialTagProps {
  label: string;
  color: "purple" | "red" | "blue" | "cyan";
}

const TAG_COLORS = {
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30 hover:border-purple-500/50",
  red: "bg-red-500/20 text-red-400 border-red-500/30 hover:border-red-500/50",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:border-blue-500/50",
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:border-cyan-500/50",
};

function SpecialTag({ label, color }: SpecialTagProps) {
  return (
    <span className={cn(
      "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
      TAG_COLORS[color]
    )}>
      {label}
    </span>
  );
}

function EffectBadge({ effect }: { effect: StatusEffect }) {
  return (
    <div
      className={cn(
        "px-3 py-1.5 text-xs rounded-lg border transition-colors",
        effect.type === "Buff" && "bg-green-500/20 text-green-400 border-green-500/30 hover:border-green-500/50",
        effect.type === "Debuff" && "bg-red-500/20 text-red-400 border-red-500/30 hover:border-red-500/50",
        effect.type === "Special" && "bg-purple-500/20 text-purple-400 border-purple-500/30 hover:border-purple-500/50"
      )}
    >
      <span className="font-medium">{effect.name}</span>
    </div>
  );
}
