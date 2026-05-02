"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Crown,
  Target,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Users,
  Star,
  ExternalLink,
  RotateCcw,
  ThumbsUp,
  BarChart3,
  Eye,
  EyeOff,
  Calendar,
  X,
  Gamepad2,
  Info,
  Trophy,
  Globe,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, subYears } from "date-fns";
import { zhCN } from "date-fns/locale";
import { SYNONYM_MERGE as TAG_SYNONYM_MERGE, INNOVATION_THRESHOLDS } from "@/lib/tag-config";

// ============ 类型定义 ============

// 评价来源类型
type ReviewSource = "all" | "cn" | "overseas";

interface GameRecord {
  id: string;
  name: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  categories: string[];
  releaseDate: string | null;
  price: number;
  steamReviews: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  // 区域评价数据
  cnReviews: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  overseasReviews: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  // 区域威尔逊得分
  cnWilsonScore: number;
  overseasWilsonScore: number;
  headerImage: string | null;
  steamUrl: string;
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  wilsonScore: number;
  pool: "A" | "B" | "C" | null;
  // 测试版相关字段
  isTestVersion: boolean;
  testVersionType: "name" | "tag" | "data" | "none";
  // 标签权重系统
  coreTagCount: number;
  secondaryTagCount: number;
  modernTagCount: number;
  tagWeight: number;
  matchedCoreTags: string[];
  matchedSecondaryTags: string[];
  matchedModernTags: string[];
  uniqueFeatureTags: string[];
  differentiationLabels: string[];
  // 当前选中的特色标签筛选（卡片显示用）
  activeFeatureTagFilter?: string;
  activeFeatureTagLabel?: string;
  // 卡片展示用现代标签（已排重）
  displayModernTags: string[];
  // LLM 融合玩法分析（来自 combinedMechanics.json）
  llmMechanics: string[];
  llmMechanicsSummary: string;
  // 自由标签（v3 新增，来自 combinedMechanics.json 的 rawMechanics 字段）
  llmRawMechanics: string[];
  // 过滤后的创新融合标签（排除品类标配标签）
  innovationTags: string[];
}

interface PoolStats {
  total: number;
  totalTurnBased: number;
  poolA: number;
  poolB: number;
  poolC: number;
}

interface PoolConfig {
  poolA: { minRating: number; minReviews: number };
  poolB: { minRating: number; minReviews: number };
  poolC: { minRating: number; maxRating: number; minReviews: number };
}

// 价格统计类型
interface PriceStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  total: number;
  distribution: {
    free: number;
    under10: number;
    under20: number;
    under30: number;
    under50: number;
    over50: number;
  };
}

// 池子条件类型
type PoolConditions = { minRating: number; minReviews: number } | { minRating: number; maxRating: number; minReviews: number };

// 特色标签选项（动态从API获取）
interface FeatureTagOption {
  key: string;
  label: string;
  tag: string;
  count: number;
  gameCount: number;
  coverage: number;
  avgWilson: number;
  poolDistribution?: {
    A: number;
    B: number;
    C: number;
  };
  // 小众创新标签新增字段
  positiveRate?: number;
  totalPositive?: number;
  totalNegative?: number;
  innovationScore?: number;
}

interface FilterResponse {
  results: GameRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: PoolStats;
  priceStats?: PriceStats;
  poolConfig: PoolConfig;
  query: string;
  poolFilters: string[];
  featureTagOptions?: FeatureTagOption[];
}

// ============ 池子配置 ============

const POOL_CONFIG = {
  A: {
    label: "A池",
    name: "神作参考池",
    icon: Crown,
    color: "amber",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-500",
    hoverBg: "hover:bg-amber-500/5",
    description: "2024年后上线 · 好评率≥85% · 评论数>1000",
  },
  B: {
    label: "B池",
    name: "核心竞品池",
    icon: Target,
    color: "emerald",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-500",
    hoverBg: "hover:bg-emerald-500/5",
    description: "宝可梦Like成功案例，学习成功要素",
  },
  C: {
    label: "C池",
    name: "避坑指南池",
    icon: AlertTriangle,
    color: "rose",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-500",
    hoverBg: "hover:bg-rose-500/5",
    description: "宝可梦Like争议案例，读差评避大坑",
  },
};

const SORT_OPTIONS = [
  { value: "wilson", label: "威尔逊得分" },
  { value: "rating", label: "好评率" },
  { value: "reviews", label: "评价数" },
  { value: "date", label: "发售日期" },
];

// 快捷日期范围选项
const QUICK_DATE_RANGES = [
  { label: "近1年", years: 1 },
  { label: "近2年", years: 2 },
  { label: "近3年", years: 3 },
  { label: "近5年", years: 5 },
  { label: "2015前", isBefore: "2015-01-01" },
  { label: "2010前", isBefore: "2010-01-01" },
];

// ============ 工具函数 ============

// PokemonLike标签翻译（只有4个固定标签）
const POKEMON_LIKE_TRANSLATIONS: Record<string, string> = {
  "Creature Collector": "生物收集",
  "Monster Catching": "怪物捕捉",
  "Monster Taming": "怪物养成",
  "Creature Collection": "生物收集",
};

function translatePokemonLikeTag(tag: string): string {
  return POKEMON_LIKE_TRANSLATIONS[tag] || tag;
}

function formatWan(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}万`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// 根据评价来源获取好评率
function getPositiveRateBySource(reviews: GameRecord["steamReviews"], source: ReviewSource): number | null {
  if (source === "cn") {
    if (!reviews || reviews.totalReviews === 0) return null;
    return Math.round((reviews.totalPositive / reviews.totalReviews) * 100);
  }
  // 默认返回总体好评率
  if (!reviews || reviews.totalReviews === 0) return null;
  return Math.round((reviews.totalPositive / reviews.totalReviews) * 100);
}

// ============ 游戏卡片 ============

function GameCard({ game, reviewSource, isRead }: { game: GameRecord; reviewSource?: ReviewSource; isRead?: boolean }) {
  // 根据评价来源获取好评率
  const positiveRate = (() => {
    if (reviewSource === "cn" && game.cnReviews) {
      return game.cnReviews.totalReviews > 0
        ? Math.round((game.cnReviews.totalPositive / game.cnReviews.totalReviews) * 100)
        : null;
    } else if (reviewSource === "overseas" && game.overseasReviews) {
      return game.overseasReviews.totalReviews > 0
        ? Math.round((game.overseasReviews.totalPositive / game.overseasReviews.totalReviews) * 100)
        : null;
    }
    // 默认全部评价
    return game.steamReviews && game.steamReviews.totalReviews > 0
      ? Math.round((game.steamReviews.totalPositive / game.steamReviews.totalReviews) * 100)
      : null;
  })();

  // 根据评价来源获取威尔逊得分
  const wilsonScore = (() => {
    if (reviewSource === "cn") {
      return game.cnWilsonScore;
    } else if (reviewSource === "overseas") {
      return game.overseasWilsonScore;
    }
    return game.wilsonScore;
  })();

  // 根据评价来源获取评价数和评价来源标签
  const reviewInfo = (() => {
    if (reviewSource === "cn" && game.cnReviews) {
      return {
        total: game.cnReviews.totalReviews,
        label: "国内评价"
      };
    } else if (reviewSource === "overseas" && game.overseasReviews) {
      return {
        total: game.overseasReviews.totalReviews,
        label: "海外评价"
      };
    }
    return {
      total: game.steamReviews?.totalReviews ?? 0,
      label: null
    };
  })();

  const poolConfig = game.pool ? POOL_CONFIG[game.pool] : null;
  const PoolIcon = poolConfig ? poolConfig.icon : null;

  // 威尔逊得分显示（0-1转为百分比）
  const wilsonDisplay = wilsonScore > 0
    ? `${(wilsonScore * 100).toFixed(0)}%`
    : null;

  // 评分颜色逻辑
  const scoreColor = wilsonScore > 0
    ? wilsonScore >= 0.7
      ? "text-green-600"
      : wilsonScore >= 0.5
        ? "text-yellow-600"
        : "text-red-600"
    : positiveRate !== null
      ? positiveRate >= 80
        ? "text-green-600"
        : positiveRate >= 60
          ? "text-yellow-600"
          : "text-red-600"
      : "text-primary";

  // 去除 HTML 标签
  const getFullDescription = (text: string): string => {
    return text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&hellip;/g, "…")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  };

  const fullDesc = game.shortDescription ? getFullDescription(game.shortDescription) : "";
  const cardDesc = fullDesc.length > 120 ? fullDesc.slice(0, 120).trimEnd() + "…" : fullDesc;

  return (
    <div className={cn("relative group flex flex-col h-full")}>
      <Link
        href={`/analysis/${game.id}`}
        className="flex flex-col flex-1 rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
      >
        {/* 封面 */}
        <div className="relative aspect-video bg-muted overflow-hidden shrink-0">
          {game.headerImage ? (
            <Image
              src={game.headerImage}
              alt={game.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Gamepad2 className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* 池子标签 */}
          {game.pool && poolConfig && PoolIcon && (
            <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-md backdrop-blur-sm border",
                  POOL_CONFIG[game.pool].bgColor,
                  POOL_CONFIG[game.pool].borderColor
                )}
              >
                {PoolIcon && <PoolIcon className={cn("w-3.5 h-3.5", POOL_CONFIG[game.pool].textColor)} />}
                <span className={cn("text-xs font-medium", POOL_CONFIG[game.pool].textColor)}>
                  {poolConfig.label}
                </span>
              </div>
              {/* 宝可梦标签 */}
              {game.isPokemonLike && game.pokemonLikeTags.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-background/80 backdrop-blur-sm rounded">
                  {translatePokemonLikeTag(game.pokemonLikeTags[0])}
                </span>
              )}
              {/* 标签权重徽章 */}
              {game.coreTagCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/90 text-white rounded shadow-sm">
                  核心
                </span>
              )}
              {game.modernTagCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-500/90 text-white rounded shadow-sm">
                  创新
                </span>
              )}
            </div>
          )}

          {/* 价格 + Steam跳转（并排显示在右上角） */}
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
            {game.price > 0 ? (
              <div className="px-2 py-0.5 text-xs font-medium bg-background/90 backdrop-blur-sm rounded text-muted-foreground shadow-sm">
                ${game.price.toFixed(2)}
              </div>
            ) : (
              <div className="px-2 py-0.5 text-xs font-medium bg-green-600/90 text-white rounded shadow-sm">
                免费
              </div>
            )}
            {/* Steam跳转按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(game.steamUrl, "_blank", "noopener,noreferrer");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1b2838] hover:bg-[#2a475e] text-white text-xs font-medium shadow-lg transition-all hover:scale-105 hover:shadow-xl"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Steam</span>
            </button>
          </div>

          {/* C池避坑提示徽章 - 点击引导 */}
          {game.pool === "C" && (
            <div className="absolute bottom-2 left-2 right-24 z-10">
              <div className="px-2 py-1.5 text-[10px] font-medium bg-gradient-to-r from-rose-600 to-red-500 text-white rounded shadow-lg flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                <span>避坑指南 · 点击分析页读差评</span>
              </div>
            </div>
          )}
        </div>

        {/* 游戏信息 */}
        <div className="p-4 flex flex-col flex-1 min-h-0">
          <h3 className="font-semibold text-lg mb-1 line-clamp-1 group-hover:text-primary transition-colors">
            {game.name}
          </h3>

          {game.developers.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {game.developers[0]}
              {game.publishers.length > 0 &&
              game.publishers[0] !== game.developers[0]
                ? ` · ${game.publishers[0]}`
                : ""}
            </p>
          )}

          {game.releaseDate && (
            <p className="text-xs text-muted-foreground mb-2">{game.releaseDate}</p>
          )}

          {cardDesc && (
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed line-clamp-2">
              {cardDesc}
            </p>
          )}

          <div className="flex items-center gap-3 text-sm mt-auto">
            {/* 威尔逊得分 - 使用 Trophy 图标 + W 标签 */}
            {wilsonDisplay && (
              <div className={cn("flex items-center gap-1 font-medium", scoreColor)}>
                <Trophy className="w-4 h-4 fill-current" />
                <span>{wilsonDisplay}</span>
                <span className="text-[10px] opacity-70">W</span>
              </div>
            )}

            {/* 好评率 - 使用 Star 图标 */}
            {positiveRate !== null && (
              <div className={cn("flex items-center gap-1 font-medium",
                positiveRate >= 80 ? "text-green-600" : positiveRate >= 60 ? "text-yellow-600" : "text-red-600"
              )}>
                <Star className="w-4 h-4 fill-current" />
                <span>{positiveRate}%</span>
              </div>
            )}

            {reviewInfo.total > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>
                  {reviewInfo.total.toLocaleString("en-US")}条{reviewInfo.label ? `（${reviewInfo.label}）` : ""}
                </span>
              </div>
            )}
          </div>

          {/* 标签匹配度进度条（无标签时显示池子信息） */}
          {(game.tagWeight > 0 || game.pool || game.activeFeatureTagLabel) && (
            <div className="mt-3 pt-3 border-t border-border/50">
              {game.tagWeight > 0 ? (
                <>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                    <span>匹配度</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          game.coreTagCount > 0 ? "bg-amber-500" : game.modernTagCount > 0 ? "bg-purple-500" : "bg-blue-500"
                        )}
                        style={{ width: `${Math.min(100, game.tagWeight * 10)}%` }}
                      />
                    </div>
                    <span className="font-medium w-6 text-right">
                      {Math.min(100, game.tagWeight * 10)}%
                    </span>
                  </div>
                  {/* 标签详情 */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {game.matchedCoreTags.slice(0, 2).map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                        {tag}
                      </span>
                    ))}
                    {/* 创新融合标签：使用后端过滤后的 innovationTags，展示 LLM 真正识别的创新玩法 */}
                    {((game.innovationTags || []).slice(0, 3)).map((label, i) => (
                      <span key={`m-${i}`} className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                        {label}
                      </span>
                    ))}
                    {/* 用户选中的特色标签 */}
                    {game.activeFeatureTagLabel && (
                      <span key="active-feature" className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-cyan-100 to-teal-100 text-cyan-700 dark:from-cyan-900/30 dark:to-teal-900/30 dark:text-cyan-400 rounded border border-cyan-200 dark:border-cyan-700">
                        {game.activeFeatureTagLabel}
                      </span>
                    )}
                  </div>
                </>
              ) : game.activeFeatureTagLabel ? (
                /* 仅有选中的特色标签时，显示该标签 */
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-cyan-100 to-teal-100 text-cyan-700 dark:from-cyan-900/30 dark:to-teal-900/30 dark:text-cyan-400 rounded border border-cyan-200 dark:border-cyan-700">
                    {game.activeFeatureTagLabel}
                  </span>
                </div>
              ) : (
                /* 无标签匹配时，仅显示池子归属提示 */
                <p className="text-[10px] text-muted-foreground italic">
                  {game.pool && <span className={cn("font-medium", POOL_CONFIG[game.pool]?.textColor)}>{POOL_CONFIG[game.pool]?.label}</span>}
                  {game.pool && " · "}该游戏未匹配到特色标签
                </p>
              )}
            </div>
          )}

          {/* C池差评方向提示 */}
          {game.pool === "C" && (
            <div className="mt-3 p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-800 shrink-0">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                <div className="text-[10px] text-rose-700 dark:text-rose-300">
                  <span className="font-medium">避坑重点：</span>
                  <span>点击上方&quot;LLM分析&quot;，在LLM分析中查看差评关键词汇总，了解玩家主要抱怨方向</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between text-sm text-primary font-medium pt-3 border-t border-border/40">
            <div className="flex items-center">
              <span>LLM分析</span>
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
            {isRead && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
                <CheckCircle className="w-3 h-3 fill-emerald-500/30" />
                <span>已读</span>
              </div>
            )}
          </div>
        </div>
      </Link>

    </div>
  );
}

// ============ 数字输入滑块（改进版：支持直接输入和预设值） ============

function NumberSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
  presets,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
  presets?: number[]; // 预设快捷值
}) {
  const displayFormat = formatValue || String;
  const [inputValue, setInputValue] = useState(value.toString());
  const [isFocused, setIsFocused] = useState(false);

  // 同步外部值到输入框
  useEffect(() => {
    if (!isFocused) {
      setInputValue(value.toString());
    }
  }, [value, isFocused]);

  // 处理输入框变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setInputValue(clamped.toString());
    } else {
      setInputValue(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const newVal = Math.min(max, value + step);
      onChange(newVal);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newVal = Math.max(min, value - step);
      onChange(newVal);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          {/* 直接输入框 */}
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="w-16 px-1.5 py-0.5 text-xs text-right font-medium tabular-nums bg-transparent border border-transparent rounded hover:border-border/50 focus:border-primary rounded transition-colors"
          />
          {formatValue && (
            <span className="text-xs text-muted-foreground">
              {formatValue(value).replace(/[\d,]/g, "")}
            </span>
          )}
        </div>
      </div>

      {/* 滑块 */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
        />
      </div>

      {/* 预设快捷值 */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => {
                onChange(preset);
                setInputValue(preset.toString());
              }}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                value === preset
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {displayFormat(preset)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ 范围滑块 ============

function RangeSlider({
  label,
  value,
  onChange,
  min,
  max,
  formatValue,
}: {
  label: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min: number;
  max: number;
  formatValue?: (v: number) => string;
}) {
  const displayFormat = formatValue || String;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">
          {displayFormat(value[0])} - {displayFormat(value[1])}
        </span>
      </div>
      <div className="relative pt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={(max - min) / 100}
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="absolute w-full h-2 appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={(max - min) / 100}
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="absolute w-full h-2 appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
        />
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{
              marginLeft: `${((value[0] - min) / (max - min)) * 100}%`,
              marginRight: `${100 - ((value[1] - min) / (max - min)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============ 池子卡片 ============

function PoolCard({
  poolKey,
  config,
  isActive,
  onToggle,
  count,
  conditions,
  onConditionsChange,
}: {
  poolKey: "A" | "B" | "C";
  config: typeof POOL_CONFIG.A;
  isActive: boolean;
  onToggle: () => void;
  count: number;
  conditions: PoolConditions;
  onConditionsChange: (conditions: PoolConditions) => void;
}) {
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all",
        isActive
          ? `${config.bgColor} ${config.borderColor} shadow-lg`
          : "bg-card border-border opacity-60"
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 text-left">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
              isActive ? config.bgColor : "bg-muted"
            )}
          >
            <Icon className={cn("w-5 h-5", isActive ? config.textColor : "text-muted-foreground")} />
          </div>
          <div>
            <div className={cn("font-semibold", isActive ? config.textColor : "text-muted-foreground")}>
              {config.label} {config.name}
            </div>
            <div className="text-xs text-muted-foreground">{config.description}</div>
          </div>
        </button>

        {/* 开关 */}
        <button
          onClick={onToggle}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* 条件调节 */}
      {isActive && (
        <div className="p-4 space-y-4 border-t border-border/50">
          {poolKey === "C" ? (
            <>
              <NumberSlider
                label="好评率下限"
                value={(conditions as { minRating: number; maxRating: number; minReviews: number }).minRating}
                onChange={(v) => onConditionsChange({ ...conditions, minRating: v } as PoolConditions)}
                min={0}
                max={100}
                formatValue={(v) => `${v}%`}
                presets={[40, 50, 60, 70, 75, 80, 85]}
              />
              <NumberSlider
                label="好评率上限"
                value={(conditions as { minRating: number; maxRating: number; minReviews: number }).maxRating}
                onChange={(v) => onConditionsChange({ ...conditions, maxRating: v } as PoolConditions)}
                min={0}
                max={100}
                formatValue={(v) => `${v}%`}
                presets={[40, 50, 60, 70, 75, 80, 85]}
              />
              <NumberSlider
                label="最低评价数"
                value={(conditions as { minRating: number; maxRating: number; minReviews: number }).minReviews}
                onChange={(v) => onConditionsChange({ ...conditions, minReviews: v } as PoolConditions)}
                min={0}
                max={10000}
                step={10}
                formatValue={formatWan}
                presets={[50, 100, 200, 500, 1000]}
              />
            </>
          ) : (
            <>
              <NumberSlider
                label="好评率 ≥"
                value={conditions.minRating}
                onChange={(v) => onConditionsChange({ ...conditions, minRating: v })}
                min={0}
                max={100}
                formatValue={(v) => `${v}%`}
                presets={[40, 50, 60, 70, 75, 80, 85, 90]}
              />
              <NumberSlider
                label="最低评价数 ≥"
                value={conditions.minReviews}
                onChange={(v) => onConditionsChange({ ...conditions, minReviews: v })}
                min={0}
                max={10000}
                step={10}
                formatValue={formatWan}
                presets={[50, 100, 200, 500, 1000, 1500, 2000]}
              />
            </>
          )}
        </div>
      )}

      {/* 数量 */}
      <div className="px-4 py-3 border-t border-border/50 bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">符合条件的游戏</span>
          <span className={cn("text-lg font-bold tabular-nums", isActive ? config.textColor : "text-muted-foreground")}>
            {count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ 主页面 ============

export default function Mode2Page() {
  // 池子开关状态
  const [activePools, setActivePools] = useState<("A" | "B" | "C")[]>(["A", "B", "C"]);

  // 各池子的筛选条件（与 route.ts 中的默认值保持一致）
  // A池：好评率>=85%，评论数>=1000，年份>=2024
  // B池：好评率>=75%，评论数>=200
  // C池：好评率40-74%，评论数>=100
  const [poolAConditions, setPoolAConditions] = useState<PoolConditions>({ minRating: 85, minReviews: 1000 });
  const [poolBConditions, setPoolBConditions] = useState<PoolConditions>({ minRating: 75, minReviews: 200 });
  const [poolCConditions, setPoolCConditions] = useState<PoolConditions>({ minRating: 40, maxRating: 74, minReviews: 100 });

  // 统计信息
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [poolConfig, setPoolConfig] = useState<PoolConfig | null>(null);

  // 搜索结果
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [results, setResults] = useState<GameRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"wilson" | "rating" | "reviews" | "date">("wilson");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 已读状态管理
  const [readGameIds, setReadGameIds] = useState<Set<string>>(new Set());

  // 加载已读状态
  useEffect(() => {
    const loaded = new Set<string>();
    for (const game of results) {
      if (localStorage.getItem(`read-${game.id}`) === "true") {
        loaded.add(game.id);
      }
    }
    setReadGameIds(loaded);
  }, [results]);

  // 时间过滤 - 支持"近N年"快速筛选和自定义日期范围
  const [yearsFilter, setYearsFilter] = useState<number>(0); // 0 表示不过滤
  const [minReleaseDate, setMinReleaseDate] = useState<string | undefined>(undefined);
  const [maxReleaseDate, setMaxReleaseDate] = useState<string | undefined>(undefined);

  // 过滤测试版游戏（默认开启）
  const [excludeTestVersions, setExcludeTestVersions] = useState<boolean>(true);

  // 价格筛选状态
  const [priceMin, setPriceMin] = useState<number | undefined>(undefined);
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);
  const [priceStats, setPriceStats] = useState<PriceStats | null>(null);

  // 特色标签筛选（支持多选）
  const [modernTagFilter, setModernTagFilter] = useState<"hasCore" | "hasModern" | undefined>(undefined);
  const [featureTagFilters, setFeatureTagFilters] = useState<string[]>([]);
  const [featureTagOptions, setFeatureTagOptions] = useState<FeatureTagOption[]>([]);
  const [tagSortMode, setTagSortMode] = useState<"count" | "innovation">("count");
  const [featureTagSearch, setFeatureTagSearch] = useState("");

  // 切换单个标签的选中状态
  const toggleFeatureTag = (tagKey: string) => {
    setFeatureTagFilters(prev =>
      prev.includes(tagKey)
        ? prev.filter(k => k !== tagKey)
        : [...prev, tagKey]
    );
  };

  // 清除所有已选标签
  const clearAllFeatureTags = () => {
    setFeatureTagFilters([]);
  };

  // 评价来源筛选（默认全部）
  const [reviewSource, setReviewSource] = useState<ReviewSource>("all");

  const abortRef = useRef<AbortController | null>(null);
  const resultsAbortRef = useRef<AbortController | null>(null);

  // 快捷日期范围应用
  const applyQuickDateRange = (range: { years?: number; isBefore?: string }) => {
    if (range.years) {
      setYearsFilter(range.years);
      setMinReleaseDate(undefined);
      setMaxReleaseDate(undefined);
    } else if (range.isBefore) {
      setYearsFilter(0);
      setMinReleaseDate(undefined);
      setMaxReleaseDate(range.isBefore);
    }
  };

  // 清除日期筛选
  const clearDateFilter = () => {
    setYearsFilter(0);
    setMinReleaseDate(undefined);
    setMaxReleaseDate(undefined);
  };

  // 计算当前生效的日期范围
  const getActiveDateRangeLabel = () => {
    if (yearsFilter > 0) {
      return `近${yearsFilter}年内`;
    }
    if (minReleaseDate && maxReleaseDate) {
      return `${minReleaseDate} ~ ${maxReleaseDate}`;
    }
    if (minReleaseDate) {
      return `${minReleaseDate} 至今`;
    }
    if (maxReleaseDate) {
      return `~ ${maxReleaseDate}`;
    }
    return null;
  };

  // 切换池子
  const togglePool = (pool: "A" | "B" | "C") => {
    setActivePools((prev) =>
      prev.includes(pool) ? prev.filter((p) => p !== pool) : [...prev, pool]
    );
  };

  // 重置条件（与 route.ts 中的默认值保持一致）
  const resetConditions = () => {
    setPoolAConditions({ minRating: 85, minReviews: 1000 });
    setPoolBConditions({ minRating: 75, minReviews: 200 });
    setPoolCConditions({ minRating: 40, maxRating: 74, minReviews: 100 });
    setActivePools(["A", "B", "C"]);
    setYearsFilter(0);
    setMinReleaseDate(undefined);
    setMaxReleaseDate(undefined);
    setExcludeTestVersions(true);
    setPriceMin(undefined);
    setPriceMax(undefined);
    setModernTagFilter(undefined);
    setFeatureTagFilters([]);
    setFeatureTagOptions([]);
    setFeatureTagSearch("");
    setReviewSource("all");
  };

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    // 如果没有选中任何池子，清空统计
    if (activePools.length === 0) {
      setStats({ total: 0, totalTurnBased: 0, poolA: 0, poolB: 0, poolC: 0 });
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setIsLoadingStats(true);
    try {
      const params = new URLSearchParams();
      params.set("statsOnly", "true");
      // 传入池子筛选条件
      activePools.forEach((p) => params.append("pool", p));
      params.set("poolA_minRating", String(poolAConditions.minRating));
      params.set("poolA_minReviews", String(poolAConditions.minReviews));
      params.set("poolB_minRating", String(poolBConditions.minRating));
      params.set("poolB_minReviews", String(poolBConditions.minReviews));
      params.set("poolC_minRating", String(poolCConditions.minRating));
      params.set("poolC_maxRating", String((poolCConditions as { minRating: number; maxRating: number; minReviews: number }).maxRating));
      params.set("poolC_minReviews", String((poolCConditions as { minRating: number; maxRating: number; minReviews: number }).minReviews));
      if (yearsFilter > 0) {
        params.set("yearsFilter", String(yearsFilter));
      }
      if (minReleaseDate) {
        params.set("minReleaseDate", minReleaseDate);
      }
      if (maxReleaseDate) {
        params.set("maxReleaseDate", maxReleaseDate);
      }
      // 过滤测试版
      params.set("excludeTestVersions", String(excludeTestVersions));
      // 价格筛选
      if (priceMin !== undefined) params.set("priceMin", String(priceMin));
      if (priceMax !== undefined) params.set("priceMax", String(priceMax));
      // 特色标签筛选（发送中文标签名给后端）
      if (modernTagFilter) params.set("modernTagFilter", modernTagFilter);
      if (tagSortMode === "innovation") params.set("tagSortBy", "innovation");
      featureTagFilters.forEach(f => params.append("featureTagFilter", f));
      // 评价来源筛选
      if (reviewSource !== "all") params.set("reviewSource", reviewSource);

      const response = await fetch(`/api/mode2/filter?${params.toString()}`, {
        signal: ac.signal,
      });

      if (!response.ok) return;

      const data = await response.json();
      setStats(data.stats);
      setPoolConfig(data.poolConfig);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [activePools, poolAConditions, poolBConditions, poolCConditions, yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions, priceMin, priceMax, modernTagFilter, tagSortMode, featureTagFilters, reviewSource]);

  // 获取搜索结果
  const fetchResults = useCallback(async () => {
    if (activePools.length === 0) {
      setResults([]);
      setTotal(0);
      return;
    }

    resultsAbortRef.current?.abort();
    const ac = new AbortController();
    resultsAbortRef.current = ac;

    setIsLoadingResults(true);
    try {
      const params = new URLSearchParams();
      activePools.forEach((p) => params.append("pool", p));
      params.set("poolA_minRating", String(poolAConditions.minRating));
      params.set("poolA_minReviews", String(poolAConditions.minReviews));
      params.set("poolB_minRating", String(poolBConditions.minRating));
      params.set("poolB_minReviews", String(poolBConditions.minReviews));
      params.set("poolC_minRating", String(poolCConditions.minRating));
      params.set("poolC_maxRating", String((poolCConditions as { minRating: number; maxRating: number; minReviews: number }).maxRating));
      params.set("poolC_minReviews", String((poolCConditions as { minRating: number; maxRating: number; minReviews: number }).minReviews));
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", String(page));
      params.set("pageSize", "24");
      if (query.trim()) params.set("q", query.trim());
      if (yearsFilter > 0) {
        params.set("yearsFilter", String(yearsFilter));
      }
      if (minReleaseDate) {
        params.set("minReleaseDate", minReleaseDate);
      }
      if (maxReleaseDate) {
        params.set("maxReleaseDate", maxReleaseDate);
      }
      // 过滤测试版
      params.set("excludeTestVersions", String(excludeTestVersions));
      // 价格筛选
      if (priceMin !== undefined) params.set("priceMin", String(priceMin));
      if (priceMax !== undefined) params.set("priceMax", String(priceMax));
      // 特色标签筛选（发送中文标签名给后端）
      if (modernTagFilter) params.set("modernTagFilter", modernTagFilter);
      if (tagSortMode === "innovation") params.set("tagSortBy", "innovation");
      featureTagFilters.forEach(f => params.append("featureTagFilter", f));
      // 评价来源筛选
      if (reviewSource !== "all") params.set("reviewSource", reviewSource);

      const response = await fetch(`/api/mode2/filter?${params.toString()}`, {
        signal: ac.signal,
      });

      if (!response.ok) return;

      const data: FilterResponse = await response.json();
      setResults(data.results);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      // 同时更新池子统计
      if (data.stats) {
        setStats(data.stats);
      }
      // 更新价格统计
      if (data.priceStats) {
        setPriceStats(data.priceStats);
      }
      // 更新动态标签选项：当标签为空或第一页时更新
      // 注意：不能依赖 page 值，因为 useCallback 闭包捕获的是旧值
      if (data.featureTagOptions && data.results && data.results.length > 0) {
        setFeatureTagOptions(data.featureTagOptions);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to fetch results:", err);
    } finally {
      setIsLoadingResults(false);
    }
  }, [activePools, poolAConditions, poolBConditions, poolCConditions, sortBy, sortOrder, page, query, yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions, priceMin, priceMax, modernTagFilter, tagSortMode, featureTagFilters, reviewSource]);

  // 条件变化时获取统计
  useEffect(() => {
    const timer = setTimeout(fetchStats, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePools, poolAConditions, poolBConditions, poolCConditions, yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions, priceMin, priceMax, modernTagFilter, tagSortMode, featureTagFilters, reviewSource]);

  // 获取搜索结果
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePools, poolAConditions, poolBConditions, poolCConditions, sortBy, sortOrder, query, yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions, priceMin, priceMax, modernTagFilter, tagSortMode, featureTagFilters, reviewSource]);

  // 页码变化时获取结果
  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <main className="min-h-screen w-full min-w-0 bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="bg-[#171a21] border-b border-[#2a475e]/50">
        <div className="container mx-auto w-full min-w-0 px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="w-10 h-10 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">宝可梦Like游戏筛选器</h1>
                  <p className="text-sm text-[#8f98a0]">配置三池条件，找到有价值的参考游戏</p>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={resetConditions} className="gap-1.5 text-white border-white/20 hover:bg-white/10">
              <RotateCcw className="w-4 h-4" />
              重置条件
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto w-full min-w-0 px-4 py-8">
        {/* ========== 测试版过滤 + 价格筛选（紧凑横向布局） ========== */}
        <div className="bg-card rounded-xl border p-3 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 过滤测试版开关 */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">过滤测试版</span>
              <button
                onClick={() => setExcludeTestVersions(!excludeTestVersions)}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors text-[10px] font-medium",
                  excludeTestVersions ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {excludeTestVersions ? "开" : "关"}
              </button>
            </div>

            {/* 分隔线 */}
            <div className="w-px h-5 bg-border" />

            {/* 价格筛选 */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                <span className="text-green-600 font-bold text-xs">$</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">价格</span>
              <div className="flex gap-1">
                <button
                  onClick={() => { setPriceMin(undefined); setPriceMax(undefined); }}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    priceMin === undefined && priceMax === undefined
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  全部
                </button>
                <button
                  onClick={() => { setPriceMin(0); setPriceMax(0); }}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    priceMin === 0 && priceMax === 0
                      ? "bg-green-600 text-white"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  免费
                </button>
                <button
                  onClick={() => { setPriceMin(undefined); setPriceMax(10); }}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    priceMin === undefined && priceMax === 10
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  $10以下
                </button>
                <button
                  onClick={() => { setPriceMin(10); setPriceMax(30); }}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    priceMin === 10 && priceMax === 30
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  $10-30
                </button>
                <button
                  onClick={() => { setPriceMin(30); setPriceMax(undefined); }}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    priceMin === 30 && priceMax === undefined
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  $30以上
                </button>
              </div>
              {/* 价格区间显示 */}
              {(priceMin !== undefined || priceMax !== undefined) && (
                <span className="text-[10px] text-primary">
                  {priceMin !== undefined ? `$${priceMin}` : "$0"} - {priceMax !== undefined ? `$${priceMax}` : "不限"}
                </span>
              )}
            </div>

            {/* 价格统计信息（如果有） */}
            {priceStats && (
              <>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>均价 <span className="font-medium text-foreground">${priceStats.avg.toFixed(2)}</span></span>
                  <span>中位 <span className="font-medium text-foreground">${priceStats.median.toFixed(2)}</span></span>
                  <span>区间 <span className="font-medium text-foreground">${priceStats.min.toFixed(2)}-${priceStats.max.toFixed(2)}</span></span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ========== 三池配置区域 ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* A池 */}
          <PoolCard
            poolKey="A"
            config={POOL_CONFIG.A}
            isActive={activePools.includes("A")}
            onToggle={() => togglePool("A")}
            count={stats?.poolA ?? 0}
            conditions={poolAConditions}
            onConditionsChange={setPoolAConditions}
          />

          {/* B池 */}
          <PoolCard
            poolKey="B"
            config={POOL_CONFIG.B}
            isActive={activePools.includes("B")}
            onToggle={() => togglePool("B")}
            count={stats?.poolB ?? 0}
            conditions={poolBConditions}
            onConditionsChange={setPoolBConditions}
          />

          {/* C池 */}
          <PoolCard
            poolKey="C"
            config={POOL_CONFIG.C}
            isActive={activePools.includes("C")}
            onToggle={() => togglePool("C")}
            count={stats?.poolC ?? 0}
            conditions={poolCConditions}
            onConditionsChange={setPoolCConditions}
          />
        </div>

        {/* ========== 搜索与排序 ========== */}
        <div className="bg-card rounded-xl border p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* 搜索框 */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-muted-foreground/70" />
              </div>
              <Input
                type="text"
                placeholder="在结果中搜索游戏名称..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-12 h-11 bg-background"
              />
            </div>

            {/* 排序 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">排序：</span>
              <div className="flex rounded-lg border bg-muted/50 overflow-hidden">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value as typeof sortBy)}
                    className={cn(
                      "px-3 py-2 text-sm font-medium transition-all",
                      sortBy === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="px-3 py-2 rounded-lg border bg-muted/50 hover:bg-muted text-sm font-medium"
              >
                {sortOrder === "desc" ? "降序 ↓" : "升序 ↑"}
              </button>
            </div>
          </div>
        </div>

        {/* ========== 时间过滤 ========== */}
        <div className="bg-card rounded-xl border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">上线日期</span>

            {/* 快捷选项 */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DATE_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => applyQuickDateRange(range)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    (yearsFilter === range.years || (range.isBefore && maxReleaseDate === range.isBefore && !minReleaseDate))
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* 自定义日期选择 */}
            <div className="flex gap-2 items-center">
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-background text-sm text-left truncate hover:bg-accent/50 transition-colors">
                    <span className="text-muted-foreground mr-1">从</span>
                    <span className={minReleaseDate ? "text-foreground" : "text-muted-foreground"}>
                      {minReleaseDate || "不限"}
                    </span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="z-50 bg-background border rounded-xl shadow-xl p-4" align="start">
                    <DayPicker
                      mode="single"
                      selected={minReleaseDate ? new Date(minReleaseDate) : undefined}
                      onSelect={(date) => {
                        setYearsFilter(0);
                        setMinReleaseDate(date ? format(date, "yyyy-MM-dd") : undefined);
                      }}
                      locale={zhCN}
                      disabled={{ after: new Date() }}
                      fromYear={2000}
                      toDate={new Date()}
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              <span className="text-muted-foreground">-</span>

              <Popover.Root>
                <Popover.Trigger asChild>
                  <button className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-background text-sm text-left truncate hover:bg-accent/50 transition-colors">
                    <span className="text-muted-foreground mr-1">至</span>
                    <span className={maxReleaseDate ? "text-foreground" : "text-muted-foreground"}>
                      {maxReleaseDate || "不限"}
                    </span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="z-50 bg-background border rounded-xl shadow-xl p-4" align="start">
                    <DayPicker
                      mode="single"
                      selected={maxReleaseDate ? new Date(maxReleaseDate) : undefined}
                      onSelect={(date) => {
                        setYearsFilter(0);
                        setMaxReleaseDate(date ? format(date, "yyyy-MM-dd") : undefined);
                      }}
                      locale={zhCN}
                      disabled={{ after: new Date() }}
                      fromYear={2000}
                      toDate={new Date()}
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>

            {/* 清空按钮 */}
            {(yearsFilter > 0 || minReleaseDate || maxReleaseDate) && (
              <button
                onClick={clearDateFilter}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                清空
              </button>
            )}
          </div>

          {/* 当前筛选范围显示 */}
          {getActiveDateRangeLabel() && (
            <div className="flex items-center gap-2 text-xs text-primary mt-3 ml-9">
              <Calendar className="w-3 h-3" />
              <span>{getActiveDateRangeLabel()}</span>
            </div>
          )}
        </div>

        {/* ========== 特色标签筛选（分组展示 + 搜索）========== */}
        <div className="bg-card rounded-xl border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">创新融合标签</span>
            <span className="text-[10px] text-muted-foreground/60 italic ml-1">
              (从B池成功游戏中自动提取，按玩法类型分组)
            </span>

            {/* 小众创新模式切换按钮 */}
            <button
              onClick={() => setTagSortMode(tagSortMode === "count" ? "innovation" : "count")}
              className={cn(
                "ml-auto px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                tagSortMode === "innovation"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              title={tagSortMode === "innovation" ? "点击切换为按数量排序" : "点击切换为小众创新模式（好评率高+小众优先）"}
            >
              {tagSortMode === "innovation" ? (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  小众创新模式
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  按数量排序
                </span>
              )}
            </button>

            {/* 特色标签快捷筛选 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setModernTagFilter(undefined)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  modernTagFilter === undefined
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                全部
              </button>
              <button
                onClick={() => setModernTagFilter("hasCore")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  modernTagFilter === "hasCore"
                    ? "bg-amber-500 text-white shadow-md"
                    : "bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}
              >
                核心竞品
              </button>
              <button
                onClick={() => setModernTagFilter("hasModern")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  modernTagFilter === "hasModern"
                    ? "bg-purple-600 text-white shadow-md"
                    : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                )}
              >
                有创新融合
              </button>
            </div>

            {/* 标签总数统计 */}
            {featureTagOptions.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
                当前池子共有 <span className="font-medium text-foreground">{(() => {
                  // 计算激活池子中的总标签数
                  let totalTags = 0;
                  for (const tag of featureTagOptions) {
                    if (!tag.poolDistribution) continue;
                    const { A, B, C } = tag.poolDistribution;
                    const activeCount =
                      (activePools.includes("A") ? A : 0) +
                      (activePools.includes("B") ? B : 0) +
                      (activePools.includes("C") ? C : 0);
                    if (activeCount > 0) totalTags++;
                  }
                  return totalTags;
                })()}</span> 个特色标签
              </span>
            )}
          </div>

          {/* 已选标签展示区域 */}
          {featureTagFilters.length > 0 && (
            <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200/50 dark:border-purple-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  已选标签 ({featureTagFilters.length})
                </span>
                <button
                  onClick={clearAllFeatureTags}
                  className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 underline"
                >
                  清除全部
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {featureTagFilters.map(filterKey => {
                  const tag = featureTagOptions.find(t => t.tag === filterKey);
                  if (!tag) return null;
                  const dist = tag.poolDistribution;
                  const poolParts: string[] = [];
                  if (activePools.includes("A") && dist && dist.A > 0) poolParts.push(`A池${dist.A}款`);
                  if (activePools.includes("B") && dist && dist.B > 0) poolParts.push(`B池${dist.B}款`);
                  if (activePools.includes("C") && dist && dist.C > 0) poolParts.push(`C池${dist.C}款`);
                  const poolInfo = poolParts.length > 0 ? poolParts.join(" · ") : "";

                  return (
                    <button
                      key={filterKey}
                      onClick={() => toggleFeatureTag(filterKey)}
                      title={`点击取消选择`}
                      className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      <span>{tag.label}</span>
                      <X className="w-3 h-3" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 标签搜索框 */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-muted-foreground/70" />
            </div>
            <input
              type="text"
              placeholder="搜索标签名称..."
              value={featureTagSearch}
              onChange={(e) => setFeatureTagSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {featureTagSearch && (
              <button
                onClick={() => setFeatureTagSearch("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 标签分组展示 */}
          <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2">
            {(() => {
              // 标签分组定义
              const TAG_GROUPS = [
                {
                  key: 'card', name: '卡牌玩法', icon: '🎴', color: 'bg-blue-500/10 text-blue-600',
                  keywords: ['肉鸽', '牌组', '卡牌', '手牌', '集换', '塔防', '纸牌']
                },
                {
                  key: 'battle', name: '战斗系统', icon: '⚔️', color: 'bg-red-500/10 text-red-600',
                  keywords: ['自动战斗', '弱点追击', '潜行', 'ATB', '即时', '战术', '回合']
                },
                {
                  key: 'narrative', name: '叙事玩法', icon: '📖', color: 'bg-amber-500/10 text-amber-600',
                  keywords: ['叙事', '剧情', '分支', '网状', 'CRPG', '视觉小说', 'Story Rich']
                },
                {
                  key: 'raising', name: '养成系统', icon: '🧬', color: 'bg-emerald-500/10 text-emerald-600',
                  keywords: ['阵营', '生物', '怪物', '交涉', '招募', '派系', '好感', '基因', '合成']
                },
                {
                  key: 'build', name: '构筑系统', icon: '🔧', color: 'bg-cyan-500/10 text-cyan-600',
                  keywords: ['构筑', 'Build', '职业', '特性', '羁绊', '背包', '队伍构建', '配队']
                },
                {
                  key: 'building', name: '建造经营', icon: '🏗️', color: 'bg-orange-500/10 text-orange-600',
                  keywords: ['建造', '经营', '基地', '农场', '牧场', '公会', '资源', '模拟']
                },
                {
                  key: 'exploration', name: '探索系统', icon: '🗺️', color: 'bg-teal-500/10 text-teal-600',
                  keywords: ['探索', '地牢', '爬塔', '银河恶魔城', '开放世界', '程序生成']
                },
                {
                  key: 'collection', name: '收集驱动', icon: '💎', color: 'bg-violet-500/10 text-violet-600',
                  keywords: ['刷宝', '装备', '素材', '收集', '技能继承']
                },
                {
                  key: 'strategy', name: '策略系统', icon: '♟️', color: 'bg-slate-500/10 text-slate-600',
                  keywords: ['战棋', '策略', '网格', '博弈', '棋盘', '双单位']
                },
                {
                  key: 'social', name: '社交系统', icon: '👥', color: 'bg-pink-500/10 text-pink-600',
                  keywords: ['MMO', '多人', '异步', '社交', '竞技', '协作']
                },
                {
                  key: 'puzzle', name: '解谜系统', icon: '🧩', color: 'bg-indigo-500/10 text-indigo-600',
                  keywords: ['解谜', '推理', '案件', '物理解谜', '骇客']
                },
                {
                  key: 'rhythm', name: '时间节奏', icon: '⏱️', color: 'bg-rose-500/10 text-rose-600',
                  keywords: ['时间管理', 'QTE', '节奏']
                },
                {
                  key: 'other', name: '其他玩法', icon: '✨', color: 'bg-gray-500/10 text-gray-600',
                  keywords: []
                },
              ];

              // 过滤标签
              const searchLower = featureTagSearch.toLowerCase().trim();
              const filteredOptions = searchLower
                ? featureTagOptions.filter(tag =>
                    tag.label.toLowerCase().includes(searchLower) ||
                    tag.tag.toLowerCase().includes(searchLower)
                  )
                : featureTagOptions;

              // ============ 根据激活的池子过滤标签 ============
              // 只显示在至少一个激活池子中有分布的标签
              const visibleTagOptions = filteredOptions
                .map(tag => {
                  if (!tag.poolDistribution) return tag;
                  const { A, B, C } = tag.poolDistribution;
                  // 计算激活池子中的总数量
                  const activeCount =
                    (activePools.includes("A") ? A : 0) +
                    (activePools.includes("B") ? B : 0) +
                    (activePools.includes("C") ? C : 0);
                  // 返回更新后的标签（只显示激活池子的分布）
                  return {
                    ...tag,
                    gameCount: activeCount,
                    count: activeCount,
                    poolDistribution: {
                      A: activePools.includes("A") ? A : 0,
                      B: activePools.includes("B") ? B : 0,
                      C: activePools.includes("C") ? C : 0,
                    },
                  };
                })
                .filter(tag => {
                  // 过滤掉没有任何激活池子分布的标签
                  if (!tag.poolDistribution) return true;
                  const { A, B, C } = tag.poolDistribution;
                  return (
                    (activePools.includes("A") && A > 0) ||
                    (activePools.includes("B") && B > 0) ||
                    (activePools.includes("C") && C > 0)
                  );
                });

              // 同义词合并映射（废弃标签 → 保留标签）
              // 来源: @/lib/tag-config（由 manage_tags.py --export-config 生成）
              // 已通过 import 导入，直接使用 SYNONYM_MERGE 常量
              // （不再在此处定义，删除了 ~80 行硬编码副本）

              // ============ 分组 & 同义词合并 ============
              const grouped: Record<string, typeof featureTagOptions> = {};
              const uncategorized: typeof featureTagOptions = [];

              for (const tag of visibleTagOptions) {
                let matched = false;
                for (const group of TAG_GROUPS) {
                  if (group.key === 'other') continue;
                  if (group.keywords.some(kw => tag.label.includes(kw) || tag.tag.toLowerCase().includes(kw.toLowerCase()))) {
                    if (!grouped[group.key]) grouped[group.key] = [];
                    grouped[group.key].push(tag);
                    matched = true;
                    break;
                  }
                }
                if (!matched) {
                  uncategorized.push(tag);
                }
              }

              // 对每个分组内的标签做同义词合并（废弃标签合并到保留标签，累加 count 和创新指数）
              for (const groupKey of Object.keys(grouped)) {
                const tags = grouped[groupKey];
                const merged: Record<string, typeof featureTagOptions[0]> = {};
                for (const t of tags) {
                  const target = TAG_SYNONYM_MERGE[t.label];
                  const key = target || t.label;
                  const finalTag = target || t.tag;
                  if (merged[key]) {
                    merged[key].count += t.count;
                    merged[key].gameCount += t.gameCount || 0;
                    // 合并创新指数（取加权平均值）
                    const totalGames = (merged[key].totalPositive ?? 0) + (t.totalPositive ?? 0);
                    if (totalGames > 0) {
                      merged[key].totalPositive = (merged[key].totalPositive ?? 0) + (t.totalPositive ?? 0);
                      merged[key].totalNegative = (merged[key].totalNegative ?? 0) + (t.totalNegative ?? 0);
                      const mergedRate = merged[key].totalPositive! / (merged[key].totalPositive! + merged[key].totalNegative!);
                      const tRate = (t.totalPositive ?? 0) / ((t.totalPositive ?? 0) + (t.totalNegative ?? 0) || 1);
                      // 简化：直接使用加权好评率
                      const coverage = merged[key].coverage ?? 1;
                      merged[key].positiveRate = Math.round(mergedRate * 100);
                      merged[key].innovationScore = Math.round(((merged[key].positiveRate ?? 0) / 100) * (1 / Math.log(coverage + 2)) * 10000) / 100;
                    }
                  } else {
                    merged[key] = {
                      ...t,
                      key,
                      label: target || t.label,
                      tag: finalTag,
                    };
                  }
                }
                // 根据 tagSortMode 排序
                if (tagSortMode === "innovation") {
                  grouped[groupKey] = Object.values(merged).sort((a, b) => (b.innovationScore ?? 0) - (a.innovationScore ?? 0));
                } else {
                  grouped[groupKey] = Object.values(merged).sort((a, b) => b.count - a.count);
                }
              }

              if (grouped['other']) {
                // uncategorized 也按当前排序模式排序
                if (tagSortMode === "innovation") {
                  grouped['other'] = [...(grouped['other'] || []), ...uncategorized].sort((a, b) => (b.innovationScore ?? 0) - (a.innovationScore ?? 0));
                } else {
                  grouped['other'] = [...(grouped['other'] || []), ...uncategorized].sort((a, b) => b.count - a.count);
                }
              } else if (uncategorized.length > 0) {
                if (tagSortMode === "innovation") {
                  grouped['other'] = uncategorized.sort((a, b) => (b.innovationScore ?? 0) - (a.innovationScore ?? 0));
                } else {
                  grouped['other'] = uncategorized.sort((a, b) => b.count - a.count);
                }
              }

              const hasResults = visibleTagOptions.length > 0;

              // 计算隐藏了多少标签
              const hiddenCount = filteredOptions.length - visibleTagOptions.length;

              return (
                <>
                  {!hasResults ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      {activePools.length === 0
                        ? '请至少选择一个池子以查看标签'
                        : featureTagSearch
                          ? `未找到包含"${featureTagSearch}"的标签`
                          : '加载中...'}
                    </div>
                  ) : (
                    <>
                      {/* 隐藏标签提示 */}
                      {hiddenCount > 0 && (
                        <div className="mb-3 px-3 py-2 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            隐藏了 {hiddenCount} 个不在当前选中池子中的标签
                          </span>
                        </div>
                      )}
                      {TAG_GROUPS.map(group => {
                        const tags = grouped[group.key] || [];
                        if (tags.length === 0 && searchLower) return null;

                        const totalCount = tags.reduce((sum, t) => sum + (t.gameCount || 0), 0);

                        return (
                          <div key={group.key} className="border rounded-lg overflow-hidden">
                            {/* 分组标题 */}
                            <button
                              onClick={() => {
                                const el = document.getElementById(`tag-group-${group.key}`);
                                if (el) {
                                  el.classList.toggle('hidden');
                                }
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{group.name}</span>
                                <span className="text-xs text-muted-foreground">({tags.length}个标签, {totalCount}款游戏)</span>
                              </div>
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </button>

                            {/* 标签列表 */}
                            <div id={`tag-group-${group.key}`} className="px-3 pb-3 flex flex-wrap gap-2">
                              {tags.length === 0 ? (
                                <span className="text-xs text-muted-foreground/50 py-2">无</span>
                              ) : (
                                tags.map((tag) => {
                                  const dist = tag.poolDistribution;
                                  const poolParts: string[] = [];
                                  // 只显示激活池子的分布
                                  if (activePools.includes("A") && dist && dist.A > 0) poolParts.push(`A池${dist.A}款`);
                                  if (activePools.includes("B") && dist && dist.B > 0) poolParts.push(`B池${dist.B}款`);
                                  if (activePools.includes("C") && dist && dist.C > 0) poolParts.push(`C池${dist.C}款`);
                                  const poolInfo = poolParts.length > 0 ? poolParts.join(" · ") : "暂无分布";

                                  // 小众创新模式下的额外信息
                                  const showInnovation = tagSortMode === "innovation" && tag.innovationScore !== undefined;
                                  const positiveRate = tag.positiveRate;
                                  const innovationScore = tag.innovationScore;

                                  return (
                                    <button
                                      key={tag.key}
                                      onClick={() => toggleFeatureTag(tag.tag)}
                                      title={`${tag.tag} · ${poolInfo} · 覆盖率${tag.coverage}%${positiveRate !== undefined ? ` · 好评率${positiveRate}%` : ''}${innovationScore !== undefined ? ` · 创新指数${innovationScore}` : ''}`}
                                      className={cn(
                                        "group px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all flex flex-col items-start",
                                        featureTagFilters.includes(tag.tag)
                                          ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-400/50"
                                          : "bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 border border-purple-200/50 dark:border-purple-700/50"
                                      )}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span>{tag.label}</span>
                                        <span className={cn(
                                          "text-[10px] font-normal tabular-nums",
                                          featureTagFilters.includes(tag.tag) ? "text-purple-200" : "text-purple-400 group-hover:text-purple-500 dark:text-purple-500"
                                        )}>
                                          {tag.gameCount}款
                                        </span>
                                        {/* 小众创新模式下的创新标签标识 */}
                                        {showInnovation && (innovationScore ?? 0) > INNOVATION_THRESHOLDS.minInnovationScore && (
                                          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-full font-medium">
                                            创新
                                          </span>
                                        )}
                                      </div>
                                      {/* 小众创新模式：显示好评率和创新指数 */}
                                      {showInnovation && positiveRate !== undefined && (
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className={cn(
                                            "text-[10px]",
                                            featureTagFilters.includes(tag.tag) ? "text-purple-200" : "text-emerald-600 dark:text-emerald-400"
                                          )}>
                                            好评{positiveRate}%
                                          </span>
                                          <span className={cn(
                                            "text-[10px]",
                                            featureTagFilters.includes(tag.tag) ? "text-purple-200" : "text-amber-600 dark:text-amber-400"
                                          )}>
                                            指数{innovationScore?.toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* ========== 评价来源筛选 ========== */}
        <div className="bg-card rounded-xl border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">评价来源</span>
            <span className="text-[10px] text-muted-foreground/60 italic ml-1">
              (按国内/海外评价分别筛选和计算)
            </span>

            {/* 评价来源快捷筛选 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setReviewSource("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  reviewSource === "all"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                全部
              </button>
              <button
                onClick={() => setReviewSource("cn")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  reviewSource === "cn"
                    ? "bg-red-500 text-white shadow-md"
                    : "bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}
              >
                国内评价
              </button>
              <button
                onClick={() => setReviewSource("overseas")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  reviewSource === "overseas"
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                )}
              >
                海外评价
              </button>
            </div>

            {/* 当前筛选来源显示 */}
            {reviewSource !== "all" && (
              <span className="text-xs text-primary">
                当前显示: {reviewSource === "cn" ? "国内" : "海外"}评价数据
              </span>
            )}
          </div>
        </div>

        {/* ========== 结果统计 ========== */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {isLoadingStats && (
              <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            )}
            <span className="font-medium">
              回合制游戏共 <span className="text-primary text-lg">{stats?.totalTurnBased?.toLocaleString() ?? 0}</span> 款
              {yearsFilter > 0 && (
                <span className="text-muted-foreground ml-1">
                  (近{yearsFilter}年内 <span className="text-primary">{stats?.totalTurnBased?.toLocaleString() ?? 0}</span> 款)
                </span>
              )}
            </span>
            <span className="font-medium ml-4">
              符合条件 <span className="text-primary text-lg">{total.toLocaleString()}</span> 款
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>A池: {stats?.poolA.toLocaleString() ?? 0}</span>
            <span>B池: {stats?.poolB.toLocaleString() ?? 0}</span>
            <span>C池: {stats?.poolC.toLocaleString() ?? 0}</span>
          </div>
        </div>

        {/* ========== 加载状态 ========== */}
        {isLoadingResults && (
          <div className="py-12 text-center">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              加载中...
            </span>
          </div>
        )}

        {/* ========== 结果列表 ========== */}
        {!isLoadingResults && results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {results.map((game) => (
              <GameCard key={game.id} game={game} reviewSource={reviewSource} isRead={readGameIds.has(game.id)} />
            ))}
          </div>
        )}

        {/* ========== 空状态 ========== */}
        {!isLoadingResults && activePools.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <EyeOff className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg text-muted-foreground">请至少选择一个池子</p>
            <p className="text-sm mt-1 text-muted-foreground/70">点击上方池子卡片启用筛选</p>
          </div>
        )}

        {!isLoadingResults && results.length === 0 && activePools.length > 0 && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg text-muted-foreground">未找到匹配的游戏</p>
            <p className="text-sm mt-1 text-muted-foreground/70">尝试调整池子的筛选条件</p>
          </div>
        )}

        {/* ========== 分页 ========== */}
        {totalPages > 1 && !isLoadingResults && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {page} / {totalPages} 页
            </span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ========== 说明文档 ========== */}
        <div className="mt-12 p-6 bg-card rounded-xl border">
          <h2 className="text-lg font-semibold mb-4">三池筛选系统说明</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <h3 className="font-medium text-amber-500">A池 - 神作参考池</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                2024年后上线的高分回合制游戏，好评率≥85%，评论数&gt;1000。调整好评率和评价数门槛来控制结果范围。
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-emerald-500" />
                <h3 className="font-medium text-emerald-500">B池 - 核心竞品池</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                具备&quot;生物收集/怪物捕捉&quot;玩法的宝可梦Like游戏，成功案例。拆解它们为什么能成功。
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="font-medium text-rose-500">C池 - 避坑指南池</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                宝可梦Like但评价中等的游戏。不用去玩它们，去读差评！你会立刻知道玩家最讨厌什么。
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium mb-2">威尔逊得分</h3>
            <p className="text-sm text-muted-foreground">
              排序默认使用威尔逊得分，这是更准确的好评率评估算法。考虑评价数量的置信度，避免10个人100%好评排在前面的问题。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
