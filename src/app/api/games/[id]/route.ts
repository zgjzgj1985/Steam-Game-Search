/**
 * 游戏详情 API（本地数据库 + 混合加载）
 * GET /api/games/:id
 *
 * 策略：
 * - games-index.json (254 MB): 快速加载基本信息
 * - games-meta.json (298 MB): 按需加载完整描述
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

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

function isTestVersionByName(name: string): boolean {
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

function isTestVersionByTag(tags: string[]): boolean {
  return tags.some((t) => t.toLowerCase().includes("early access"));
}

function isTestVersion(raw: IndexGameData, normalizedTags: string[]): boolean {
  if (raw._is_test_version === true) return true;
  if (isTestVersionByName(raw.name || "")) return true;
  if (isTestVersionByTag(normalizedTags)) return true;
  return false;
}

// ============ 索引文件数据类型 ============

interface IndexGameData {
  name: string;
  release_date: string;
  price: number;
  short_description: string;
  header_image: string;
  metacritic_score: number;
  developers: string[];
  publishers: string[];
  categories: string[];
  genres: string[];
  screenshots: string[];
  positive: number;
  negative: number;
  estimated_owners: string;
  peak_ccu: number;
  tags: Record<string, number> | string[];
  _is_test_version?: boolean;
}

// ============ Meta 文件数据类型 ============

interface MetaGameData {
  description: string;
  aboutTheGame: string;
}

// ============ 缓存 ============

interface DbCache {
  indexData: Record<string, IndexGameData> | null;
  metaData: Record<string, MetaGameData> | null;
  loadedAt: number;
}

const dbCache: DbCache = {
  indexData: null,
  metaData: null,
  loadedAt: 0,
};

const INDEX_FILE = path.join(process.cwd(), "public", "data", "games-index.json");
const META_FILE = path.join(process.cwd(), "public", "data", "games-meta.json");

// ============ 工具函数 ============

function parseEstimatedOwners(raw: string): { value: number; min?: number; max?: number } {
  const cleaned = raw.replace(/,/g, "").trim();
  const parts = cleaned.split("-").map((s) => parseInt(s.trim(), 10));

  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return {
      value: Math.round((parts[0] + parts[1]) / 2),
      min: parts[0],
      max: parts[1]
    };
  }

  const single = parseInt(cleaned, 10);
  if (!isNaN(single)) {
    return { value: single };
  }

  return { value: 0 };
}

function normalizeTags(raw: Record<string, number> | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.keys(raw);
}

function getReviewScoreDesc(score: number): string {
  if (score >= 95) return "Overwhelmingly Positive";
  if (score >= 80) return "Very Positive";
  if (score >= 70) return "Mostly Positive";
  if (score >= 40) return "Mixed";
  if (score >= 20) return "Mostly Negative";
  return "Very Negative";
}

// ============ 数据加载 ============

function loadIndexData(): Record<string, IndexGameData> | null {
  if (dbCache.indexData) return dbCache.indexData;

  try {
    if (!fs.existsSync(INDEX_FILE)) {
      console.error("[db] 索引文件不存在");
      return null;
    }

    const raw = fs.readFileSync(INDEX_FILE, "utf-8");
    dbCache.indexData = JSON.parse(raw);
    console.log(`[db] 加载索引文件: ${(raw.length / 1024 / 1024).toFixed(1)} MB`);
    return dbCache.indexData;
  } catch (e) {
    console.error("[db] 加载索引文件失败:", e);
    return null;
  }
}

function loadMetaData(): Record<string, MetaGameData> | null {
  if (dbCache.metaData) return dbCache.metaData;

  try {
    if (!fs.existsSync(META_FILE)) {
      console.warn("[db] Meta 文件不存在，跳过描述加载");
      return null;
    }

    const raw = fs.readFileSync(META_FILE, "utf-8");
    dbCache.metaData = JSON.parse(raw);
    console.log(`[db] 加载 Meta 文件: ${(raw.length / 1024 / 1024).toFixed(1)} MB`);
    return dbCache.metaData;
  } catch (e) {
    console.warn("[db] 加载 Meta 文件失败:", e);
    return null;
  }
}

// ============ 游戏查找 ============

interface GameInfo {
  id: string;
  steamAppId: string;
  name: string;
  description: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  categories: string[];
  tags: string[];
  releaseDate: string | null;
  isFree: boolean;
  price: number;
  metacriticScore: number | null;
  estimatedOwners: number;
  estimatedOwnersMin?: number;
  estimatedOwnersMax?: number;
  peakCCU: number;
  steamReviews: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  headerImage: string | null;
  screenshots: string[];
  steamUrl: string;
  isTestVersion: boolean;
}

function findGameById(id: string): GameInfo | null {
  const indexData = loadIndexData();
  if (!indexData) return null;

  // 1. 直接用 appId 查找
  if (indexData[id]) {
    return transformGame(id, indexData[id]);
  }

  // 2. 按名称查找
  for (const [appId, game] of Object.entries(indexData)) {
    if (game.name === id) {
      return transformGame(appId, game);
    }
  }

  return null;
}

function enrichWithMeta(game: GameInfo, appId: string): GameInfo {
  const metaData = loadMetaData();
  if (!metaData || !metaData[appId]) return game;

  const meta = metaData[appId];
  return {
    ...game,
    description: meta.description || meta.aboutTheGame || game.description,
  };
}

function transformGame(appId: string, raw: IndexGameData): GameInfo {
  const owners = parseEstimatedOwners(raw.estimated_owners);
  const totalReviews = raw.positive + raw.negative;
  const reviewScore = totalReviews > 0 ? Math.round((raw.positive / totalReviews) * 100) : 0;
  const normalizedTags = normalizeTags(raw.tags);

  return {
    id: appId,
    steamAppId: appId,
    name: raw.name || "",
    description: "", // 稍后从 meta 补充
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
    isTestVersion: isTestVersion(raw, normalizedTags),
  };
}

// ============ API 入口 ============

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;
  const { searchParams } = request.nextUrl;
  const fullDescription = searchParams.get("full") === "true";

  const game = findGameById(gameId);

  if (!game) {
    return NextResponse.json(
      {
        error: `未找到游戏 "${gameId}"，可能该游戏不在本地数据库中`,
      },
      { status: 404 }
    );
  }

  // 按需加载完整描述
  if (fullDescription) {
    const enriched = enrichWithMeta(game, game.steamAppId);
    return NextResponse.json({
      source: "local",
      game: enriched,
      analysis: null,
      loadedFrom: {
        index: true,
        meta: true,
        descriptionLength: enriched.description.length
      }
    });
  }

  return NextResponse.json({
    source: "local",
    game,
    analysis: null,
  });
}
