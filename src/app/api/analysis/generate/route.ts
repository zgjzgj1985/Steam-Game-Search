/**
 * 分析生成 API
 * GET /api/analysis/generate?gameId=... 或 ?gameName=...
 *
 * 数据获取优先级:
 *   1. 本地 games-index.json (12.2万游戏，毫秒级)
 *   2. Steam API (兜底，需要网络)
 *
 * 分析生成: LLM (generateAnalysis)
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateAnalysis } from "@/lib/analysis-engine";
import type { Game } from "@/types/game";

// ============ 原始数据类型 (games-index.json) ============

interface RawGameData {
  name: string;
  release_date: string;
  required_age: number;
  price: number;
  dlc_count: number;
  detailed_description: string;
  about_the_game: string;
  short_description: string;
  reviews: string;
  header_image: string;
  website: string;
  support_url: string;
  support_email: string;
  windows: boolean;
  mac: boolean;
  linux: boolean;
  metacritic_score: number;
  metacritic_url: string;
  achievements: number;
  recommendations: number;
  notes: string;
  supported_languages: string[];
  full_audio_languages: string[];
  packages: number[];
  developers: string[];
  publishers: string[];
  categories: string[];
  genres: string[];
  screenshots: string[];
  movies: unknown[];
  user_score: number;
  score_rank: string;
  positive: number;
  negative: number;
  estimated_owners: string;
  average_playtime_forever: number;
  average_playtime_2weeks: number;
  median_playtime_forever: number;
  median_playtime_2weeks: number;
  discount: number;
  peak_ccu: number;
  tags: Record<string, number> | string[];
  _is_test_version?: boolean;
}

// ============ 数据库加载（模块级缓存）============

interface DbCache {
  games: Map<string, RawGameData>;
  loadedAt: number | null;
  loadError: string | null;
}

const dbCache: DbCache = {
  games: new Map(),
  loadedAt: null,
  loadError: null,
};

const DB_FILE = path.join(process.cwd(), "public", "data", "games-index.json");

// ============ 测试版检测 ============

const TEST_VERSION_KEYWORDS = [
  "beta", "α", "alpha", "β", "betta",
  "demo", "trial", "demo version",
  "early access", "pre-release", "pre release",
  "prototype", "tech demo",
  "test build", "testing", "test version",
  " (beta)", " [beta]", " (demo)", " [demo]",
  " (alpha)", " [alpha]", " (test)", " [test]",
  " (prototype)", " (early access)",
  " - beta", " - demo", " - test",
  " 测试版", " 试玩版", " 体验版", " 抢先体验",
];

function detectTestVersionByName(name: string): boolean {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  for (const keyword of TEST_VERSION_KEYWORDS) {
    if (lowerName.includes(keyword)) return true;
  }
  const testPatterns = [
    /\s*[\(\[\-]\s*(beta|alpha|demo|test|prototype|early\s*access)\s*[\)\]\-]/i,
    /\s*[\(\[\-]\s*[\d.]+\s*(beta|alpha|b)\s*[\)\]\-]/i,
    /beta\s*v?\d/i,
  ];
  for (const pattern of testPatterns) {
    if (pattern.test(lowerName)) return true;
  }
  return false;
}

function detectTestVersionByTag(tags: string[]): boolean {
  return tags.some((t) => t.toLowerCase().includes("early access"));
}

function detectTestVersion(raw: RawGameData, normalizedTags: string[]): boolean {
  if (raw._is_test_version === true) return true;
  if (detectTestVersionByName(raw.name || "")) return true;
  if (detectTestVersionByTag(normalizedTags)) return true;
  return false;
}

function parseEstimatedOwners(raw: string): { value: number; min?: number; max?: number } {
  const cleaned = raw.replace(/,/g, "").trim();
  const parts = cleaned.split("-").map((s) => parseInt(s.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { value: Math.round((parts[0] + parts[1]) / 2), min: parts[0], max: parts[1] };
  }
  const single = parseInt(cleaned, 10);
  if (!isNaN(single)) return { value: single };
  return { value: 0 };
}

function normalizeTags(raw: Record<string, number> | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.keys(raw);
}

function transformToGame(appId: string, raw: RawGameData): Game {
  const owners = parseEstimatedOwners(raw.estimated_owners);
  const totalReviews = raw.positive + raw.negative;
  const reviewScore = totalReviews > 0 ? Math.round((raw.positive / totalReviews) * 100) : 0;
  const normalizedTags = normalizeTags(raw.tags);

  return {
    id: appId,
    steamAppId: appId,
    name: raw.name || "",
    description: raw.detailed_description || raw.about_the_game || "",
    shortDescription: raw.short_description || "",
    developers: raw.developers || [],
    publishers: raw.publishers || [],
    genres: raw.genres || [],
    categories: raw.categories || [],
    tags: normalizedTags,
    releaseDate: raw.release_date || null,
    isFree: raw.price === 0,
    price: raw.price,
    metacriticScore: raw.metacritic_score > 0 ? raw.metacritic_score : null,
    estimatedOwners: owners.value,
    estimatedOwnersMin: owners.min,
    estimatedOwnersMax: owners.max,
    peakCCU: raw.peak_ccu,
    steamReviews: totalReviews > 0 ? {
      totalPositive: raw.positive,
      totalNegative: raw.negative,
      totalReviews,
      reviewScore,
      reviewScoreDescription: getReviewScoreDesc(reviewScore)
    } : null,
    headerImage: raw.header_image || null,
    screenshots: raw.screenshots || [],
    steamUrl: `https://store.steampowered.com/app/${appId}`,
    isTestVersion: detectTestVersion(raw, normalizedTags),
  };
}

function getReviewScoreDesc(score: number): string {
  if (score >= 95) return "Overwhelmingly Positive";
  if (score >= 80) return "Very Positive";
  if (score >= 70) return "Mostly Positive";
  if (score >= 40) return "Mixed";
  if (score >= 20) return "Mostly Negative";
  return "Very Negative";
}

function loadDatabase(): Map<string, RawGameData> {
  const now = Date.now();

  if (dbCache.games.size > 0 && dbCache.loadedAt !== null && now - dbCache.loadedAt < 5 * 60 * 1000) {
    return dbCache.games;
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      dbCache.loadError = `数据库文件不存在: ${DB_FILE}`;
      return new Map();
    }

    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const rawData = JSON.parse(raw) as Record<string, RawGameData>;

    const games = new Map<string, RawGameData>();
    for (const [appId, data] of Object.entries(rawData)) {
      games.set(appId, data);
    }

    dbCache.games = games;
    dbCache.loadedAt = now;
    dbCache.loadError = null;
    console.log(`[db] 加载 ${games.size} 个游戏`);

    return games;
  } catch (e) {
    const msg = `加载数据库失败: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[db]", msg);
    dbCache.loadError = msg;
    return new Map();
  }
}

function loadGameById(id: string, db: Map<string, RawGameData>): Game | null {
  const raw = db.get(id);
  if (!raw) return null;
  return transformToGame(id, raw);
}

function loadGameByName(name: string, db: Map<string, RawGameData>): Game | null {
  const target = name.toLowerCase().trim();

  // 第一轮：完全匹配，选拥有者最多的版本（处理同名不同游戏的情况）
  let bestMatch: { appId: string; data: RawGameData } | null = null;
  let bestOwners = -1;

  for (const [appId, data] of db.entries()) {
    if (data.name.toLowerCase() === target) {
      const owners = parseEstimatedOwners(data.estimated_owners);
      if (owners.value > bestOwners) {
        bestOwners = owners.value;
        bestMatch = { appId, data };
      }
    }
  }

  if (bestMatch) {
    return transformToGame(bestMatch.appId, bestMatch.data);
  }

  // 第二轮：模糊匹配（用分隔符前后词匹配，避免 "Portal" 匹配到 "Portal 2"）
  // 将游戏名称按空格和特殊符号分割，检查目标词是否与任意一个词完全匹配
  const targetParts = target.split(/[\s\-_:,.·'"]+/).filter(Boolean);
  bestMatch = null;
  bestOwners = -1;

  for (const [appId, data] of db.entries()) {
    const nameParts = data.name.toLowerCase().split(/[\s\-_:,.·'"]+/).filter(Boolean);
    if (targetParts.some((tp) => nameParts.includes(tp))) {
      const owners = parseEstimatedOwners(data.estimated_owners);
      if (owners.value > bestOwners) {
        bestOwners = owners.value;
        bestMatch = { appId, data };
      }
    }
  }

  if (bestMatch) {
    return transformToGame(bestMatch.appId, bestMatch.data);
  }

  return null;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  const gameName = searchParams.get("gameName")?.trim().slice(0, 200);

  if (!gameId && !gameName) {
    return NextResponse.json(
      { error: "必须提供 gameId 或 gameName 参数" },
      { status: 400 }
    );
  }

  try {
    const db = loadDatabase();

    if (dbCache.loadError) {
      return NextResponse.json(
        { error: `数据库加载失败: ${dbCache.loadError}` },
        { status: 500 }
      );
    }

    let game: Game | null = null;

    // 1. 优先从本地数据库查询（毫秒级）
    if (gameId) {
      game = loadGameById(gameId, db);
    }
    if (!game && gameName) {
      game = loadGameByName(gameName, db);
    }

    // 2. 记录数据来源
    const source = game ? "local" : "not_found";

    // 3. 生成分析
    if (game) {
      const analysis = await generateAnalysis(game);
      return NextResponse.json(
        { game, analysis, source },
        { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
      );
    }

    // 本地库无数据，返回空结果
    return NextResponse.json(
      {
        game: null,
        analysis: null,
        source,
        error: `本地数据库中未找到 "${gameId ?? gameName}"`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Analysis generation failed:", error);
    return NextResponse.json(
      { error: "分析生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}
