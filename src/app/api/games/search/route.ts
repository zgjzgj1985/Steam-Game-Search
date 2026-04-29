/**
 * 本地游戏数据库搜索 API
 * ========================
 * 数据源: public/data/games.json (FronkonGames/steam-games-dataset)
 * 122,611 条 Steam 游戏，来源: Hugging Face
 * 排序: estimated_owners 玩家规模估算
 * 搜索: 名称 + 描述 + 开发商 + tags 实时匹配
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

// ============ 测试版/预发布版游戏关键词（名称匹配）============
// 这些游戏会降低搜索质量，默认应该被过滤
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

// 检查是否是测试版/预发布版游戏（通过名称判断）
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

// 检查是否是测试版/预发布版游戏（通过 Steam 标签判断）
function isTestVersionByTag(tags: string[]): boolean {
  const lower = tags.map((t) => t.toLowerCase());
  return lower.some((t) => t.includes("early access"));
}

// 检查是否是测试版（综合判断：名称 + 标签 + 数据源标记）
// 优先使用明确的标记字段，其次通过名称/标签推断
function isTestVersion(raw: RawGameData, normalizedTags: string[]): boolean {
  // 明确的标记字段（数据清洗后添加的字段）
  if (raw._is_test_version === true) return true;
  if (raw._is_playtest === true) return true;

  // 通过名称判断
  if (isTestVersionByName(raw.name || "")) return true;

  // 通过 Steam 标签判断
  if (isTestVersionByTag(normalizedTags)) return true;

  return false;
}

// ============ 原始数据类型 (games.json) ============

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
  _is_playtest?: boolean;
  _is_suspicious_delisted?: boolean;
}

// ============ 返回给前端的类型 ============

interface GameRecord {
  id: string;
  name: string;
  steamAppId: string;
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
  isSuspiciousDelisted?: boolean;
}

// ============ 类型筛选配置 (英文 tags) ============

const GENRE_TAG_MAP: Record<string, string[]> = {
  回合制: [
    "Turn-Based", "Turn-Based Strategy", "Turn-Based Tactics", "Turn-Based Combat",
    "Strategy RPG", "Tactical RPG"
  ],
  策略: [
    "Strategy", "Grand Strategy", "Real Time Tactics", "Tactical", "4X"
  ],
  RPG: ["RPG", "JRPG", "Action RPG", "Adventure"],
  卡牌: ["Card Game", "Deckbuilding", "Collectible Card Game"],
  桌游: ["Board Game", "Tabletop", "Digital Board Game"],
  战棋: ["Turn-Based Tactics", "Tactical RPG", "Strategy RPG"]
};

// ============ 数据库加载（模块级缓存）============

interface DbCache {
  games: GameRecord[];
  loadedAt: number | null;
  loadError: string | null;
}

const dbCache: DbCache = {
  games: [],
  loadedAt: null,
  loadError: null,
};

// 预计算缓存文件（包含已去重、已计算的数据）
const CACHE_FILE = path.join(process.cwd(), "public", "data", "games-cache.json");
// 原始文件（仅在缓存不存在时降级使用）
const DB_FILE = path.join(process.cwd(), "public", "data", "games-index.json");
const CACHE_DB_FILE = path.join(process.cwd(), "public", "data", "games-cache.db");

// SQLite 连接（延迟初始化）
let sqliteDb: any = null;
function getSqliteDb() {
  if (!sqliteDb && fs.existsSync(CACHE_DB_FILE)) {
    try {
      const Database = require("better-sqlite3");
      sqliteDb = new Database(CACHE_DB_FILE, { readonly: true });
      sqliteDb.pragma("journal_mode = WAL");
      sqliteDb.pragma("mmap_size = 268435456");
    } catch { sqliteDb = null; }
  }
  return sqliteDb;
}

/**
 * 解析 estimated_owners 字符串，返回玩家数量估算
 * 格式如: "20000 - 50000" -> 返回中值 35000
 */
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

/**
 * 转换 tags 字段为字符串数组
 * 原始格式可能是 Record<string, number> 或 string[]
 */
function normalizeTags(raw: Record<string, number> | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.keys(raw);
}

/**
 * 转换原始游戏数据为前端格式
 */
function transformGame(appId: string, raw: RawGameData): GameRecord {
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
    isTestVersion: isTestVersion(raw, normalizedTags),
    isSuspiciousDelisted: raw._is_suspicious_delisted === true,
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

function loadDatabase(): GameRecord[] {
  const now = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  if (
    dbCache.games.length > 0 &&
    dbCache.loadedAt !== null &&
    (!isProduction || now - dbCache.loadedAt < 5 * 60 * 1000)
  ) {
    return dbCache.games;
  }

  // ============ 优先: SQLite 直接查询 ============
  const db = getSqliteDb();
  if (db) {
    try {
      const t0 = Date.now();
      const rows = db.prepare("SELECT * FROM games_cache").all() as any[];
      // SQLite games_cache 表没有 _is_test_version 列，用名称检测
      const detectedTestCount = { total: 0, test: 0 };
      const games = rows.map((row: any) => {
        const name = row.name || "";
        const devTags: string[] = [];
        try { devTags.push(...JSON.parse(row.developers || "[]")); } catch {}
        try { devTags.push(...JSON.parse(row.categories || "[]")); } catch {}
        const detectedTest = isTestVersion({ name } as RawGameData, devTags);
        if (detectedTest) detectedTestCount.test++;
        detectedTestCount.total++;
        return {
          id: row.appid,
          steamAppId: row.appid,
          name,
          description: "",
          shortDescription: row.short_description || "",
          developers: row.developers ? JSON.parse(row.developers) : [],
          publishers: row.publishers ? JSON.parse(row.publishers) : [],
          genres: row.genres ? JSON.parse(row.genres) : [],
          categories: row.categories ? JSON.parse(row.categories) : [],
          tags: row.tags ? JSON.parse(row.tags) : [],
          releaseDate: row.release_date || null,
          isFree: row.is_free === 1,
          price: row.price || 0,
          metacriticScore: row.metacritic_score > 0 ? row.metacritic_score : null,
          estimatedOwners: row.estimated_owners_num || 0,
          peakCCU: row.peak_ccu || 0,
          steamReviews: row.positive + row.negative > 0 ? {
            totalPositive: row.positive,
            totalNegative: row.negative,
            totalReviews: row.positive + row.negative,
            reviewScore: row.review_score,
            reviewScoreDescription: getReviewScoreDesc(row.review_score),
          } : null,
          headerImage: row.header_image || null,
          screenshots: row.screenshots ? JSON.parse(row.screenshots) : [],
          steamUrl: `https://store.steampowered.com/app/${row.appid}`,
          isTestVersion: detectedTest,
          isSuspiciousDelisted: row._is_suspicious_delisted === 1,
        };
      });
      console.log(`[db] SQLite 检测到 ${detectedTestCount.test} / ${detectedTestCount.total} 个测试版（通过名称判断）`);
      dbCache.games = games;
      dbCache.loadedAt = now;
      dbCache.loadError = null;
      console.log(`[db] 从 SQLite 加载 ${games.length} 个游戏，耗时 ${Date.now() - t0}ms`);
    } catch (e) {
      console.warn(`[db] SQLite 查询失败，降级到 JSON: ${e instanceof Error ? e.message : String(e)}`);
      dbCache.games = [];
    }
  }

  // SQLite 加载失败时，尝试 JSON 缓存
  if (dbCache.games.length === 0) {
    try {
      if (fs.existsSync(CACHE_FILE) && fs.statSync(CACHE_FILE).size > 0) {
        const t0 = Date.now();
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");
        const cache = JSON.parse(raw) as { meta: unknown; games: GameRecord[] };
        dbCache.games = cache.games;
        dbCache.loadedAt = now;
        dbCache.loadError = null;
        console.log(`[db] 从预计算缓存加载 ${cache.games.length} 个游戏，耗时 ${Date.now() - t0}ms`);
      } else {
        console.warn("[db] 预计算缓存不存在，降级使用原始 JSON");
        if (!fs.existsSync(DB_FILE)) {
          dbCache.loadError = `数据库文件不存在: ${DB_FILE}`;
          return [];
        }

        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const rawData = JSON.parse(raw) as Record<string, RawGameData>;
        const games: GameRecord[] = [];
        for (const [appId, data] of Object.entries(rawData)) {
          games.push(transformGame(appId, data));
        }
        dbCache.games = games;
        dbCache.loadedAt = now;
        dbCache.loadError = null;
        console.log(`[db] 从原始 JSON 加载 ${games.length} 个游戏`);
      }
    } catch (e) {
      const msg = `加载数据库失败: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[db]", msg);
      dbCache.loadError = msg;
      return [];
    }
  }

  // ============ 所有数据加载路径统一去重 ============
  const rawCount = dbCache.games.length;
  const { kept, removed } = deduplicateGames(dbCache.games);
  dbCache.games = kept;
  if (removed > 0) {
    console.log(`[db] 去重后保留 ${kept.length} 个游戏，移除 ${removed} 个重复（包含测试版替换）`);
  }

  return dbCache.games;
}

/**
 * 按"开发商+游戏名称"组合去重
 * 优先保留正式版本（而非玩家数更多的测试版）
 * 同为正式版或同为测试版时，优先保留玩家数最多的条目
 */
function deduplicateGames(games: GameRecord[]): { kept: GameRecord[]; removed: number } {
  const map = new Map<string, GameRecord>();

  for (const game of games) {
    if (!game.name) continue;
    const key = buildDedupKey(game);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, game);
    } else {
      const existingIsTest = existing.isTestVersion;
      const gameIsTest = game.isTestVersion;

      // 规则1：一方为测试版，另一方为正式版 → 保留正式版
      if (existingIsTest !== gameIsTest) {
        if (gameIsTest) {
          // 当前是正式版，已有是测试版 → 替换
          map.set(key, game);
        }
        // else: 当前是测试版，已有是正式版 → 跳过
      } else {
        // 规则2：同为正式版或同为测试版 → 按玩家数和评价数排序
        const existingTotalReviews = existing.steamReviews?.totalReviews ?? 0;
        const gameTotalReviews = game.steamReviews?.totalReviews ?? 0;
        if (
          game.estimatedOwners > existing.estimatedOwners ||
          (game.estimatedOwners === existing.estimatedOwners && gameTotalReviews > existingTotalReviews)
        ) {
          map.set(key, game);
        }
      }
    }
  }

  const kept = Array.from(map.values());
  return { kept, removed: games.length - kept.length };
}

/**
 * 构建去重键：开发商列表（排序后）+ 游戏名称
 * 开发商相同时认为是同一游戏，不同开发商的同名游戏视为不同游戏
 */
function buildDedupKey(game: GameRecord): string {
  const devs = (game.developers || []).map((d) => d.toLowerCase().trim()).sort();
  const devKey = devs.length > 0 ? devs.join("|") : "__NO_DEV__";
  const nameKey = game.name.toLowerCase().trim();
  return `${devKey}|||${nameKey}`;
}

// ============ 搜索逻辑 ============

/**
 * 检查游戏是否匹配类型筛选
 * 基于 tags 字典的键进行匹配
 */
function matchesGenreFilter(game: GameRecord, filter: string): boolean {
  const keywords = GENRE_TAG_MAP[filter];
  if (!keywords) return false;

  const tags = game.tags ?? [];
  const genres = game.genres ?? [];
  if (!Array.isArray(tags) || !Array.isArray(genres)) return false;

  const tagsLower = tags.map((t) => String(t ?? '').toLowerCase());
  const genresLower = genres.map((g) => String(g ?? '').toLowerCase());

  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase();
    return tagsLower.some((t) => t.includes(kwLower)) ||
           genresLower.some((g) => g.includes(kwLower));
  });
}

/**
 * 主搜索函数
 */
function searchGames(
  allGames: GameRecord[],
  query: string,
  genreFilters: string[],
  sortBy: string,
  sortOrder: string,
  page: number,
  pageSize: number,
  minReleaseDate?: string,
  maxReleaseDate?: string,
  minRating?: number,
  minReviews?: number,
  excludeTestVersions?: boolean,
  excludeSuspiciousDelisted?: boolean
): { results: GameRecord[]; total: number; page: number; pageSize: number } {
  let results = allGames;

  // 0. 测试版过滤
  if (excludeTestVersions !== false) {
    const beforeCount = results.length;
    results = results.filter((g) => !g.isTestVersion);
    console.log(`[search] 测试版过滤: 过滤前 ${beforeCount} 个，过滤后 ${results.length} 个`);
    // 调试：检查 balatro 相关游戏
    const balatroGames = allGames.filter((g) => g.name.toLowerCase().includes("balatro"));
    if (balatroGames.length > 0) {
      console.log(`[debug] Balatro 相关游戏: ${balatroGames.map((g) => `${g.name}[${g.isTestVersion ? "测试" : "正式"}]`).join(", ")}`);
    }
  }

  // 0b. 可疑下架游戏过滤
  if (excludeSuspiciousDelisted !== false) {
    results = results.filter((g) => g.isSuspiciousDelisted !== true);
  }

  // 1. 类型筛选
  if (genreFilters.length > 0) {
    results = results.filter((g) => genreFilters.every((f) => matchesGenreFilter(g, f)));
  }

  // 2. 好评率筛选 (基于 Steam 评价数计算的好评率)
  if (minRating && minRating > 0) {
    results = results.filter((g) => {
      if (!g.steamReviews) return false;
      return g.steamReviews.reviewScore >= minRating;
    });
  }

  // 3. 评价数筛选
  if (minReviews && minReviews > 0) {
    results = results.filter((g) => {
      if (!g.steamReviews) return false;
      return g.steamReviews.totalReviews >= minReviews;
    });
  }

  // 4. 上线日期筛选
  if (minReleaseDate || maxReleaseDate) {
    const minDate = minReleaseDate ? new Date(minReleaseDate).getTime() : 0;
    const maxDate = maxReleaseDate ? new Date(maxReleaseDate).getTime() : Number.MAX_SAFE_INTEGER;
    // 验证日期有效性
    if (isNaN(minDate) || isNaN(maxDate)) {
      console.warn(`[search] 无效的日期筛选参数: min=${minReleaseDate}, max=${maxReleaseDate}`);
    } else {
      results = results.filter((g) => {
        if (!g.releaseDate) return false;
        const gameDate = new Date(g.releaseDate).getTime();
        // 跳过无效日期的游戏
        if (isNaN(gameDate)) return false;
        return gameDate >= minDate && gameDate <= maxDate;
      });
    }
  }

  // 5. 文本搜索
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter((g) => {
      const nameLower = String(g.name ?? '').toLowerCase();
      const descLower = String(g.description ?? '').slice(0, 500).toLowerCase();
      const shortDescLower = String(g.shortDescription ?? '').toLowerCase();
      const tags = g.tags ?? [];
      const genres = g.genres ?? [];
      const developers = g.developers ?? [];
      const publishers = g.publishers ?? [];

      return (
        nameLower.includes(q) ||
        descLower.includes(q) ||
        shortDescLower.includes(q) ||
        tags.some((t) => String(t ?? '').toLowerCase().includes(q)) ||
        genres.some((g2) => String(g2 ?? '').toLowerCase().includes(q)) ||
        developers.some((d) => String(d ?? '').toLowerCase().includes(q)) ||
        publishers.some((d) => String(d ?? '').toLowerCase().includes(q))
      );
    });
  }

  const total = results.length;

  // 6. 排序
  results.sort((a, b) => {
    let cmp = 0;

    switch (sortBy) {
      case "rating": {
        const ma = a.metacriticScore ?? 0;
        const mb = b.metacriticScore ?? 0;
        cmp = mb - ma;
        break;
      }
      case "reviews": {
        const ra = a.steamReviews?.totalReviews ?? 0;
        const rb = b.steamReviews?.totalReviews ?? 0;
        cmp = rb - ra;
        break;
      }
      case "date": {
        const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        cmp = db - da;
        break;
      }
      case "name": {
        cmp = a.name.localeCompare(b.name, "zh-CN");
        break;
      }
      default: {
        cmp = b.estimatedOwners - a.estimatedOwners;
        break;
      }
    }

    if (cmp === 0) {
      cmp = a.name.localeCompare(b.name, "zh-CN");
    }

    return sortOrder === "asc" ? -cmp : cmp;
  });

  // 7. 分页
  const offset = (page - 1) * pageSize;
  const paged = results.slice(offset, offset + pageSize);

  return { results: paged, total, page, pageSize };
}

// ============ API 入口 ============

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // 参数解析与校验
  const rawQuery = searchParams.get("q") || "";
  const query = rawQuery.slice(0, 200); // 限制搜索词长度
  const genreFilters = searchParams.getAll("genre").filter(Boolean).slice(0, 10); // 最多 10 个标签
  const validSortBy = ["reviews", "rating", "date", "name"];
  const sortBy = validSortBy.includes(searchParams.get("sortBy") || "") ? searchParams.get("sortBy")! : "reviews";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const minReleaseDate = searchParams.get("minReleaseDate")?.slice(0, 10) || undefined;
  const maxReleaseDate = searchParams.get("maxReleaseDate")?.slice(0, 10) || undefined;
  const page = Math.max(1, Math.min(parseInt(searchParams.get("page") || "1", 10) || 1, 1000));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
  const minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("minRating") || "0", 10) || 0));
  const minReviews = Math.max(0, Math.min(parseInt(searchParams.get("minReviews") || "0", 10) || 0, 1_000_000_000));
  const excludeTestVersions = searchParams.get("excludeTestVersions") !== "false";
  const excludeSuspiciousDelisted = searchParams.get("excludeSuspiciousDelisted") !== "false";

  const allGames = loadDatabase();

  if (dbCache.loadError) {
    return NextResponse.json(
      {
        results: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        query,
        error: `数据库加载失败: ${dbCache.loadError}`,
      },
      { status: 500 }
    );
  }

  if (allGames.length === 0) {
    return NextResponse.json(
      {
        results: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        query,
        error: "游戏数据库为空",
      },
      { status: 200 }
    );
  }

  const { results, total } = searchGames(
    allGames,
    query,
    genreFilters,
    sortBy,
    sortOrder,
    page,
    pageSize,
    minReleaseDate,
    maxReleaseDate,
    minRating,
    minReviews,
    excludeTestVersions,
    excludeSuspiciousDelisted
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json(
    {
      results,
      total,
      page,
      pageSize,
      totalPages,
      query,
      genreFilters: genreFilters.length > 0 ? genreFilters : undefined,
      incomplete: false,
      excludeTestVersions,
      excludeSuspiciousDelisted,
      dbStats: {
        totalGames: allGames.length,
        loadedAt: dbCache.loadedAt ? new Date(dbCache.loadedAt).toISOString() : null,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  );
}
