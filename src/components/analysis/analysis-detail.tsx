"use client";

import { useState } from "react";
import { Game, PokemonLikeAnalysis } from "@/types/game";
import { GameInfo } from "@/components/analysis/game-info";
import { CoreGameplayView } from "@/components/analysis/core-gameplay";
import { BattleSystemView } from "@/components/analysis/battle-system-view";
import { DifferentiationView } from "@/components/analysis/differentiation-view";
import { NegativeFeedbackView } from "@/components/analysis/negative-feedback";
import { DesignSuggestionsView } from "@/components/analysis/design-suggestions";
import { ScreenshotGallery } from "@/components/media/gallery";
import { cn } from "@/lib/utils";
import { Target, AlertTriangle, Gamepad2, Sword, Images } from "lucide-react";

// 池子配置
const POOL_CONFIG = {
  A: { label: "A池", color: "text-amber-400", bg: "bg-amber-400/10" },
  B: { label: "B池", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  C: { label: "C池", color: "text-rose-400", bg: "bg-rose-400/10" },
};

interface AnalysisDetailProps {
  game: Game;
  analysis: PokemonLikeAnalysis;
}

/**
 * 分析详情页面（旧版完整分析展示）
 */
export function AnalysisDetail({ game, analysis }: AnalysisDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const poolConfig = analysis.pool ? POOL_CONFIG[analysis.pool] : null;

  const tabs = [
    { id: "overview", label: "概览", icon: Gamepad2 },
    { id: "gameplay", label: "核心玩法", icon: Gamepad2 },
    { id: "battle", label: "战斗系统", icon: Sword },
    { id: "innovation", label: "差异化", icon: Target },
    { id: "negative", label: "差评", icon: AlertTriangle },
    { id: "gallery", label: "截图", icon: Images },
  ];

  return (
    <div>
      <GameInfo game={game} />

      {/* 池子 & 结论 */}
      <section className="bg-[#0d1520] border-b border-white/5">
        <div className="container mx-auto px-6 py-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            {poolConfig && (
              <div className={cn("shrink-0 flex items-center gap-2 px-4 py-2 rounded-full", poolConfig.bg)}>
                <span className={cn("text-sm font-semibold", poolConfig.color)}>{poolConfig.label}</span>
                <span className="text-xs text-white/40">参考样本</span>
              </div>
            )}
            <div className="flex-1 p-4 rounded-2xl bg-white/[0.02]">
              <p className="text-xs text-[#66c0f4] mb-1">LLM 结论</p>
              <p className="text-white font-medium">{analysis.verdict}</p>
            </div>
          </div>

          {/* 参考价值 */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <ValueCard label="A池参考" value={analysis.referenceValue.forPoolA} color="bg-amber-400" />
            <ValueCard label="B池参考" value={analysis.referenceValue.forPoolB} color="bg-emerald-400" />
            <ValueCard label="C池参考" value={analysis.referenceValue.forPoolC} color="bg-rose-400" />
            <ValueCard label="综合价值" value={analysis.referenceValue.overallScore} color="bg-[#66c0f4]" />
          </div>
        </div>
      </section>

      {/* 主内容 */}
      <section className="bg-[#0d1520]">
        <div className="container mx-auto px-6 py-8">
          {/* Tab 切换 */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0",
                    activeTab === tab.id
                      ? "bg-white text-[#0b1219]"
                      : "bg-white/5 text-white/50 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 内容 */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <CoreGameplayView coreGameplay={analysis.coreGameplay} />
                <BattleSystemView battleSystem={analysis.battleSystem} />
              </div>
              <DifferentiationView differentiation={analysis.differentiation} />
              <NegativeFeedbackView negativeFeedback={analysis.negativeFeedback} pool={analysis.pool} />
              <DesignSuggestionsView designSuggestions={analysis.designSuggestions} />
            </div>
          )}
          {activeTab === "gameplay" && <CoreGameplayView coreGameplay={analysis.coreGameplay} />}
          {activeTab === "battle" && <BattleSystemView battleSystem={analysis.battleSystem} />}
          {activeTab === "innovation" && <DifferentiationView differentiation={analysis.differentiation} />}
          {activeTab === "negative" && (
            <NegativeFeedbackView negativeFeedback={analysis.negativeFeedback} pool={analysis.pool} />
          )}
          {activeTab === "gallery" && (
            <ScreenshotGallery
              screenshots={
                game.screenshots && game.screenshots.length > 0
                  ? game.screenshots
                  : getDefaultScreenshots(game.steamAppId)
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

// 数值卡片
function ValueCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-3 rounded-2xl bg-white/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/30">{label}</span>
        <span className="text-lg font-bold text-white">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function getDefaultScreenshots(steamAppId: string | null): string[] {
  if (!steamAppId) return [];
  const base = "https://steamcdn-a.akamaihd.net/steam/apps";
  return [`${base}/${steamAppId}/ss_1.jpg`, `${base}/${steamAppId}/ss_2.jpg`, `${base}/${steamAppId}/ss_3.jpg`];
}