import Image from "next/image";
import { Calendar, Building2, ExternalLink, Users, Crown, Gamepad2, AlertTriangle } from "lucide-react";
import { Game } from "@/types/game";
import { resolveSteamHeaderImageUrl } from "@/lib/steam-header-image";

interface GameInfoProps {
  game: Game;
  className?: string;
}

// 池子配置
const POOL_CONFIG = {
  A: { label: "A池", name: "神作参考", icon: Crown, color: "text-amber-400", bg: "bg-amber-400/10" },
  B: { label: "B池", name: "核心竞品", icon: Crown, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  C: { label: "C池", name: "避坑指南", icon: AlertTriangle, color: "text-rose-400", bg: "bg-rose-400/10" },
};

/**
 * 游戏详情 Hero 区域
 * 简洁高级设计，移除廉价边框，使用留白分隔
 */
export function GameInfo({ game, className }: GameInfoProps) {
  const reviewPercentage = game.steamReviews
    ? Math.round((game.steamReviews.totalPositive / game.steamReviews.totalReviews) * 100)
    : null;

  const headerSrc = resolveSteamHeaderImageUrl(game);

  // 价格显示
  const priceDisplay = game.isFree
    ? "免费"
    : game.price > 0
      ? `¥${(game.price * 7).toFixed(0)}`
      : "未知";

  // 游玩方式（确保是数组）
  const playModes = Array.isArray(game.categories) ? game.categories : [];
  const isMultiplayer = playModes.some(c => typeof c === "string" && (c.includes("Multi") || c.includes("Co-op")));
  // 类型检查：genres 也可能不是数组
  const genres = Array.isArray(game.genres) ? game.genres : [];
  const isCardGame = genres.some(g => typeof g === "string" && (g.includes("卡牌") || g.includes("Card")));

  return (
    <div className={className}>
      {/* Hero 背景 */}
      <div className="relative h-[340px] md:h-[400px] overflow-hidden">
        {headerSrc ? (
          <Image
            src={headerSrc}
            alt={game.name}
            fill
            className="object-cover object-top"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1b2838] to-[#2a475e]" />
        )}

        {/* 渐变遮罩 - 更柔和 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1520] via-[#0d1520]/40 to-transparent" />

        {/* 主内容区 */}
        <div className="absolute inset-0 flex">
          {/* 左侧 - 封面 */}
          <div className="self-end pb-10 pl-8 md:pl-12">
            <div className="relative w-28 h-40 md:w-36 md:h-52 rounded-lg overflow-hidden shadow-2xl">
              {headerSrc ? (
                <Image
                  src={headerSrc}
                  alt={game.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1b2838]">
                  <span className="text-white/20 text-5xl font-bold">{game.name[0]}</span>
                </div>
              )}
            </div>
          </div>

          {/* 右侧 - 信息 */}
          <div className="flex-1 self-end pb-10 pl-6 md:pl-10 pr-8 md:pr-12">
            <div className="max-w-3xl">
              <h1 className="text-xl md:text-3xl font-bold text-white mb-3 tracking-tight">
                {game.name}
              </h1>

              {/* 类型标签 */}
              {game.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {game.genres.slice(0, 3).map((genre) => (
                    <span
                      key={genre}
                      className="text-xs text-white/60 bg-white/5 px-2.5 py-1 rounded-full"
                    >
                      {genre}
                    </span>
                  ))}
                  {isMultiplayer && (
                    <span className="text-xs text-white/60 bg-white/5 px-2.5 py-1 rounded-full">
                      多人
                    </span>
                  )}
                </div>
              )}

              {/* 基本信息行 */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/40">
                {game.developers[0] && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {game.developers[0]}{game.developers.length > 1 && ` 等`}
                  </span>
                )}
                {game.releaseDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(game.releaseDate).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
                <span className="text-white/30">{priceDisplay}</span>
                <a
                  href={game.steamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[#66c0f4]/70 hover:text-[#66c0f4] transition-colors"
                >
                  Steam
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 右上角 - 池子标签 */}
        {game.pool && POOL_CONFIG[game.pool] && (
          <div className={`absolute top-6 right-8 ${POOL_CONFIG[game.pool].bg} ${POOL_CONFIG[game.pool].color} px-3 py-1.5 rounded-full text-xs font-medium`}>
            {POOL_CONFIG[game.pool].label} · {POOL_CONFIG[game.pool].name}
          </div>
        )}
      </div>

      {/* 数据指标条 - 更简洁的展示 */}
      <div className="bg-[#0d1520]">
        <div className="container mx-auto px-8 py-6">
          <div className="flex flex-wrap gap-8 md:gap-16">
            {/* 好评率 */}
            {reviewPercentage !== null && (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5">
                  <span className={`text-base font-semibold ${
                    reviewPercentage >= 90 ? "text-emerald-400" :
                    reviewPercentage >= 70 ? "text-amber-400" : "text-rose-400"
                  }`}>
                    {reviewPercentage}%
                  </span>
                </div>
                <div>
                  <p className="text-xs text-white/40">好评率</p>
                  <p className="text-sm text-white/70">
                    {(game.steamReviews?.totalReviews ?? 0).toLocaleString("zh-CN")} 条评价
                  </p>
                </div>
              </div>
            )}

            {/* 同时在线峰值 */}
            {game.peakCCU && game.peakCCU > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5">
                  <Users className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <p className="text-xs text-white/40">峰值在线</p>
                  <p className="text-sm text-white/70">
                    {game.peakCCU.toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            )}

            {/* 标签 */}
            {game.pokemonLikeTags && game.pokemonLikeTags.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5">
                  <Gamepad2 className="w-5 h-5 text-white/50" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {game.pokemonLikeTags.slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 评分描述 */}
            {game.steamReviews?.reviewScoreDescription && (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5">
                  <span className="text-xs text-white/40">Steam</span>
                </div>
                <div>
                  <p className="text-xs text-white/40">评价等级</p>
                  <p className="text-sm text-white/70">{game.steamReviews.reviewScoreDescription}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}