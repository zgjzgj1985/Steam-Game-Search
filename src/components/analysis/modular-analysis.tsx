"use client";

import { useState, useCallback, useEffect } from "react";
import { Game, AnalysisModuleType, ANALYSIS_MODULES, GameAnalysis, VerdictResult } from "@/types/game";
import { GameInfo } from "@/components/analysis/game-info";
import { CoreGameplayView } from "@/components/analysis/core-gameplay";
import { BattleSystemView } from "@/components/analysis/battle-system-view";
import { DifferentiationView } from "@/components/analysis/differentiation-view";
import { NegativeFeedbackView } from "@/components/analysis/negative-feedback";
import { DesignSuggestionsView } from "@/components/analysis/design-suggestions";
import { ScreenshotGallery } from "@/components/media/gallery";
import { AnalysisMetadataBadge, SourceOfTruthBadge, KeyInsightsBadge } from "@/components/analysis/analysis-metadata-badge";
import { cn } from "@/lib/utils";
import { Target, AlertTriangle, Gamepad2, Sword, Images, Sparkles, Loader2 } from "lucide-react";

// 池子配置
const POOL_CONFIG = {
  A: { label: "A池", color: "text-amber-400", bg: "bg-amber-400/10" },
  B: { label: "B池", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  C: { label: "C池", color: "text-rose-400", bg: "bg-rose-400/10" },
};

// 模块配置
const MODULE_META: Record<AnalysisModuleType, { icon: React.ElementType; accent: string; bg: string }> = {
  verdict: { icon: Sparkles, accent: "text-violet-400", bg: "bg-violet-400/10" },
  coreGameplay: { icon: Gamepad2, accent: "text-cyan-400", bg: "bg-cyan-400/10" },
  battleSystem: { icon: Sword, accent: "text-purple-400", bg: "bg-purple-400/10" },
  differentiation: { icon: Target, accent: "text-amber-400", bg: "bg-amber-400/10" },
  negativeFeedback: { icon: AlertTriangle, accent: "text-rose-400", bg: "bg-rose-400/10" },
  designSuggestions: { icon: Sparkles, accent: "text-emerald-400", bg: "bg-emerald-400/10" },
};

interface ModularAnalysisProps {
  game: Game;
  initialAnalysis?: Partial<GameAnalysis>;
  onMarkRead?: (gameId: string) => void;
}

export function ModularAnalysis({ game, initialAnalysis, onMarkRead }: ModularAnalysisProps) {
  const [analysis, setAnalysis] = useState<GameAnalysis>({
    id: initialAnalysis?.id || `analysis-${game.id}-${Date.now()}`,
    gameId: game.id,
    gameName: game.name,
    pool: game.pool || null,
    generatedAt: null,
    analyzedModules: initialAnalysis?.analyzedModules || [],
    referenceValue: initialAnalysis?.referenceValue,
  });

  const [activeTab, setActiveTab] = useState<"analysis" | "gallery">("analysis");
  const [analyzingModules, setAnalyzingModules] = useState<Set<AnalysisModuleType>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  const poolConfig = analysis.pool ? POOL_CONFIG[analysis.pool] : null;

  useEffect(() => {
    async function loadSavedAnalysis() {
      try {
        const res = await fetch(`/api/analysis/${encodeURIComponent(game.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.analysis) {
            const saved = data.analysis;
            setAnalysis(prev => ({
              ...prev,
              id: saved.id || prev.id,
              generatedAt: saved.generatedAt,
              analyzedModules: saved.analyzedModules || [],
              referenceValue: saved.referenceValue,
              verdict: saved.verdict,
              coreGameplay: saved.coreGameplay,
              battleSystem: saved.battleSystem,
              differentiation: saved.differentiation,
              negativeFeedback: saved.negativeFeedback,
              designSuggestions: saved.designSuggestions,
            }));
            setLoadedFromCache(true);
          }
        }
      } catch {
        // 静默降级
      }
    }
    loadSavedAnalysis();
  }, [game.id]);

  const analyzeModule = useCallback(async (moduleType: AnalysisModuleType) => {
    setAnalyzingModules(prev => new Set(prev).add(moduleType));
    setError(null);

    try {
      const response = await fetch("/api/analysis/module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, module: moduleType }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "分析失败");
      }

      const data = await response.json();

      setAnalysis(prev => ({
        ...prev,
        analyzedModules: [...new Set([...prev.analyzedModules, moduleType])],
        [moduleType]: { ...data.result, isAnalyzed: true, isAnalyzing: false, error: null },
        generatedAt: data.generatedAt,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
      setAnalysis(prev => ({
        ...prev,
        [moduleType]: { ...prev[moduleType], isAnalyzed: false, isAnalyzing: false, error: err instanceof Error ? err.message : "分析失败" },
      }));
    } finally {
      setAnalyzingModules(prev => { const next = new Set(prev); next.delete(moduleType); return next; });
    }
  }, [game.id]);

  const analyzeAll = useCallback(async () => {
    for (const mod of ANALYSIS_MODULES) {
      if (!analysis.analyzedModules.includes(mod.type)) {
        await analyzeModule(mod.type);
      }
    }
  }, [analysis.analyzedModules, analyzeModule]);

  const isAnalyzed = (type: AnalysisModuleType) => analysis.analyzedModules.includes(type);
  const isAnalyzing = (type: AnalysisModuleType) => analyzingModules.has(type);

  return (
    <div>
      <GameInfo game={game} />

      {/* 顶部状态栏 */}
      <section className="bg-[#0d1520] border-b border-white/5">
        <div className="container mx-auto px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            {/* 池子标签 */}
            {poolConfig && (
              <div className={cn("shrink-0 flex items-center gap-2 px-4 py-2 rounded-full", poolConfig.bg)}>
                <span className={cn("text-sm font-semibold", poolConfig.color)}>{poolConfig.label}</span>
                <span className="text-xs text-white/40">参考样本</span>
              </div>
            )}

            {loadedFromCache && (
              <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">已加载历史分析</span>
              </div>
            )}

            {/* 一句话结论 */}
            {isAnalyzed("verdict") && analysis.verdict && (
              <div className="flex-1 p-4 rounded-2xl bg-white/[0.02]">
                <p className="text-xs text-[#66c0f4] mb-1">LLM 结论</p>
                <p className="text-sm text-white leading-relaxed">{(analysis.verdict as VerdictResult).verdict}</p>
                {"metadata" in analysis.verdict && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <AnalysisMetadataBadge
                      metadata={(analysis.verdict as VerdictResult & { metadata: unknown }).metadata as any}
                    />
                    {"sourceOfTruth" in (analysis.verdict as any) && (
                      <div className="mt-2">
                        <SourceOfTruthBadge sources={((analysis.verdict as any).metadata as any)?.sourceOfTruth || []} />
                      </div>
                    )}
                    {"keyInsights" in (analysis.verdict as any) && (
                      <div className="mt-2">
                        <KeyInsightsBadge insights={((analysis.verdict as any).metadata as any)?.keyInsights || []} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 快捷操作 */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={analyzeAll}
                disabled={analyzingModules.size > 0 || analysis.analyzedModules.length === ANALYSIS_MODULES.length}
                className="px-5 py-2.5 rounded-xl bg-[#66c0f4] text-[#0b1219] text-sm font-semibold hover:bg-[#87d0f5] transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {analyzingModules.size > 0 && <Loader2 className="w-4 h-4 animate-spin" />}
                <Sparkles className="w-4 h-4" />
                {analysis.analyzedModules.length === ANALYSIS_MODULES.length && !analyzingModules.size ? "分析完成" : loadedFromCache ? "继续分析" : "一键分析"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 主内容区 */}
      <section className="bg-[#0d1520]">
        <div className="container mx-auto px-6 py-8">
          {/* Tab 切换 */}
          <div className="flex items-center gap-2 mb-8">
            <button
              onClick={() => setActiveTab("analysis")}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                activeTab === "analysis"
                  ? "bg-white text-[#0b1219]"
                  : "bg-white/5 text-white/50 hover:text-white"
              )}
            >
              <Sparkles className="w-4 h-4" />
              分析模块
            </button>
            <button
              onClick={() => setActiveTab("gallery")}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                activeTab === "gallery"
                  ? "bg-white text-[#0b1219]"
                  : "bg-white/5 text-white/50 hover:text-white"
              )}
            >
              <Images className="w-4 h-4" />
              截图
            </button>
          </div>

          {activeTab === "analysis" ? (
            <>
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 text-rose-400 text-sm">{error}</div>
              )}

              {/* 模块选择 - 横向排列 */}
              <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-8 scrollbar-hide">
                <span className="shrink-0 text-sm text-white/40">选择模块生成分析</span>
                {ANALYSIS_MODULES.map(mod => {
                  const meta = MODULE_META[mod.type];
                  const Icon = meta.icon;
                  const analyzed = isAnalyzed(mod.type);
                  const analyzing = isAnalyzing(mod.type);

                  return (
                    <button
                      key={mod.type}
                      onClick={() => !analyzed && !analyzing && analyzeModule(mod.type)}
                      disabled={analyzed || analyzing}
                      className={cn(
                        "shrink-0 w-40 p-4 rounded-2xl transition-all text-center",
                        analyzed
                          ? `${meta.bg} border border-current/10`
                          : "bg-white/5 hover:bg-white/10 border border-white/5"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-colors",
                        analyzed ? meta.bg : "bg-white/10"
                      )}>
                        {analyzing ? (
                          <Loader2 className={cn("w-5 h-5 animate-spin", meta.accent)} />
                        ) : (
                          <Icon className={cn("w-5 h-5", analyzed ? meta.accent : "text-white/50")} />
                        )}
                      </div>
                      <p className={cn("text-sm font-medium", analyzed ? "text-white" : "text-white/60")}>{mod.title}</p>
                      <p className="text-xs text-white/30 mt-0.5">{mod.subtitle}</p>
                    </button>
                  );
                })}
              </div>

              {/* 分析结果 */}
              {analysis.analyzedModules.length > 0 && (
                <div className="space-y-6">
                  {isAnalyzed("coreGameplay") && analysis.coreGameplay && (
                    <CoreGameplayView coreGameplay={analysis.coreGameplay as any} />
                  )}
                  {isAnalyzed("battleSystem") && analysis.battleSystem && (
                    <BattleSystemView battleSystem={analysis.battleSystem as any} />
                  )}
                  {isAnalyzed("differentiation") && analysis.differentiation && (
                    <DifferentiationView differentiation={analysis.differentiation as any} />
                  )}
                  {isAnalyzed("negativeFeedback") && analysis.negativeFeedback && (
                    <NegativeFeedbackView negativeFeedback={analysis.negativeFeedback as any} pool={analysis.pool} />
                  )}
                  {isAnalyzed("designSuggestions") && analysis.designSuggestions && (
                    <DesignSuggestionsView designSuggestions={analysis.designSuggestions as any} gameId={game.id} onMarkRead={onMarkRead} />
                  )}
                </div>
              )}
            </>
          ) : (
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

function getDefaultScreenshots(steamAppId: string | null): string[] {
  if (!steamAppId) return [];
  const base = "https://steamcdn-a.akamaihd.net/steam/apps";
  return [`${base}/${steamAppId}/ss_1.jpg`, `${base}/${steamAppId}/ss_2.jpg`, `${base}/${steamAppId}/ss_3.jpg`];
}