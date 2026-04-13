import Image from "next/image";
import { Star, Users, Calendar, Gamepad2, Building2 } from "lucide-react";
import { Game } from "@/types/game";
import { cn } from "@/lib/utils";
import { resolveSteamHeaderImageUrl } from "@/lib/steam-header-image";

interface GameInfoProps {
  game: Game;
  className?: string;
}

/**
 * Hero 风格游戏信息展示组件
 * 包含全宽背景图、游戏标题、核心数据指标
 */
export function GameInfo({ game, className }: GameInfoProps) {
  const reviewPercentage = game.steamReviews
    ? Math.round((game.steamReviews.totalPositive / game.steamReviews.totalReviews) * 100)
    : null;

  const headerSrc = resolveSteamHeaderImageUrl(game);

  return (
    <div className={cn("relative -mx-4 -mt-4", className)}>
      {/* Hero 背景区域 */}
      <div className="relative h-[320px] md:h-[400px] overflow-hidden">
        {/* 背景图片 */}
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

        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1923] via-[#0f1923]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1923]/80 via-transparent to-transparent" />

        {/* 游戏封面缩略图 */}
        <div className="absolute left-6 bottom-6 md:left-10 md:bottom-10">
          <div className="relative w-28 h-40 md:w-36 md:h-52 rounded-lg overflow-hidden shadow-2xl ring-2 ring-white/10">
            {headerSrc ? (
              <Image
                src={headerSrc}
                alt={game.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1b2838]">
                <Gamepad2 className="w-12 h-12 text-[#66c0f4]" />
              </div>
            )}
          </div>
        </div>

        {/* 游戏标题和信息 */}
        <div className="absolute left-[140px] md:left-[180px] bottom-6 md:left-[200px] right-6">
          <div className="space-y-3">
            {/* 游戏名称 */}
            <h1 className="text-2xl md:text-4xl font-bold text-white drop-shadow-lg">
              {game.name}
            </h1>

            {/* 类型标签 */}
            <div className="flex flex-wrap gap-2">
              {game.genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="px-3 py-1 text-xs font-medium bg-white/10 backdrop-blur-sm rounded-full text-white/90 border border-white/20"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* 开发商信息 */}
            <div className="flex items-center gap-4 text-sm text-white/60">
              {game.developers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  <span>{game.developers[0]}</span>
                </div>
              )}
              {game.releaseDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(game.releaseDate).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 核心数据指标条 */}
      <div className="bg-[#0f1923] border-t border-[#2a475e]/50">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 好评率 */}
            {reviewPercentage !== null && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-[#1b2838]/50 border border-[#2a475e]/30">
                <div className={cn(
                  "flex items-center justify-center w-14 h-14 rounded-lg",
                  reviewPercentage >= 90 && "bg-green-500/20",
                  reviewPercentage >= 70 && reviewPercentage < 90 && "bg-yellow-500/20",
                  reviewPercentage < 70 && "bg-red-500/20"
                )}>
                  <span className={cn(
                    "text-xl font-bold",
                    reviewPercentage >= 90 && "text-green-400",
                    reviewPercentage >= 70 && reviewPercentage < 90 && "text-yellow-400",
                    reviewPercentage < 70 && "text-red-400"
                  )}>
                    {reviewPercentage}%
                  </span>
                </div>
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider">好评率</p>
                  <p className="text-lg font-semibold text-white">
                    {(game.steamReviews?.totalReviews ?? 0).toLocaleString("zh-CN")}
                    <span className="text-xs text-white/50 ml-1">条评价</span>
                  </p>
                </div>
              </div>
            )}

            {/* MC 评分 */}
            {game.metacriticScore && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-[#1b2838]/50 border border-[#2a475e]/30">
                <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-orange-500/20">
                  <span className="text-xl font-bold text-orange-400">{game.metacriticScore}</span>
                </div>
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider">Metacritic</p>
                  <p className="text-lg font-semibold text-white">
                    {game.metacriticScore >= 75 ? "好评" : game.metacriticScore >= 50 ? "褒贬不一" : "差评"}
                  </p>
                </div>
              </div>
            )}

            {/* 标签数量 */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-[#1b2838]/50 border border-[#2a475e]/30">
              <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-purple-500/20">
                <span className="text-xl font-bold text-purple-400">{game.tags.length}</span>
              </div>
              <div>
                <p className="text-xs text-white/50 uppercase tracking-wider">游戏标签</p>
                <p className="text-lg font-semibold text-white">相关标签</p>
              </div>
            </div>

            {/* 查看详情 */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-[#66c0f4]/10 border border-[#66c0f4]/30">
              <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-[#66c0f4]/20">
                <Star className="w-6 h-6 text-[#66c0f4]" />
              </div>
              <div>
                <p className="text-xs text-white/50 uppercase tracking-wider">LLM</p>
                <p className="text-lg font-semibold text-[#66c0f4]">智能分析</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
