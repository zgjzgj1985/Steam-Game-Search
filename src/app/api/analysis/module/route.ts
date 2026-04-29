/**
 * 单模块分析 API
 * POST /api/analysis/module
 * 
 * 请求体：
 * {
 *   gameId: string,      // 游戏ID
 *   module: "verdict" | "coreGameplay" | "battleSystem" | "differentiation" | "negativeFeedback" | "designSuggestions"
 * }
 * 
 * 返回：单个模块的分析结果
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { Game, GameAnalysis, AnalysisModuleResult, AnalysisModuleType } from "@/types/game";
import { chatModuleAnalysis, parseModuleAnalysis } from "@/lib/llm";

// ============ 分析结果持久化 ============

const ANALYSES_FILE = path.join(process.cwd(), "public", "data", "analyses.json");

interface AnalysesStore {
  [gameId: string]: GameAnalysis;
}

function loadAnalyses(): AnalysesStore {
  try {
    if (!fs.existsSync(ANALYSES_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(ANALYSES_FILE, "utf-8");
    return JSON.parse(raw) as AnalysesStore;
  } catch {
    return {};
  }
}

function saveAnalysis(analysis: GameAnalysis): void {
  try {
    const store = loadAnalyses();
    if (!store[analysis.gameId]) {
      store[analysis.gameId] = {
        id: analysis.id,
        gameId: analysis.gameId,
        gameName: analysis.gameName,
        pool: analysis.pool,
        generatedAt: analysis.generatedAt,
        analyzedModules: [],
      };
    }
    const existing = store[analysis.gameId];
    existing.generatedAt = analysis.generatedAt;
    for (const modType of analysis.analyzedModules) {
      if (!existing.analyzedModules.includes(modType)) {
        existing.analyzedModules.push(modType);
      }
      if (analysis[modType]) {
        (existing as any)[modType] = analysis[modType];
      }
    }
    fs.writeFileSync(ANALYSES_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.error("[analysis] 保存分析结果失败:", e);
  }
}

function getSavedAnalysis(gameId: string): GameAnalysis | null {
  const store = loadAnalyses();
  return store[gameId] || null;
}

// ============ 数据库加载（模块级缓存）============

interface RawGameData {
  name: string;
  release_date: string;
  price: number;
  detailed_description: string;
  about_the_game: string;
  short_description: string;
  header_image: string;
  developers: string[];
  publishers: string[];
  categories: string[];
  genres: string[];
  screenshots: string[];
  positive: number;
  negative: number;
  estimated_owners: string;
  peak_ccu: number;
  metacritic_score: number;
  tags: Record<string, number> | string[];
  _is_test_version?: boolean;
}

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
    tags: normalizeTags(raw.tags),
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

function buildGameInfo(game: Game): string {
  const parts: string[] = [];

  parts.push(`游戏名称：${game.name}`);
  parts.push(`开发商：${game.developers.join(", ") || "未知"}`);
  parts.push(`发行商：${game.publishers.join(", ") || "未知"}`);

  if (game.releaseDate) {
    parts.push(`发售日期：${game.releaseDate}`);
  }

  parts.push(`类型标签：${game.genres.join(", ") || "未知"}`);
  parts.push(`游戏标签：${game.tags.join(", ") || "无"}`);

  if (game.steamReviews) {
    const { totalPositive, totalNegative, reviewScore, reviewScoreDescription } = game.steamReviews;
    const totalReviews = totalPositive + totalNegative;
    parts.push(
      `Steam评价：${reviewScore}% (${reviewScoreDescription})，${totalPositive.toLocaleString()}好评 / ${totalNegative.toLocaleString()}差评，总计${totalReviews.toLocaleString()}条评价`
    );
    if (totalReviews >= 1000) {
      parts.push(`【数据质量提示】该游戏有 ${totalReviews.toLocaleString()} 条评价，数据充足，分析置信度可设为 high`);
    } else if (totalReviews >= 100) {
      parts.push(`【数据质量提示】该游戏有 ${totalReviews.toLocaleString()} 条评价，数据量中等，分析置信度可设为 medium`);
    } else {
      parts.push(`【数据质量提示】该游戏仅有 ${totalReviews.toLocaleString()} 条评价，数据有限，分析置信度建议设为 low`);
    }
  }

  if (game.price === 0) {
    parts.push("价格：免费");
  } else if (game.price) {
    parts.push(`价格：$${(game.price / 100).toFixed(2)}`);
  }

  if (game.shortDescription) {
    const desc = game.shortDescription
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`\n游戏简介：\n${desc.slice(0, 1000)}`);
  }

  if (game.description) {
    const fullDesc = game.description
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`\n完整描述：\n${fullDesc.slice(0, 3000)}`);
  }

  if (game.isPokemonLike && game.pokemonLikeTags && game.pokemonLikeTags.length > 0) {
    parts.push(`\n宝可梦Like标签：${game.pokemonLikeTags.join(", ")}`);
  }

  return parts.join("\n\n");
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, module } = body;

    if (!gameId || !module) {
      return NextResponse.json(
        { error: "缺少 gameId 或 module 参数" },
        { status: 400 }
      );
    }

    const validModules = [
      "verdict",
      "coreGameplay",
      "battleSystem",
      "differentiation",
      "negativeFeedback",
      "designSuggestions"
    ];

    if (!validModules.includes(module)) {
      return NextResponse.json(
        { error: `无效的模块类型: ${module}` },
        { status: 400 }
      );
    }

    const db = loadDatabase();

    if (dbCache.loadError) {
      return NextResponse.json(
        { error: `数据库加载失败: ${dbCache.loadError}` },
        { status: 500 }
      );
    }

    const game = loadGameById(gameId, db);

    if (!game) {
      return NextResponse.json(
        { error: `未找到游戏: ${gameId}` },
        { status: 404 }
      );
    }

    // 调用LLM进行单模块分析
    const gameInfo = buildGameInfo(game);
    const content = await chatModuleAnalysis(gameInfo, module, game.pool);
    const result = parseModuleAnalysis(content, module);

    const generatedAt = new Date().toISOString();
    const analysisModuleType = module as AnalysisModuleType;

    const analysis: GameAnalysis = {
      id: `analysis-${gameId}-${Date.now()}`,
      gameId: gameId,
      gameName: game.name,
      pool: game.pool || null,
      generatedAt,
      analyzedModules: [analysisModuleType],
      [analysisModuleType]: { ...result, isAnalyzed: true, isAnalyzing: false, error: null } as any,
    };

    saveAnalysis(analysis);

    const savedAnalysis = getSavedAnalysis(gameId);

    return NextResponse.json(
      {
        gameId,
        module,
        result,
        generatedAt,
        savedModules: savedAnalysis?.analyzedModules || [module],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
        }
      }
    );
  } catch (error) {
    console.error("Module analysis failed:", error);
    return NextResponse.json(
      { error: `分析生成失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
