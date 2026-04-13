"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Users, Gamepad2, ChevronRight, Trophy, ExternalLink, Info } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Game } from "@/types/game";
import { cn } from "@/lib/utils";
import { resolveSteamHeaderImageUrl } from "@/lib/steam-header-image";

interface GameCardProps {
  game: Game;
  className?: string;
}

/** 万为单位展示（整数万） */
function formatWan(n: number): string {
  if (n >= 100_000_000) {
    const x = n / 100_000_000;
    const s = (x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, "");
    return `${s}亿`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 10_000)}万`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  return String(n);
}

/** 玩家规模：有区间则显示区间估算值 */
function formatOwnersDisplay(game: Game): string {
  const min = game.estimatedOwnersMin;
  const max = game.estimatedOwnersMax;
  if (
    typeof min === "number" &&
    typeof max === "number" &&
    min > 0 &&
    max > 0 &&
    min !== max
  ) {
    return `${formatWan(min)}–${formatWan(max)}`;
  }
  const n = game.estimatedOwners ?? 0;
  return n === 0 ? "玩家数未知" : `${formatWan(n)}玩家`;
}

/** 好评率 */
function getPositiveRate(game: Game): number | null {
  if (game.steamReviews && game.steamReviews.totalReviews > 0) {
    return Math.round(
      (game.steamReviews.totalPositive / game.steamReviews.totalReviews) * 100
    );
  }
  return null;
}

/** 去除 HTML 标签与实体，保留换行 */
function stripHtml(raw: string): string {
  return raw
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
}

/** 完整纯文本描述 */
function getFullDescription(game: Game): string {
  const raw = game.description || game.shortDescription || "";
  return stripHtml(raw);
}

/** 卡片内截断简介（无弹窗时正常截断，有弹窗时不截断） */
function getCardDescription(game: Game, maxLen = 150): string {
  const full = getFullDescription(game);
  if (!full) return "";
  return full.length > maxLen
    ? full.slice(0, maxLen).trimEnd() + "…"
    : full;
}

/** Metacritic 评分 */
function getMetacritic(game: Game): number | null {
  return game.metacriticScore ?? null;
}

export function GameCard({ game, className }: GameCardProps) {
  const positiveRate = getPositiveRate(game);
  const metacritic = getMetacritic(game);

  const displayScore =
    positiveRate !== null
      ? `${positiveRate}%`
      : metacritic !== null
        ? `${metacritic}`
        : null;

  const scoreColor =
    positiveRate !== null
      ? positiveRate >= 90
        ? "text-green-600"
        : positiveRate >= 70
          ? "text-yellow-600"
          : "text-red-600"
      : "text-primary";

  const ScoreIcon = positiveRate !== null ? Star : metacritic !== null ? Trophy : null;

  const headerSrc = resolveSteamHeaderImageUrl(game);

  const matchLabels: string[] = (() => {
    if (game.searchMatchHints?.length) return game.searchMatchHints;
    const legacy = "_matchLabels" in game ? (game as { _matchLabels?: unknown })._matchLabels : undefined;
    return Array.isArray(legacy) ? legacy.filter((x): x is string => typeof x === "string") : [];
  })();

  const steamStoreUrl = `https://store.steampowered.com/app/${game.id}`;

  const fullDesc = getFullDescription(game);
  const cardDesc = getCardDescription(game);

  return (
    <div className={cn("relative group", className)}>
      {/* 主卡片（整体可点） */}
      <Link
        href={`/analysis/${game.id}`}
        className="block rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
      >
        {/* 封面 */}
        <div className="relative aspect-video bg-muted overflow-hidden">
          {headerSrc ? (
            <Image
              src={headerSrc}
              alt={game.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Gamepad2 className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* Genre 标签 */}
          {game.genres.length > 0 && (
            <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1 max-w-[calc(100%-11rem)]">
              {game.genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="px-2 py-0.5 text-xs font-medium bg-background/80 backdrop-blur-sm rounded"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Steam 跳转（右下角，独立不遮挡） */}
          <a
            href={steamStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1b2838] hover:bg-[#2a475e] text-white text-xs font-medium shadow-lg transition-all hover:scale-105 hover:shadow-xl"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Steam</span>
          </a>
        </div>

        {/* 游戏信息 */}
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
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
            <p className="text-xs text-muted-foreground mb-3">{game.releaseDate}</p>
          )}

          {matchLabels.length > 0 && (
            <p className="text-xs text-primary/90 mb-3 leading-relaxed">
              <span className="text-muted-foreground">命中：</span>
              {matchLabels.slice(0, 3).join(" · ")}
            </p>
          )}

          {cardDesc ? (
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed line-clamp-2">
              {cardDesc}
            </p>
          ) : null}

          <div className="flex items-center gap-3 text-sm">
            {displayScore && ScoreIcon && (
              <div className={cn("flex items-center gap-1 font-medium", scoreColor)}>
                <ScoreIcon
                  className={cn("w-4 h-4", positiveRate !== null ? "fill-current" : "")}
                />
                <span>{displayScore}</span>
              </div>
            )}

            {game.steamReviews && game.steamReviews.totalReviews > 0 ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>
                  {game.steamReviews.totalReviews.toLocaleString("en-US")}条评价
                </span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1 text-muted-foreground"
                title="Steam 官方玩家规模估算"
              >
                <Users className="w-4 h-4" />
                <span>{formatOwnersDisplay(game)}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center text-sm text-primary font-medium">
            <span>查看分析</span>
            <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Link>

      {/* 封面右上角叠加层：售价 + 详情按钮（独立于 Link，阻止跳转冒泡） */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {game.price > 0 ? (
          <div className="px-2 py-0.5 text-xs font-medium bg-background/90 backdrop-blur-sm rounded text-muted-foreground shadow-sm">
            ${typeof game.price === "number" ? game.price.toFixed(2) : game.price}
          </div>
        ) : (
          <div className="px-2 py-0.5 text-xs font-medium bg-green-600/90 text-white rounded shadow-sm">
            免费
          </div>
        )}

        {fullDesc && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                title="查看游戏介绍"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:border-primary/40 hover:text-foreground hover:shadow-md"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className={cn(
                  "z-[100] w-[min(420px,calc(100vw-2rem))] rounded-2xl",
                  "border border-white/10 bg-[#1a1f2e]/95 shadow-2xl backdrop-blur-xl",
                  "p-5 animate-in fade-in zoom-in-95 duration-150",
                )}
                style={{ maxHeight: "55vh", overflowY: "auto" }}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {headerSrc && (
                      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-muted">
                        <Image src={headerSrc} alt="" fill className="object-cover" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-white">
                        {game.name}
                      </p>
                      {game.developers.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-white/50">
                          {game.developers[0]}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="h-px bg-white/10" />
                  <p
                    className="whitespace-pre-wrap text-xs leading-[1.75] text-white/80"
                    style={{ wordBreak: "break-word" }}
                  >
                    {fullDesc}
                  </p>
                  <div className="pt-1">
                    <a
                      href={steamStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-400 transition-colors hover:text-blue-300"
                    >
                      在 Steam 商店查看
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <Popover.Arrow className="fill-white/10" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
}
