/**
 * 模式2: 宝可梦Like游戏筛选API
 * ================================
 * 从海量回合制游戏中筛选出有价值的参考对象
 * 
 * 三池筛选逻辑（默认条件，可通过参数覆盖）:
 * - A池(神作参考): 普通回合制, 好评率>=75%, 评论数>50
 * - B池(核心竞品): 宝可梦Like, 好评率>=75%, 评论数>50
 * - C池(避坑指南): 宝可梦Like, 好评率40%-74%, 评论数>50
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

// ============ 原始数据类型 ============

interface RawGameData {
  name: string;
  release_date: string;
  price: number;
  detailed_description?: string;
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
  tags: Record<string, number> | string[];
  metacritic_score: number | null;
  _is_test_version?: boolean;
}

// ============ 返回类型 ============

interface GameRecord {
  id: string;
  name: string;
  steamAppId: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  categories: string[];
  releaseDate: string | null;
  isFree: boolean;
  price: number;
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
  // 模式2扩展字段
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  wilsonScore: number;
  pool: "A" | "B" | "C" | null;
  // 是否是回合制游戏（用于模式2筛选）
  isTurnBased: boolean;
  // 是否是测试版/预发布版游戏
  isTestVersion: boolean;
  // 测试版标识类型（用于前端显示）
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
}

interface PoolStats {
  total: number;
  totalTurnBased: number;
  poolA: number;
  poolB: number;
  poolC: number;
}

// 价格统计接口
interface PriceStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  distribution: {
    free: number;
    under10: number;
    under20: number;
    under30: number;
    under50: number;
    over50: number;
  };
}

// 特色标签筛选选项（与前端保持一致）
const FEATURE_TAGS = [
  { key: "survival", label: "生存建造", tags: ["Survival", "Crafting", "生存", "建造"] },
  { key: "roguelite", label: "肉鸽融合", tags: ["Roguelite", "Roguelike", "类肉鸽"] },
  { key: "deckbuilding", label: "牌组构建", tags: ["Deckbuilding", "牌组构建", "卡牌构建"] },
  { key: "openworld", label: "开放世界", tags: ["开放世界", "Open World"] },
  { key: "metroidvania", label: "银河恶魔城", tags: ["Metroidvania", "银河恶魔城"] },
  { key: "morph", label: "形态融合", tags: ["形态融合"] },
];

// ============ 标签权重系统 ============

// 核心标签（最高权重）- 生物收集/怪物养成类游戏必须有
const CORE_TAGS = [
  "Creature Collector",
  "Monster Catching",
  "Monster Taming",
  "Creature Collection",
  "养宠",
  "养成",
  "宠物养成",
  "怪物养成",
];

// 次级标签（高相关度）- 回合制RPG相关
const SECONDARY_TAGS = [
  "JRPG",
  "Party-Based RPG",
  "Tactical RPG",
  "角色扮演",
  "RPG",
];

// 现代融合标签（创新点）- 差异化卖点
const MODERN_TAGS = [
  "Roguelite",
  "Roguelike",
  "Deckbuilding",
  "开放世界",
  "Open World",
  "Metroidvania",
  "银河恶魔城",
  "Survival",
  "Crafting",
  "生存",
  "建造",
  "牌组构建",
  "卡牌构建",
  "形态融合",
  "类肉鸽",
];

// 特色标签映射（用于展示差异化卖点）
const DIFFERENTIATION_LABELS: Record<string, string> = {
  "Survival": "生存建造",
  "Crafting": "合成系统",
  "Metroidvania": "银河恶魔城",
  "开放世界": "开放世界",
  "Open World": "开放世界",
  "Roguelite": "肉鸽融合",
  "Roguelike": "肉鸽融合",
  "Deckbuilding": "牌组构建",
  "牌组构建": "牌组构建",
  "卡牌构建": "牌组构建",
  "形态融合": "形态融合",
  "银河恶魔城": "银河恶魔城",
  "Survival Game": "生存建造",
};

// 计算标签权重
interface TagWeight {
  coreTagCount: number;
  secondaryTagCount: number;
  modernTagCount: number;
  tagWeight: number;
  matchedCoreTags: string[];
  matchedSecondaryTags: string[];
  matchedModernTags: string[];
  uniqueFeatureTags: string[];
  differentiationLabels: string[];
}

function calculateTagWeight(tags: string[]): TagWeight {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const matchedCoreTags: string[] = [];
  const matchedSecondaryTags: string[] = [];
  const matchedModernTags: string[] = [];
  const uniqueFeatureTags: string[] = [];
  const differentiationLabels: string[] = [];

  // 匹配核心标签
  for (const tag of CORE_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase()))) {
      matchedCoreTags.push(tag);
    }
  }

  // 匹配次级标签（不在核心中的才计入）
  const coreSet = new Set(matchedCoreTags.map((t) => t.toLowerCase()));
  for (const tag of SECONDARY_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase())) && !coreSet.has(tag.toLowerCase())) {
      matchedSecondaryTags.push(tag);
    }
  }

  // 匹配现代融合标签（独立计算）
  for (const tag of MODERN_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase()))) {
      matchedModernTags.push(tag);
      // 添加到特色标签
      const normalized = tag.toLowerCase();
      if (!uniqueFeatureTags.includes(tag)) {
        uniqueFeatureTags.push(tag);
        // 添加展示用标签
        const label = DIFFERENTIATION_LABELS[tag] || DIFFERENTIATION_LABELS[tag.charAt(0).toUpperCase() + tag.slice(1)] || tag;
        if (!differentiationLabels.includes(label)) {
          differentiationLabels.push(label);
        }
      }
    }
  }

  // 提取差异化的特色标签（非基础回合制标签）
  const basicTags = [...TURN_BASED_TAGS, ...POKEMON_LIKE_TAGS].map((t) => t.toLowerCase());
  for (const tag of uniqueFeatureTags) {
    const normalized = tag.toLowerCase();
    if (!basicTags.some((b) => normalized.includes(b.toLowerCase()))) {
      // 已在上方添加
    }
  }

  // 计算权重分：核心*3 + 次级*2 + 现代*1
  const tagWeight = matchedCoreTags.length * 3 + matchedSecondaryTags.length * 2 + matchedModernTags.length * 1;

  return {
    coreTagCount: matchedCoreTags.length,
    secondaryTagCount: matchedSecondaryTags.length,
    modernTagCount: matchedModernTags.length,
    tagWeight,
    matchedCoreTags,
    matchedSecondaryTags,
    matchedModernTags,
    uniqueFeatureTags,
    differentiationLabels,
  };
}

// ============ 筛选配置 ============

// 回合制游戏标签（必须包含回合制特征）
// 参考主页的 expandGenreSearchTerms 逻辑
const TURN_BASED_TAGS = [
  "Turn-Based",
  "Turn-Based Strategy",
  "Turn-Based Tactics",
  "Turn-Based Combat",
  "Turn-Based RPG",
  "Turn Based",
  "Tactical RPG",
  "回合制",
  "回合",
];

// 宝可梦Like核心标签
const POKEMON_LIKE_TAGS = [
  "Creature Collector",
  "Monster Catching",
  "Monster Taming",
  "Creature Collection",
];

// 黑名单标签(这些类型的游戏不值得参考)
const BLACKLIST_TAGS = [
  "Board Game",
  "Grand Strategy",
  "4X Strategy",
  "NSFW",
  "Hentai",
  "Text-Based",
  "Sexual Content",
];

// 测试版/预发布版游戏关键词（名称匹配，不区分大小写）
// 这些游戏会降低搜索质量，应该被默认过滤
const TEST_VERSION_KEYWORDS = [
  // 常见测试版标识
  "beta", "α", "alpha", "β", "betta",
  "demo", "trial", "demo version",
  "early access", "pre-release", "pre release",
  "prototype", "tech demo",
  "test build", "testing", "test version",
  "搪瓷", // "Early Access" 的错误翻译
  // 常见测试版后缀格式
  " (beta)", " [beta]", " (demo)", " [demo]",
  " (alpha)", " [alpha]", " (test)", " [test]",
  " (prototype)", " (early access)",
  // Steam 常见测试版标识
  " - beta", " - demo", " - test",
  // 中文常见测试版标识
  " 测试版", " 试玩版", " 体验版", " 抢先体验",
];

// 检查是否是测试版/预发布版游戏（通过名称判断）
function detectTestVersionByName(name: string): boolean {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  
  // 方法1：精确匹配关键词
  for (const keyword of TEST_VERSION_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      return true;
    }
  }
  
  // 方法2：检测常见模式
  // 例如："Game Name (Beta)" 或 "Game Name - Beta"
  const testPatterns = [
    /\s*[\(\[\-]\s*(beta|alpha|demo|test|prototype|early\s*access|搪瓷)\s*[\)\]\-]/i,
    /\s*[\(\[\-]\s*[\d.]+\s*(beta|alpha|b)\s*[\)\]\-]/i,  // (1.0 Beta)
    /beta\s*v?\d/i,
  ];
  
  for (const pattern of testPatterns) {
    if (pattern.test(lowerName)) {
      return true;
    }
  }
  
  return false;
}

// 检查是否是测试版/预发布版游戏（通过Steam标签判断）
function isTestVersionByTag(tags: string[], categories: string[]): boolean {
  const allTags = [...tags.map(t => t.toLowerCase()), ...categories.map(c => c.toLowerCase())];
  
  // Early Access 标签
  if (allTags.some(t => t.includes("early access"))) {
    return true;
  }
  
  return false;
}

// 检查是否是回合制游戏
function isTurnBased(tags: string[], genres: string[]): boolean {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const normalizedGenres = genres.map((g) => g.toLowerCase());

  return TURN_BASED_TAGS.some((tb) => {
    const tbLower = tb.toLowerCase();
    return (
      normalizedTags.some((t) => t.includes(tbLower)) ||
      normalizedGenres.some((g) => g.includes(tbLower))
    );
  });
}

// ============ 数据库加载 ============

const dbCache: {
  games: GameRecord[];
  loadedAt: number | null;
  loadError: string | null;
} = {
  games: [],
  loadedAt: null,
  loadError: null,
};

const DB_FILE = path.join(process.cwd(), "public", "data", "games-index.json");

function normalizeTags(raw: Record<string, number> | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.keys(raw);
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

function wilsonScore(positive: number, negative: number): number {
  const n = positive + negative;
  if (n === 0) return 0;
  const p = positive / n;
  const z = 1.64485;
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, Math.min(1, (center - spread) / denominator));
}

function getReviewScoreDesc(score: number): string {
  if (score >= 95) return "Overwhelmingly Positive";
  if (score >= 80) return "Very Positive";
  if (score >= 70) return "Mostly Positive";
  if (score >= 40) return "Mixed";
  if (score >= 20) return "Mostly Negative";
  return "Very Negative";
}

function checkPokemonLike(tags: string[], genres: string[]): { isPokemonLike: boolean; matchingTags: string[] } {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const matchingTags: string[] = [];

  for (const tag of POKEMON_LIKE_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase()))) {
      matchingTags.push(tag);
    }
  }

  return {
    isPokemonLike: matchingTags.length > 0,
    matchingTags,
  };
}

function isBlacklisted(tags: string[], genres: string[]): boolean {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  return BLACKLIST_TAGS.some((bl) => normalizedTags.some((t) => t.includes(bl.toLowerCase())));
}

function transformGame(appId: string, raw: RawGameData): GameRecord {
  const owners = parseEstimatedOwners(raw.estimated_owners);
  const totalReviews = raw.positive + raw.negative;
  const reviewScore = totalReviews > 0 ? Math.round((raw.positive / totalReviews) * 100) : 0;
  const tags = normalizeTags(raw.tags);
  const categories = raw.categories || [];

  const pokemonCheck = checkPokemonLike(tags, raw.genres || []);
  const blacklisted = isBlacklisted(tags, raw.genres || []);
  const turnBased = isTurnBased(tags, raw.genres || []);

  // 测试版检测：数据源标记 > 名称检测 > 标签检测
  const isTestByData = raw._is_test_version === true;
  const isTestByName = detectTestVersionByName(raw.name || "");
  const isTestByTag = isTestVersionByTag(tags, categories);
  const isTest = isTestByData || isTestByName || isTestByTag;
  const testVersionType: "name" | "tag" | "data" | "none" = isTestByData ? "data" : isTestByName ? "name" : isTestByTag ? "tag" : "none";

  const wilson = wilsonScore(raw.positive, raw.negative);

  const metacriticScore = typeof raw.metacritic_score === "number" && raw.metacritic_score > 0
    ? raw.metacritic_score
    : null;

  // 计算标签权重
  const tagWeight = calculateTagWeight(tags);

  return {
    id: appId,
    steamAppId: appId,
    name: raw.name || "",
    shortDescription: raw.short_description || "",
    developers: raw.developers || [],
    publishers: raw.publishers || [],
    genres: raw.genres || [],
    tags,
    categories,
    releaseDate: raw.release_date || null,
    isFree: raw.price === 0,
    price: raw.price,
    estimatedOwners: owners.value,
    estimatedOwnersMin: owners.min,
    estimatedOwnersMax: owners.max,
    peakCCU: raw.peak_ccu,
    steamReviews: totalReviews > 0 ? {
      totalPositive: raw.positive,
      totalNegative: raw.negative,
      totalReviews,
      reviewScore,
      reviewScoreDescription: getReviewScoreDesc(reviewScore),
    } : null,
    headerImage: raw.header_image || null,
    screenshots: raw.screenshots || [],
    steamUrl: `https://store.steampowered.com/app/${appId}`,
    isPokemonLike: pokemonCheck.isPokemonLike,
    pokemonLikeTags: pokemonCheck.matchingTags,
    wilsonScore: wilson,
    pool: null, // 动态计算，不在这里设置
    isTurnBased: turnBased,
    isTestVersion: isTest,
    testVersionType,
    // 标签权重系统
    coreTagCount: tagWeight.coreTagCount,
    secondaryTagCount: tagWeight.secondaryTagCount,
    modernTagCount: tagWeight.modernTagCount,
    tagWeight: tagWeight.tagWeight,
    matchedCoreTags: tagWeight.matchedCoreTags,
    matchedSecondaryTags: tagWeight.matchedSecondaryTags,
    matchedModernTags: tagWeight.matchedModernTags,
    uniqueFeatureTags: tagWeight.uniqueFeatureTags,
    differentiationLabels: tagWeight.differentiationLabels,
  };
}

/**
 * 按游戏名称去重，保留拥有者数量最多的条目
 * 拥有者相同时，取评论数最多的
 * Steam 上同一游戏可能存在 Demo 版、限定版、捆绑包等多个条目
 */
function deduplicateByName(games: GameRecord[]): GameRecord[] {
  const map = new Map<string, GameRecord>();

  for (const game of games) {
    if (!game.name) continue;
    const key = game.name.toLowerCase().trim();
    const existing = map.get(key);
    const existingTotalReviews = existing?.steamReviews?.totalReviews ?? 0;
    const gameTotalReviews = game.steamReviews?.totalReviews ?? 0;

    if (!existing) {
      map.set(key, game);
    } else if (
      game.estimatedOwners > existing.estimatedOwners ||
      (game.estimatedOwners === existing.estimatedOwners && gameTotalReviews > existingTotalReviews)
    ) {
      map.set(key, game);
    }
  }

  return Array.from(map.values());
}

function loadDatabase(): GameRecord[] {
  const now = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  // 开发环境缓存 1 分钟，生产环境缓存 5 分钟
  const cacheValid =
    dbCache.games.length > 0 &&
    dbCache.loadedAt !== null &&
    (isProduction || now - dbCache.loadedAt < 60 * 1000);

  if (cacheValid) {
    console.log(`[Mode2] 使用缓存的 ${dbCache.games.length} 个游戏 (距上次加载 ${Math.round((now - dbCache.loadedAt!) / 1000)}s 前)`);
    return dbCache.games;
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      dbCache.loadError = `数据库文件不存在: ${DB_FILE}`;
      console.error("[Mode2] 文件不存在:", DB_FILE);
      return [];
    }

    const loadStart = Date.now();
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    console.log(`[Mode2] 读取文件完成，耗时 ${Date.now() - loadStart}ms`);

    const parseStart = Date.now();
    const rawData = JSON.parse(raw) as Record<string, RawGameData>;
    console.log(`[Mode2] 解析完成，共 ${Object.keys(rawData).length} 条数据，耗时 ${Date.now() - parseStart}ms`);

    const transformStart = Date.now();
    const games: GameRecord[] = [];
    let testVersionCount = 0;
    let turnBasedCount = 0;

    for (const [appId, data] of Object.entries(rawData)) {
      const game = transformGame(appId, data);
      games.push(game);
      if (game.isTestVersion) testVersionCount++;
      if (game.isTurnBased) turnBasedCount++;
    }

    // 去重：同名游戏保留拥有者最多的条目
    const deduped = deduplicateByName(games);
    console.log(`[Mode2] 去重完成，保留 ${deduped.length} 个（移除 ${games.length - deduped.length} 个重复）`);

    dbCache.games = deduped;
    dbCache.loadedAt = now;
    dbCache.loadError = null;
    console.log(`[Mode2] 数据转换完成，耗时 ${Date.now() - transformStart}ms，加载 ${deduped.length} 个游戏，其中测试版: ${testVersionCount}，回合制: ${turnBasedCount}`);

    return deduped;
  } catch (e) {
    const msg = `加载数据库失败: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[Mode2]", msg);
    dbCache.loadError = msg;
    return [];
  }
}

// ============ 池子计算逻辑 ============

interface PoolConfig {
  poolA: {
    minRating: number;
    minReviews: number;
    excludePokemonLike: boolean;
  };
  poolB: {
    minRating: number;
    minReviews: number;
    requirePokemonLike: boolean;
  };
  poolC: {
    minRating: number;
    maxRating: number;
    minReviews: number;
    requirePokemonLike: boolean;
  };
}

function calculatePool(
  game: GameRecord,
  config: PoolConfig
): "A" | "B" | "C" | null {
  const { steamReviews, isPokemonLike, isPokemonLike: pokemonLike, tags } = game;

  // 必须有评价数据
  if (!steamReviews || steamReviews.totalReviews === 0) {
    return null;
  }

  const { reviewScore, totalReviews } = steamReviews;
  const blacklisted = isBlacklisted(tags, game.genres || []);

  // 黑名单游戏不进入任何池子
  if (blacklisted) {
    return null;
  }

  // A池: 普通回合制游戏（不是宝可梦Like）
  if (!pokemonLike && reviewScore >= config.poolA.minRating && totalReviews >= config.poolA.minReviews) {
    return "A";
  }

  // B池: 宝可梦Like + 高好评率
  if (pokemonLike && reviewScore >= config.poolB.minRating && totalReviews >= config.poolB.minReviews) {
    return "B";
  }

  // C池: 宝可梦Like + 中等好评率
  if (
    pokemonLike &&
    reviewScore >= config.poolC.minRating &&
    reviewScore <= config.poolC.maxRating &&
    totalReviews >= config.poolC.minReviews
  ) {
    return "C";
  }

  return null;
}

// ============ 筛选逻辑 ============

function filterGames(
  allGames: GameRecord[],
  options: {
    pools?: ("A" | "B" | "C")[];
    poolConfig: PoolConfig;
    query?: string;
    sortBy?: "wilson" | "rating" | "reviews" | "date";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    yearsFilter?: number; // 只显示最近N年内上线的游戏，0表示不过滤
    minReleaseDate?: string;
    maxReleaseDate?: string;
    excludeTestVersions?: boolean; // 默认过滤测试版
    priceMin?: number;
    priceMax?: number;
    modernTagFilter?: "hasCore" | "hasModern";
    featureTagFilter?: string;
  }
): { results: GameRecord[]; total: number; stats: PoolStats; priceStats?: PriceStats } {
  // 默认过滤测试版
  const excludeTest = options.excludeTestVersions !== false;

  // 0. 测试版过滤（先于其他过滤执行）
  let filtered = allGames;
  if (excludeTest) {
    filtered = filtered.filter((g) => !g.isTestVersion);
  }

  // 1. 计算每个游戏的池子归属
  const gamesWithPools = filtered.filter((g) => g.isTurnBased).map((game) => ({
    ...game,
    pool: calculatePool(game, options.poolConfig),
  }));

  // 2. 日期过滤（先应用日期筛选）
  let dateFiltered = gamesWithPools;
  const applyDateFilter = (games: typeof dateFiltered): typeof dateFiltered => {
    return games.filter((g) => {
      if (!g.releaseDate) return false;
      const gameTime = new Date(g.releaseDate).getTime();

      // 近N年筛选
      if (options.yearsFilter && options.yearsFilter > 0) {
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - options.yearsFilter);
        const cutoffTime = cutoffDate.getTime();
        if (gameTime < cutoffTime) return false;
      }

      // 自定义日期范围
      if (options.minReleaseDate) {
        const minTime = new Date(options.minReleaseDate).getTime();
        if (gameTime < minTime) return false;
      }
      if (options.maxReleaseDate) {
        const maxTime = new Date(options.maxReleaseDate).getTime();
        if (gameTime > maxTime) return false;
      }

      return true;
    });
  };
  dateFiltered = applyDateFilter(dateFiltered);

  // 统计日期筛选后的回合制游戏总数（不含池子筛选）
  const totalTurnBased = dateFiltered.length;

  // 3. 池子筛选
  let results = dateFiltered;
  if (options.pools && options.pools.length > 0) {
    results = results.filter((g) => g.pool && options.pools!.includes(g.pool));
  } else {
    results = results.filter((g) => g.pool !== null);
  }

  // 4. 文本搜索
  if (options.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    results = results.filter((g) => {
      return (
        g.name.toLowerCase().includes(q) ||
        g.shortDescription.toLowerCase().includes(q) ||
        g.tags.some((t) => t.toLowerCase().includes(q)) ||
        g.developers.some((d) => d.toLowerCase().includes(q))
      );
    });
  }

  // 5. 价格筛选
  if (options.priceMin !== undefined || options.priceMax !== undefined) {
    results = results.filter((g) => {
      if (options.priceMin !== undefined && g.price < options.priceMin) return false;
      if (options.priceMax !== undefined && g.price > options.priceMax) return false;
      return true;
    });
  }

  // 6. 特色标签筛选
  if (options.modernTagFilter || options.featureTagFilter) {
    results = results.filter((g) => {
      // 核心标签筛选
      if (options.modernTagFilter === "hasCore" && g.coreTagCount === 0) {
        return false;
      }
      // 现代融合标签筛选
      if (options.modernTagFilter === "hasModern" && g.modernTagCount === 0) {
        return false;
      }
      // 具体特色标签筛选
      if (options.featureTagFilter) {
        const featureTag = FEATURE_TAGS.find((f) => f.key === options.featureTagFilter);
        if (featureTag) {
          const hasTag = g.uniqueFeatureTags.some((tag) =>
            featureTag.tags.some((ft) => tag.toLowerCase().includes(ft.toLowerCase()))
          );
          if (!hasTag) return false;
        }
      }
      return true;
    });
  }

  // 7. 排序
  results.sort((a, b) => {
    let cmp = 0;
    switch (options.sortBy) {
      case "wilson":
        cmp = b.wilsonScore - a.wilsonScore;
        break;
      case "rating":
        cmp = (b.steamReviews?.reviewScore ?? 0) - (a.steamReviews?.reviewScore ?? 0);
        break;
      case "reviews":
        cmp = (b.steamReviews?.totalReviews ?? 0) - (a.steamReviews?.totalReviews ?? 0);
        break;
      case "date":
        cmp = new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime();
        break;
      default:
        cmp = b.wilsonScore - a.wilsonScore;
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name, "zh-CN");
    return options.sortOrder === "asc" ? -cmp : cmp;
  });

  // 6. 统计各池数量（基于筛选后的结果）
  const stats: PoolStats = {
    total: results.length,
    totalTurnBased: results.length, // 当前筛选条件下的回合制游戏总数
    poolA: results.filter((g) => g.pool === "A").length,
    poolB: results.filter((g) => g.pool === "B").length,
    poolC: results.filter((g) => g.pool === "C").length,
  };

  // 7. 计算价格统计
  const priceStats = calculatePriceStats(results);

  // 8. 分页
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const offset = (page - 1) * pageSize;
  const paged = results.slice(offset, offset + pageSize);

  return { results: paged, total: results.length, stats, priceStats };
}

// 获取各池子的游戏数量（用于显示预览）
function getPoolCounts(
  allGames: GameRecord[],
  poolConfig: PoolConfig,
  pools?: ("A" | "B" | "C")[],
  yearsFilter?: number,
  minReleaseDate?: string,
  maxReleaseDate?: string,
  excludeTestVersions?: boolean
): PoolStats {
  let poolA = 0, poolB = 0, poolC = 0;
  let totalTurnBased = 0;

  // 首先筛选回合制游戏（并过滤测试版）
  const excludeTest = excludeTestVersions !== false;
  let filteredGames = allGames.filter((g) => g.isTurnBased);
  if (excludeTest) {
    filteredGames = filteredGames.filter((g) => !g.isTestVersion);
  }
  const turnBasedGames = filteredGames;

  for (const game of turnBasedGames) {
    const pool = calculatePool(game, poolConfig);

    // 时间过滤
    if (!game.releaseDate) continue;
    const releaseTime = new Date(game.releaseDate).getTime();

    if (yearsFilter && yearsFilter > 0) {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsFilter);
      const cutoffTime = cutoffDate.getTime();
      if (releaseTime < cutoffTime) continue;
    }
    if (minReleaseDate) {
      const minTime = new Date(minReleaseDate).getTime();
      if (releaseTime < minTime) continue;
    }
    if (maxReleaseDate) {
      const maxTime = new Date(maxReleaseDate).getTime();
      if (releaseTime > maxTime) continue;
    }

    // 统计符合条件的回合制游戏数量
    totalTurnBased++;

    // 如果指定了池子筛选，只统计这些池子
    if (pools && pools.length > 0) {
      if (!pools.includes(pool as "A" | "B" | "C")) {
        continue;
      }
    } else {
      // 没有指定筛选时，跳过不在任何池子的游戏
      if (pool === null) {
        continue;
      }
    }

    if (pool === "A") poolA++;
    else if (pool === "B") poolB++;
    else if (pool === "C") poolC++;
  }

  return { total: poolA + poolB + poolC, totalTurnBased, poolA, poolB, poolC };
}

// 计算价格统计
function calculatePriceStats(games: GameRecord[]): PriceStats {
  const prices = games
    .map((g) => g.price)
    .filter((p) => p >= 0);

  if (prices.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      distribution: { free: 0, under10: 0, under20: 0, under30: 0, under50: 0, over50: 0 },
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / prices.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const distribution = {
    free: prices.filter((p) => p === 0).length,
    under10: prices.filter((p) => p > 0 && p < 10).length,
    under20: prices.filter((p) => p >= 10 && p < 20).length,
    under30: prices.filter((p) => p >= 20 && p < 30).length,
    under50: prices.filter((p) => p >= 30 && p < 50).length,
    over50: prices.filter((p) => p >= 50).length,
  };

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    distribution,
  };
}

// ============ API入口 ============

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  console.log("[Mode2] 开始处理请求");

  // 获取池子参数
  const pools = searchParams.getAll("pool").filter((p) => ["A", "B", "C"].includes(p)) as ("A" | "B" | "C")[];

  // A池配置
  const poolA_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolA_minRating") || "75", 10) || 75));
  const poolA_minReviews = Math.max(0, parseInt(searchParams.get("poolA_minReviews") || "200", 10) || 200);

  // B池配置
  const poolB_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolB_minRating") || "75", 10) || 75));
  const poolB_minReviews = Math.max(0, parseInt(searchParams.get("poolB_minReviews") || "50", 10) || 50);

  // C池配置
  const poolC_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolC_minRating") || "40", 10) || 40));
  const poolC_maxRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolC_maxRating") || "74", 10) || 74));
  const poolC_minReviews = Math.max(0, parseInt(searchParams.get("poolC_minReviews") || "50", 10) || 50);

  const query = searchParams.get("q")?.trim().slice(0, 200) || "";
  const rawSortBy = searchParams.get("sortBy") ?? "";
  const sortBy: "wilson" | "rating" | "reviews" | "date" =
    rawSortBy === "rating" || rawSortBy === "reviews" || rawSortBy === "date" || rawSortBy === "wilson"
      ? rawSortBy
      : "wilson";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(parseInt(searchParams.get("page") || "1", 10) || 1, 1000));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "24", 10) || 24));

  // 时间过滤：只显示最近N年内上线的游戏
  const yearsFilter = Math.max(0, Math.min(100, parseInt(searchParams.get("yearsFilter") || "0", 10) || 0));
  const minReleaseDate = searchParams.get("minReleaseDate")?.trim() || undefined;
  const maxReleaseDate = searchParams.get("maxReleaseDate")?.trim() || undefined;

  // 是否过滤测试版（默认 true）
  const excludeTestVersions = searchParams.get("excludeTestVersions") !== "false";

  // 价格筛选参数
  const priceMin = searchParams.get("priceMin") ? parseFloat(searchParams.get("priceMin")!) : undefined;
  const priceMax = searchParams.get("priceMax") ? parseFloat(searchParams.get("priceMax")!) : undefined;

  // 特色标签筛选参数
  const modernTagFilter = searchParams.get("modernTagFilter") as "hasCore" | "hasModern" | undefined;
  const featureTagFilter = searchParams.get("featureTagFilter") || undefined;

  // 是否只获取统计信息
  const statsOnly = searchParams.get("statsOnly") === "true";

  console.log("[Mode2] 开始加载数据库");
  const allGames = loadDatabase();
  console.log(`[Mode2] 数据库加载完成，共 ${allGames.length} 个游戏`);

  if (dbCache.loadError) {
    return NextResponse.json(
      { error: `数据库加载失败: ${dbCache.loadError}`, results: [], stats: { total: 0, totalTurnBased: 0, poolA: 0, poolB: 0, poolC: 0 } },
      { status: 500 }
    );
  }

  if (allGames.length === 0) {
    return NextResponse.json(
      { error: "游戏数据库为空", results: [], stats: { total: 0, totalTurnBased: 0, poolA: 0, poolB: 0, poolC: 0 } },
      { status: 200 }
    );
  }

  // 池子配置
  const poolConfig: PoolConfig = {
    poolA: { minRating: poolA_minRating, minReviews: poolA_minReviews, excludePokemonLike: true },
    poolB: { minRating: poolB_minRating, minReviews: poolB_minReviews, requirePokemonLike: true },
    poolC: { minRating: poolC_minRating, maxRating: poolC_maxRating, minReviews: poolC_minReviews, requirePokemonLike: true },
  };

  // 只获取统计信息
  if (statsOnly) {
    const stats = getPoolCounts(
      allGames, poolConfig, pools.length > 0 ? pools : undefined,
      yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions
    );
    return NextResponse.json({
      stats,
      poolConfig,
      totalGames: allGames.length,
      excludeTestVersions,
    });
  }

  const { results, total, stats, priceStats } = filterGames(allGames, {
    pools: pools.length > 0 ? pools : undefined,
    poolConfig,
    query,
    sortBy,
    sortOrder,
    page,
    pageSize,
    yearsFilter,
    minReleaseDate,
    maxReleaseDate,
    excludeTestVersions,
    priceMin,
    priceMax,
    modernTagFilter,
    featureTagFilter,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    results,
    total,
    page,
    pageSize,
    totalPages,
    stats,
    priceStats,
    poolConfig,
    query,
    poolFilters: pools.length > 0 ? pools : ["A", "B", "C"],
    description: {
      A: "神作参考池 - 普通回合制游戏，优秀UI和战斗机制参考",
      B: "核心竞品池 - 宝可梦Like成功案例，学习成功要素",
      C: "避坑指南池 - 宝可梦Like争议/失败案例，避开玩家痛点",
    },
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
