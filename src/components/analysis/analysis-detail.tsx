"use client";

import { useState } from "react";
import { Game, BattleAnalysis, AnalysisNarrative } from "@/types/game";
import { BattleMechanicsView } from "@/components/analysis/battle-mechanics";
import { StrategicDepthView } from "@/components/analysis/strategic-depth";
import { InnovationView } from "@/components/analysis/innovation";
import { ScreenshotGallery } from "@/components/media/gallery";
import { GameInfo } from "@/components/analysis/game-info";
import { AnalysisNarrativeBlock } from "@/components/analysis/analysis-narrative";
import { RadarChart } from "@/components/charts/radar-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Sword, Brain, Sparkles, Images, BarChart3 } from "lucide-react";

interface AnalysisDetailProps {
  game: Game;
  analysis: BattleAnalysis;
}

/**
 * 计算战斗机制评分
 */
function calculateMechanicsScore(mechanics: BattleAnalysis["battleMechanics"]): number {
  let score = 50;
  if (mechanics.ultimateSkills) score += 10;
  if (mechanics.comboSystem) score += 10;
  if (mechanics.breakGauge) score += 10;
  if (mechanics.elements.hasElements) score += 10;
  if (mechanics.statusEffects.length > 3) score += 10;
  if (mechanics.specialMechanics.length > 0) score += mechanics.specialMechanics.length * 3;
  return Math.min(score, 100);
}

/**
 * 计算创新评分
 */
function calculateInnovationScore(innovations: BattleAnalysis["innovationElements"]): number {
  if (innovations.length === 0) return 0;
  const total = innovations.reduce((acc, inv) => {
    if (inv.impact === "High") return acc + 30;
    if (inv.impact === "Medium") return acc + 20;
    return acc + 10;
  }, 0);
  return Math.min(total, 100);
}

/**
 * 获取综合评分
 */
function calculateOverallScore(
  mechanics: BattleAnalysis["battleMechanics"],
  strategicDepth: BattleAnalysis["strategicDepth"],
  innovations: BattleAnalysis["innovationElements"]
): number {
  const mechanicsScore = calculateMechanicsScore(mechanics);
  const strategicScore = strategicDepth?.replayabilityScore || 50;
  const innovationScore = calculateInnovationScore(innovations);
  return Math.round((mechanicsScore + strategicScore + innovationScore) / 3);
}

/** 兼容旧版 API / 缓存中无 narrative 字段的响应 */
function getNarrative(analysis: BattleAnalysis, game: Game): AnalysisNarrative {
  const n = analysis.narrative;
  if (n?.verdict?.trim()) return n;
  return {
    verdict: `《${game.name}》当前展示的是旧版分析缓存，请刷新页面以获取带长文解读的最新结果。`,
    summary: "",
    battleInsight: "",
    strategyInsight: "",
    keyTakeaways: [],
    dataCaveat: "若刷新后仍无长文，请确认已部署最新代码且 LLM 接口可用。",
  };
}

export function AnalysisDetail({ game, analysis }: AnalysisDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const narrative = getNarrative(analysis, game);

  // 综合分：优先使用模型给出的 overallScore，与叙事一致
  const overallScore =
    typeof analysis.overallScore === "number" && !Number.isNaN(analysis.overallScore)
      ? Math.min(100, Math.max(0, analysis.overallScore))
      : calculateOverallScore(
          analysis.battleMechanics,
          analysis.strategicDepth,
          analysis.innovationElements
        );
  const mechanicsScore = calculateMechanicsScore(analysis.battleMechanics);
  const strategicScore = analysis.strategicDepth?.replayabilityScore || 50;
  const innovationScore = calculateInnovationScore(analysis.innovationElements);

  // 雷达图数据
  const metrics = [
    { name: "战斗机制", value: mechanicsScore },
    { name: "策略深度", value: strategicScore },
    { name: "创新要素", value: innovationScore },
  ];

  return (
    <div>
      {/* Hero 游戏信息 */}
      <GameInfo game={game} />

      {/* LLM 可读性主内容：结论与长文 */}
      <AnalysisNarrativeBlock narrative={narrative} />

      {/* 评分概览区域 */}
      <section className="bg-[#0f1923] border-b border-[#2a475e]/50">
        <div className="container mx-auto px-6 py-8">
          <div className="grid lg:grid-cols-5 gap-8 items-center">
            {/* 综合评分大数字 */}
            <div className="lg:col-span-2 flex items-center gap-6">
              <div className="relative">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-[#66c0f4]/20 to-[#66c0f4]/5 border-4 border-[#66c0f4]/30 flex items-center justify-center">
                  <div className="text-center">
                    <span className={cn(
                      "text-5xl md:text-6xl font-bold",
                      overallScore >= 80 && "text-green-400",
                      overallScore >= 60 && overallScore < 80 && "text-[#66c0f4]",
                      overallScore >= 40 && overallScore < 60 && "text-yellow-400",
                      overallScore < 40 && "text-red-400"
                    )}>
                      {overallScore}
                    </span>
                  </div>
                </div>
                {/* 环形进度条 */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-[#2a475e]/30"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${overallScore * 2.89} 289`}
                    className={cn(
                      "transition-all duration-1000",
                      overallScore >= 80 && "text-green-400",
                      overallScore >= 60 && overallScore < 80 && "text-[#66c0f4]",
                      overallScore >= 40 && overallScore < 60 && "text-yellow-400",
                      overallScore < 40 && "text-red-400"
                    )}
                  />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">战斗系统</h2>
                <p className="text-white/60">综合评分</p>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-1 text-xs font-medium rounded",
                    overallScore >= 80 && "bg-green-500/20 text-green-400",
                    overallScore >= 60 && overallScore < 80 && "bg-[#66c0f4]/20 text-[#66c0f4]",
                    overallScore >= 40 && overallScore < 60 && "bg-yellow-500/20 text-yellow-400",
                    overallScore < 40 && "bg-red-500/20 text-red-400"
                  )}>
                    {overallScore >= 80 ? "优秀" : overallScore >= 60 ? "良好" : overallScore >= 40 ? "一般" : "较差"}
                  </span>
                </div>
              </div>
            </div>

            {/* 三项评分详情 */}
            <div className="lg:col-span-3 grid grid-cols-3 gap-4">
              {/* 战斗机制 */}
              <div className="bg-[#1b2838]/50 rounded-xl p-4 border border-[#2a475e]/30 hover:border-[#66c0f4]/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Sword className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-sm text-white/60">战斗机制</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">{mechanicsScore}</span>
                  <div className="flex-1 h-2 bg-[#2a475e]/30 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                      style={{ width: `${mechanicsScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 策略深度 */}
              <div className="bg-[#1b2838]/50 rounded-xl p-4 border border-[#2a475e]/30 hover:border-[#66c0f4]/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Brain className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-sm text-white/60">策略深度</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">{strategicScore}</span>
                  <div className="flex-1 h-2 bg-[#2a475e]/30 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                      style={{ width: `${strategicScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 创新要素 */}
              <div className="bg-[#1b2838]/50 rounded-xl p-4 border border-[#2a475e]/30 hover:border-[#66c0f4]/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Sparkles className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-sm text-white/60">创新要素</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">{innovationScore}</span>
                  <div className="flex-1 h-2 bg-[#2a475e]/30 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                      style={{ width: `${innovationScore}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 雷达图 */}
          <div className="mt-8 bg-[#1b2838]/30 rounded-xl p-6 border border-[#2a475e]/30">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-[#66c0f4]" />
              <h3 className="text-lg font-semibold text-white">能力雷达图</h3>
            </div>
            <RadarChart data={metrics} />
          </div>
        </div>
      </section>

      {/* 详细内容标签页 */}
      <section className="bg-[#0f1923]">
        <div className="container mx-auto px-6 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#1b2838]/50 border border-[#2a475e]/30 p-1 rounded-xl">
              <TabsTrigger
                value="overview"
                icon={<BarChart3 className="w-4 h-4" />}
                label="概览"
              />
              <TabsTrigger
                value="mechanics"
                icon={<Sword className="w-4 h-4" />}
                label="战斗机制"
              />
              <TabsTrigger
                value="strategy"
                icon={<Brain className="w-4 h-4" />}
                label="策略深度"
              />
              <TabsTrigger
                value="innovation"
                icon={<Sparkles className="w-4 h-4" />}
                label="创新亮点"
              />
              <TabsTrigger
                value="gallery"
                icon={<Images className="w-4 h-4" />}
                label="截图"
              />
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <BattleMechanicsView
                  mechanics={analysis.battleMechanics}
                  insight={narrative.battleInsight}
                  damageLine={analysis.battleMechanics.damageFormula}
                />
                <StrategicDepthView
                  depth={analysis.strategicDepth}
                  strategyInsight={narrative.strategyInsight}
                />
              </div>

              {/* 创新亮点预览 */}
              {analysis.innovationElements.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-green-400" />
                      <h3 className="text-lg font-semibold text-white">创新亮点</h3>
                    </div>
                    <button
                      onClick={() => setActiveTab("innovation")}
                      className="text-sm text-[#66c0f4] hover:text-white transition-colors"
                    >
                      查看全部 {analysis.innovationElements.length} 项 →
                    </button>
                  </div>
                  <InnovationView
                    innovations={analysis.innovationElements.slice(0, 3)}
                    compact
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="mechanics" className="mt-6">
              <BattleMechanicsView
                mechanics={analysis.battleMechanics}
                detailed
                insight={narrative.battleInsight}
                damageLine={analysis.battleMechanics.damageFormula}
              />
            </TabsContent>

            <TabsContent value="strategy" className="mt-6">
              <StrategicDepthView
                depth={analysis.strategicDepth}
                detailed
                strategyInsight={narrative.strategyInsight}
              />
            </TabsContent>

            <TabsContent value="innovation" className="mt-6">
              {analysis.innovationElements.length > 0 ? (
                <InnovationView innovations={analysis.innovationElements} />
              ) : (
                <p className="text-center text-sm text-white/50 py-12">暂无创新亮点条目。</p>
              )}
            </TabsContent>

            <TabsContent value="gallery" className="mt-6">
              <ScreenshotGallery
                screenshots={
                  game.screenshots.length > 0
                    ? game.screenshots
                    : getDefaultScreenshots(game.steamAppId)
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}

/**
 * 获取默认截图
 */
function getDefaultScreenshots(steamAppId: string | null): string[] {
  if (!steamAppId) return [];
  const base = "https://steamcdn-a.akamaihd.net/steam/apps";
  return [
    `${base}/${steamAppId}/ss_1.jpg`,
    `${base}/${steamAppId}/ss_2.jpg`,
    `${base}/${steamAppId}/ss_3.jpg`,
  ];
}
