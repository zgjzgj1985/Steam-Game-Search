/**
 * 预计算脚本 — 将原始数据转换为优化后的缓存
 * 
 * 支持两种数据源:
 * 1. SQLite数据库 (games.db) - 优先使用，性能更好
 * 2. JSON文件 (games-index.json) - 降级使用
 * 
 * 运行方式: npx ts-node scripts/precompute.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============ 类型定义 ============

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
  _is_playtest?: boolean;
  _is_suspicious_delisted?: boolean;
}

// 预计算后的游戏记录
interface PrecomputedGame {
  id: string;
  steamAppId: string;
  name: string;
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
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  wilsonScore: number;
  isTurnBased: boolean;
  isTestVersion: boolean;
  testVersionType: "name" | "tag" | "data" | "none";
  isSuspiciousDelisted?: boolean;
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

interface CacheMeta {
  version: number;
  createdAt: string;
  sourceFile: string;
  source: 'sqlite' | 'json';
  totalRaw: number;
  totalAfterDedup: number;
  totalTurnBased: number;
  totalTestVersion: number;
  poolA: number;
  poolB: number;
  poolC: number;
}

// 动态标签提取结果
export interface FeatureTagOption {
  key: string;
  label: string;
  tag: string;
  count: number;
  gameCount: number;
  coverage: number;
  avgWilson: number;
}

interface CacheData {
  meta: CacheMeta;
  games: PrecomputedGame[];
  featureTagOptions?: FeatureTagOption[];
}

// ============ 标签配置 ============

const TURN_BASED_TAGS = [
  "Turn-Based", "Turn-Based Strategy", "Turn-Based Tactics",
  "Turn-Based Combat", "Turn-Based RPG", "Turn Based",
  "Tactical RPG", "回合制", "回合",
];

const POKEMON_LIKE_TAGS = [
  "Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection",
];

const BLACKLIST_TAGS = [
  "Board Game", "Grand Strategy", "4X Strategy", "NSFW", "Hentai",
  "Text-Based", "Sexual Content",
];

const CORE_TAGS = [
  "Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection",
  "养宠", "养成", "宠物养成", "怪物养成",
];

const SECONDARY_TAGS = [
  "JRPG", "Party-Based RPG", "Tactical RPG", "角色扮演", "RPG",
];

const MODERN_TAGS = [
  "Roguelite", "Roguelike", "Deckbuilding", "开放世界", "Open World",
  "Metroidvania", "银河恶魔城", "Survival", "Crafting", "生存", "建造",
  "牌组构建", "卡牌构建", "形态融合", "类肉鸽",
];

const DIFFERENTIATION_LABELS: Record<string, string> = {
  "Survival": "生存建造", "Crafting": "合成系统", "Metroidvania": "银河恶魔城",
  "开放世界": "开放世界", "Open World": "开放世界",
  "Roguelite": "肉鸽融合", "Roguelike": "肉鸽融合",
  "Deckbuilding": "牌组构建", "牌组构建": "牌组构建", "卡牌构建": "牌组构建",
  "形态融合": "形态融合", "银河恶魔城": "银河恶魔城", "Survival Game": "生存建造",
};

const TAG_CHINESE_NAMES: Record<string, string> = {
  "Creature Collector": "生物收集", "Monster Catching": "怪物捕捉",
  "Monster Tamer": "怪物养成", "Collectathon": "收集冒险",
  "生物收集": "生物收集", "怪物捕捉": "怪物捕捉", "怪物养成": "怪物养成",
  "JRPG": "JRPG", "Party-Based RPG": "队伍RPG", "Tactical RPG": "战术RPG",
  "Turn-Based Tactics": "回合制战术", "Turn-Based Strategy": "回合制策略",
  "回合制策略": "回合制策略", "角色扮演": "角色扮演", "RPG": "RPG",
  "Survival": "生存建造", "Survival Game": "生存建造", "Crafting": "合成系统",
  "Roguelite": "肉鸽融合", "Roguelike": "类肉鸽", "Deckbuilding": "牌组构建",
  "Open World": "开放世界", "开放世界": "开放世界",
  "Metroidvania": "银河恶魔城", "银河恶魔城": "银河恶魔城",
  "卡牌构建": "牌组构建", "牌组构建": "牌组构建", "形态融合": "形态融合",
  "2D": "2D", "3D": "3D", "Pixel Graphics": "像素风格",
  "Anime": "动漫风格", "Fantasy": "奇幻", "Magic": "魔法",
  "Adventure": "冒险", "Story Rich": "剧情丰富",
  "Multiple Endings": "多结局", "Singleplayer": "单人", "Indie": "独立游戏",
};

const CHINESE_TAG_MAP: Record<string, string> = {
  "Roguelite": "肉鸽融合", "Roguelike": "类肉鸽", "Deckbuilding": "牌组构建",
  "Survival": "生存建造", "Crafting": "合成系统", "Open World": "开放世界",
  "开放世界": "开放世界", "Metroidvania": "银河恶魔城", "银河恶魔城": "银河恶魔城",
  "Card Game": "卡牌游戏", "Card Battler": "卡牌战斗",
  "Base Building": "基地建设", "Farming Sim": "农场模拟", "Farming": "农耕",
  "Visual Novel": "视觉小说", "Dating Sim": "恋爱模拟",
  "Hack and Slash": "砍杀", "Action RPG": "动作RPG", "ARPG": "动作RPG",
  "Bullet Hell": "弹幕射击", "Rhythm": "音乐节奏", "Time Travel": "时间旅行",
  "Choices Matter": "选择影响", "Investigation": "调查取证",
  "Minigames": "小游戏", "Automation": "自动化",
  "Time Management": "时间管理", "Resource Management": "资源管理",
  "Procedural Generation": "程序生成", "Permadeath": "永久死亡",
  "Dungeon Crawler": "地牢爬行",
  "Party-Based RPG": "队伍RPG", "Tactical RPG": "战术RPG",
  "Immersive Sim": "沉浸模拟", "Walking Simulator": "步行模拟",
  "Action Roguelike": "动作肉鸽", "Traditional Roguelike": "传统肉鸽",
  "Roguelite Deckbuilder": "肉鸽卡牌", "Survival Horror": "生存恐怖",
  "Action-Adventure": "动作冒险", "Combat": "战斗系统",
  "Building": "建造", "Base-Building": "基地建设",
  "Trading Card Game": "集换式卡牌", "Open World Survival Craft": "开放世界生存建造",
};

const TEST_VERSION_KEYWORDS = [
  "beta", "α", "alpha", "β", "betta", "demo", "trial", "demo version",
  "early access", "pre-release", "pre release", "prototype", "tech demo",
  "test build", "testing", "test version",
  " (beta)", " [beta]", " (demo)", " [demo]", " (alpha)", " [alpha]",
  " (test)", " [test]", " (prototype)", " (early access)",
  " - beta", " - demo", " - test",
  " 测试版", " 试玩版", " 体验版", " 抢先体验",
];

const TEST_PATTERNS = [
  /\s*[\(\[\-]\s*(beta|alpha|demo|test|prototype|early\s*access)\s*[\)\]\-]/i,
  /\s*[\(\[\-]\s*[\d.]+\s*(beta|alpha|b)\s*[\)\]\-]/i,
  /beta\s*v?\d/i,
];

const POOL_CONFIG = {
  poolA: { minRating: 75, minReviews: 50, excludePokemonLike: true },
  poolB: { minRating: 75, minReviews: 50, requirePokemonLike: true },
  poolC: { minRating: 40, maxRating: 74, minReviews: 50, requirePokemonLike: true },
};

// ============ Steam API ID 映射表（2025年末 Steam API 改版）============
// Steam API 在 2025 年末改变了 genres/categories 的返回格式：
// 旧格式: genres=[{id:"1",description:"Action"}], categories=[{id:2,description:"..."}]
// 新格式: genres=["1","25","4"],         categories=[2,10,29]
// 这两个映射表用于在预计算时将数字 ID 转换为可读文本

const GENRE_ID_MAP: Record<string, string> = {
  // ===== 游戏类型（基于2026年Steam API实际数据验证）====
  // Steam 在 2025年末至2026年初重构了 genres ID 体系
  // 验证来源：直接调用 Steam API 对比第三方数据集 ID
  "1": "Action",
  "2": "Strategy",
  "3": "RPG",
  "4": "Casual",
  // 5: (未分配)
  // 6: (未分配)
  "7": "Education",
  "8": "Utilities",
  "9": "Racing",
  "10": "Photo Editing",
  "11": "Game Servers",
  "12": "Software Training",
  "13": "Sports",
  "14": "Racing",
  "15": "Game Development",
  "16": "Education",
  "17": "Documentary",
  "18": "Sports",
  "19": "Software Training",
  "20": "Software Training",
  "21": "Tutorial",
  "22": "Utilities",
  "23": "Indie",
  "24": "Video Production",
  "25": "Adventure",
  "26": "Violent",
  "27": "Nudity",
  "28": "Simulation",
  "29": "Massively Multiplayer",
  "30": "Farming Sim",
  "31": "Sports",
  "32": "Utilities",
  "33": "Software Training",
  "34": "Utilities",
  // 35 以下为工具类（Audio/Sequencer/Animation等工具）
  "35": "Free To Play",
  "36": "Photo Editing",
  "37": "Free To Play",
  "38": "Software Training",
  "39": "Utilities",
  "40": "Education",
  "41": "Utilities",
  "42": "Utilities",
  "43": "Utilities",
  "44": "Utilities",
  "45": "Utilities",
  "46": "Utilities",
  "47": "Utilities",
  "48": "Utilities",
  "49": "Utilities",
  "50": "Utilities",
  "51": "Animation & Modeling",
  "52": "Audio Production",
  "53": "Design & Illustration",
  "54": "Education",
  "55": "Photo Editing",
  "56": "Software Training",
  "57": "Utilities",
  "58": "Video Production",
  "59": "Web Publishing",
  "60": "Game Development",
  "61": "Utilities",
  "62": "Utilities",
  "63": "Utilities",
  "64": "Utilities",
  "65": "Utilities",
  "66": "Utilities",
  "67": "Utilities",
  "68": "Utilities",
  "69": "Utilities",
  "70": "Early Access",
};

const CATEGORY_ID_MAP: Record<number, string> = {
  // ===== 多人/合作 (1-50) =====
  1: "Multi-player",
  2: "PvP",
  8: "Anti-Cheat",
  9: "Steam Cloud",
  10: "Steam Leaderboards",
  13: "Single-player",
  14: "Full controller support",
  15: "Steam Trading Cards",
  17: "Steam Workshop",
  18: "In-App Product",
  20: "Valve Anti-Cheat",
  21: "Captions available",
  22: "Includes Source SDK",
  23: "Includes Source Filmmaker",
  24: "Commentary available",
  25: "Dynamic Renaming",
  27: "Clan Chat",
  28: "Chat",
  29: "Voice Chat",
  30: "Broadcast",
  32: "User Generated Content",
  35: "Mods",
  36: "Online PvP",
  37: "Shared/Split Screen PvP",
  38: "Cross-Platform Multiplayer",
  39: "Online Co-op",
  41: "Co-op",
  42: "Local Co-op",
  43: "Shared/Split Screen Co-op",
  44: "Shared/Split Screen",
  47: "MMO",
  48: "Open World",
  49: "PvE",
  50: "Partial Controller Support",
  52: "Local Multi-player",
  53: "Asynchronous Multiplayer",
  54: "Turn-based",
  61: "Online Game",
  // ===== VR (62-80) =====
  62: "Virtual Reality",
  63: "SteamVR Teleportation",
  64: "3D Vision",
  65: "Tracked Motion Controllers",
  66: "Room Scale",
  67: "Seated",
  68: "Standing",
  69: "Native Vive",
  70: "Native Rift",
  71: "Native WMR",
  72: "GPU Access",
  73: "HDR",
  74: "Steam Input API",
  75: "Reflex",
  76: "DualSense",
  77: "DualShock",
  78: "Xbox",
  79: "Sega",
};

// ============ 工具函数 ============

function isNumericIdString(val: unknown): boolean {
  return typeof val === "string" && /^\d+$/.test(val);
}

function isNumericId(val: unknown): boolean {
  return typeof val === "number" && Number.isInteger(val);
}

/**
 * 将 genres 字段标准化为字符串数组
 * 兼容旧格式(对象数组)和新格式(数字ID字符串数组)
 */
function normalizeGenres(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];

  const first = raw[0];
  // 旧格式: [{id:"1",description:"Action"}]
  if (typeof first === "object" && first !== null && "description" in first) {
    return raw
      .map((g: { description?: string }) => g.description)
      .filter((d: string | undefined): d is string => Boolean(d));
  }
  // 新格式: ["1","25","4"] 或 [1, 25, 4]
  if (isNumericIdString(first) || isNumericId(first)) {
    return raw
      .map((id: unknown) => {
        const key = typeof id === "number" ? String(id) : id as string;
        return GENRE_ID_MAP[key] ?? null;
      })
      .filter((d: string | null): d is string => d !== null);
  }
  // 正常文本数组: ["Action","RPG"]
  if (typeof first === "string") {
    return raw as string[];
  }
  return [];
}

/**
 * 将 categories 字段标准化为字符串数组
 * 兼容旧格式(对象数组)和新格式(数字ID数组)
 */
function normalizeCategories(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];

  const first = raw[0];
  // 旧格式: [{id:2,description:"Steam Play"}]
  if (typeof first === "object" && first !== null && "description" in first) {
    return raw
      .map((c: { description?: string }) => c.description)
      .filter((d: string | undefined): d is string => Boolean(d));
  }
  // 新格式: [2, 10, 29] 或 ["2","10","29"]
  if (isNumericId(first) || isNumericIdString(first)) {
    return raw
      .map((id: unknown) => {
        const key = typeof id === "number" ? id : parseInt(id as string, 10);
        return CATEGORY_ID_MAP[key] ?? null;
      })
      .filter((d: string | null): d is string => d !== null);
  }
  // 正常文本数组
  if (typeof first === "string") {
    return raw as string[];
  }
  return [];
}

function normalizeTags(raw: Record<string, number> | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  // 空对象 {} — Steam API 2025年末新格式
  if (typeof raw === "object" && Object.keys(raw).length === 0) return [];
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
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / 4) / n);
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

function checkPokemonLike(tags: string[]): string[] {
  const normalizedTags = tags.map((t) => String(t).toLowerCase());
  const matching: string[] = [];
  for (const tag of POKEMON_LIKE_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase()))) {
      matching.push(tag);
    }
  }
  return matching;
}

function isBlacklisted(tags: string[]): boolean {
  const normalizedTags = tags.map((t) => String(t).toLowerCase());
  return BLACKLIST_TAGS.some((bl) => normalizedTags.some((t) => t.includes(bl.toLowerCase())));
}

function isTurnBased(tags: string[], genres: string[]): boolean {
  const normalizedTags = tags.map((t) => String(t).toLowerCase());
  const normalizedGenres = genres.map((g) => String(g).toLowerCase());
  return TURN_BASED_TAGS.some((tb) => {
    const tbLower = tb.toLowerCase();
    return normalizedTags.some((t) => t.includes(tbLower)) ||
           normalizedGenres.some((g) => g.includes(tbLower));
  });
}

function detectTestVersionByName(name: string): boolean {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  for (const keyword of TEST_VERSION_KEYWORDS) {
    if (lowerName.includes(keyword)) return true;
  }
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(lowerName)) return true;
  }
  return false;
}

function isTestVersionByTag(tags: string[], categories: string[]): boolean {
  const all = [
    ...tags.map((t) => String(t).toLowerCase()),
    ...categories.map((c) => String(c).toLowerCase())
  ];
  return all.some((t) => t.includes("early access"));
}

function calculateTagWeight(tags: string[]) {
  const normalizedTags = tags.map((t) => String(t).toLowerCase());
  const exactMatch = (arr: string[], target: string): boolean =>
    arr.some((t) => t.toLowerCase() === target.toLowerCase());

  const matchedCoreTags: string[] = [];
  for (const tag of CORE_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase()))) {
      matchedCoreTags.push(tag);
    }
  }

  const coreSet = new Set(matchedCoreTags.map((t) => t.toLowerCase()));
  const matchedSecondaryTags: string[] = [];
  for (const tag of SECONDARY_TAGS) {
    if (normalizedTags.some((t) => t.includes(tag.toLowerCase())) && !coreSet.has(tag.toLowerCase())) {
      matchedSecondaryTags.push(tag);
    }
  }

  const matchedModernTags: string[] = [];
  for (const tag of MODERN_TAGS) {
    if (exactMatch(normalizedTags, tag)) {
      matchedModernTags.push(tag);
    }
  }

  const uniqueFeatureTags: string[] = [...matchedModernTags];
  const differentiationLabels: string[] = [];
  for (const tag of matchedModernTags) {
    const label = DIFFERENTIATION_LABELS[tag] || DIFFERENTIATION_LABELS[tag.charAt(0).toUpperCase() + tag.slice(1)] || tag;
    if (!differentiationLabels.includes(label)) {
      differentiationLabels.push(label);
    }
  }

  return {
    coreTagCount: matchedCoreTags.length,
    secondaryTagCount: matchedSecondaryTags.length,
    modernTagCount: matchedModernTags.length,
    tagWeight: matchedCoreTags.length * 3 + matchedSecondaryTags.length * 2 + matchedModernTags.length * 1,
    matchedCoreTags: matchedCoreTags.map((t) => TAG_CHINESE_NAMES[t] || t),
    matchedSecondaryTags: matchedSecondaryTags.map((t) => TAG_CHINESE_NAMES[t] || t),
    matchedModernTags: matchedModernTags.map((t) => TAG_CHINESE_NAMES[t] || t),
    uniqueFeatureTags,
    differentiationLabels,
  };
}

function calculatePool(game: { steamReviews: PrecomputedGame["steamReviews"]; isPokemonLike: boolean; tags: string[]; genres: string[] }): "A" | "B" | "C" | null {
  if (!game.steamReviews || game.steamReviews.totalReviews === 0) return null;
  if (isBlacklisted(game.tags)) return null;
  const { reviewScore, totalReviews } = game.steamReviews;
  if (!game.isPokemonLike && reviewScore >= POOL_CONFIG.poolA.minRating && totalReviews >= POOL_CONFIG.poolA.minReviews) return "A";
  if (game.isPokemonLike && reviewScore >= POOL_CONFIG.poolB.minRating && totalReviews >= POOL_CONFIG.poolB.minReviews) return "B";
  if (game.isPokemonLike && reviewScore >= POOL_CONFIG.poolC.minRating && reviewScore <= POOL_CONFIG.poolC.maxRating && totalReviews >= POOL_CONFIG.poolC.minReviews) return "C";
  return null;
}

function isMechanismTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  const mechanismKeywords = [
    "roguelite", "roguelike", "类肉鸽", "永久死亡", "permadeath",
    "deckbuilding", "牌组构建", "卡牌构建", "card game", "card battler",
    "survival", "生存", "crafting", "合成", "base building", "基地建设", "building",
    "farming", "farm", "农耕", "farming sim", "automation", "自动化",
    "open world", "开放世界", "metroidvania", "银河恶魔城",
    "hack and slash", "砍杀", "bullet hell", "弹幕",
    "action rpg", "arpg", "immersive sim", "沉浸",
    "visual novel", "视觉小说", "dating sim", "恋爱",
    "choices matter", "选择", "time travel", "时间旅行",
    "investigation", "调查", "rhythm", "音乐节奏", "minigames", "小游戏",
    "procedural generation", "程序生成", "time management", "时间管理",
    "resource management", "资源管理", "dungeon crawler", "地牢爬行",
    "形态融合", "沙盒", "塔防", "shooter", "射击", "tactical", "战术",
    "combat", "战斗", "sword", "剑",
  ];

  for (const kw of mechanismKeywords) {
    if (lower.includes(kw)) return true;
  }

  const exactMechanismTags = [
    "Roguelite", "Roguelike", "Deckbuilding", "Survival", "Crafting",
    "Open World", "Metroidvania", "Card Game", "Card Battler",
    "Building", "Farming", "Farming Sim", "Visual Novel", "Dating Sim",
    "Hack and Slash", "Action RPG", "ARPG", "Bullet Hell", "Rhythm",
    "Time Travel", "Choices Matter", "Investigation", "Minigames",
    "Permadeath", "Automation", "Time Management", "Resource Management",
    "Procedural Generation", "Base Building", "Immersive Sim",
    "Dungeon Crawler", "JRPG", "Party-Based RPG", "Tactical RPG",
    "Action Roguelike", "Traditional Roguelike", "Roguelite Deckbuilder",
    "Survival Horror", "生存建造", "合成系统", "牌组构建", "卡牌构建",
    "开放世界", "银河恶魔城", "形态融合", "农耕", "视觉小说",
    "恋爱模拟", "砍杀", "弹幕射击", "音乐节奏", "小游戏",
    "程序生成", "基地建设", "回合制", "回合", "战术RPG",
  ];

  for (const exact of exactMechanismTags) {
    if (lower === exact.toLowerCase() || lower.includes(exact.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function getNormalizedTagKey(lower: string): string {
  if (lower === "base building" || lower === "base-building") return "building";
  if (lower === "survival horror") return "survival";
  if (lower === "traditional roguelike") return "roguelike";
  if (lower === "action roguelike" || lower === "action roguelite" || lower === "roguelite deckbuilder") return "roguelite";
  if (lower === "farming") return "farming sim";
  if (lower === "card game") return "card battler";
  return lower;
}

function isExcludedTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  const baseTagSet = [
    ...TURN_BASED_TAGS.map((t) => t.toLowerCase()),
    ...POKEMON_LIKE_TAGS.map((t) => t.toLowerCase()),
    ...CORE_TAGS.map((t) => t.toLowerCase()),
    ...SECONDARY_TAGS.map((t) => t.toLowerCase()),
    "turn-based", "turn based", "turn-based strategy", "turn-based tactics",
    "turn-based combat", "turn-based rpg", "tactical rpg", "回合制", "回合",
    "jprg", "party-based rpg", "rpg", "角色扮演", "role playing", "role-playing",
    "creature collector", "monster catching", "monster taming", "creature collection",
    "养宠", "养成", "宠物养成", "怪物养成", "生物收集", "怪物捕捉",
    "creature collector", "monster tamer", "collectathon",
  ];

  for (const t of baseTagSet) {
    if (lower.includes(t)) return true;
  }

  const platformTags = [
    "indie", "singleplayer", "single player", "单人",
    "free to play", "free to play", "f2p", "pay to play",
    "2d", "3d", "2d graphics", "3d graphics", "pixel graphics",
    "colorful", "mod", "partial controller support",
    "steam achievements", "steam cloud", "steam workshop", "family sharing",
    "moddable", "includes source sdk", "windows", "mac os", "linux",
    "steam deck", "valve index", "game developer", "game development",
  ];

  for (const t of platformTags) {
    if (lower.includes(t)) return true;
  }

  const styleTags = [
    "exploration", "action", "adventure", "adventure game",
    "anime", "pixel", "cartoon", "hand-drawn", "stylized", "cute",
    "graphic", "atmospheric", "moody", "dark fantasy", "beautiful",
    "relaxing", "cozy", "wholesome", "nostalgia", "emotional", "dark",
    "cute", "hard", "difficult", "easy", "accessible",
    "fantasy", "magic", "sci-fi", "space", "horror", "cyberpunk",
    "stealth", "story rich", "narrative", "lore-rich", "supernatural",
    "alternate history", "historical",
    "replayability", "soundtrack", "beautiful", "lgbtq+",
    "choices", "multiple endings", "hidden object",
    "moba", "battle royale", "mmorpg",
    "top-down", "side scroller", "first-person", "third person",
  ];

  for (const t of styleTags) {
    if (lower.includes(t)) return true;
  }

  if (tag.length < 3 || tag.length > 30) return true;
  if (!/[a-z\u4e00-\u9fa5]/i.test(tag)) return true;
  if (/^\d{4}$/.test(tag)) return true;
  if (lower.includes("steam") || lower.includes("controller") || lower.includes("vr ")) return true;

  return false;
}

function extractFeatureTagsFromPoolB(games: PrecomputedGame[]): FeatureTagOption[] {
  const poolBGames = games.filter((g) => {
    const pool = calculatePool(g);
    return pool === "B";
  });

  if (poolBGames.length < 3) {
    console.warn(`   [动态标签] B池游戏不足(${poolBGames.length}个)，使用预设标签`);
    return getDefaultFeatureTags();
  }

  interface TagStat {
    rawTag: string;
    gameCount: number;
    totalWilson: number;
  }

  const tagStats = new Map<string, TagStat>();

  for (const game of poolBGames) {
    const seenInGame = new Set<string>();

    for (const tag of game.tags) {
      const lower = tag.toLowerCase();
      if (seenInGame.has(lower)) continue;
      if (isExcludedTag(tag)) continue;
      if (!isMechanismTag(tag)) continue;

      seenInGame.add(lower);
      const normalizedKey = getNormalizedTagKey(lower);
      const existing = tagStats.get(normalizedKey);
      if (existing) {
        existing.gameCount++;
        existing.totalWilson += game.wilsonScore;
      } else {
        tagStats.set(normalizedKey, {
          rawTag: tag,
          gameCount: 1,
          totalWilson: game.wilsonScore,
        });
      }
    }
  }

  const presetTags = [
    { rawTag: "Roguelite", label: "肉鸽融合" },
    { rawTag: "Survival", label: "生存建造" },
    { rawTag: "Deckbuilding", label: "牌组构建" },
    { rawTag: "Open World", label: "开放世界" },
    { rawTag: "Metroidvania", label: "银河恶魔城" },
    { rawTag: "Crafting", label: "合成系统" },
    { rawTag: "Farming Sim", label: "农耕" },
    { rawTag: "Visual Novel", label: "视觉小说" },
    { rawTag: "Dating Sim", label: "恋爱模拟" },
    { rawTag: "Card Game", label: "卡牌游戏" },
    { rawTag: "Hack and Slash", label: "砍杀" },
    { rawTag: "Action RPG", label: "动作RPG" },
    { rawTag: "Rhythm", label: "音乐节奏" },
    { rawTag: "Time Travel", label: "时间旅行" },
    { rawTag: "Procedural Generation", label: "程序生成" },
    { rawTag: "Automation", label: "自动化" },
    { rawTag: "Choices Matter", label: "选择影响" },
  ];

  const poolBSize = poolBGames.length;
  const result: FeatureTagOption[] = [];
  const usedTags = new Set<string>();

  for (const preset of presetTags) {
    const lower = preset.rawTag.toLowerCase();
    const stat = tagStats.get(lower);
    const gameCount = stat?.gameCount ?? 0;
    const avgWilson = stat ? stat.totalWilson / stat.gameCount : 0;

    if (gameCount >= 2 || (gameCount > 0 && gameCount >= poolBSize * 0.02)) {
      result.push({
        key: lower.replace(/[^a-z0-9]/g, "_"),
        label: preset.label,
        tag: preset.rawTag,
        count: gameCount,
        gameCount,
        coverage: poolBSize > 0 ? Math.round((gameCount / poolBSize) * 100) : 0,
        avgWilson: Math.round(avgWilson * 1000) / 1000,
      });
      usedTags.add(lower);
    }
  }

  const sortedDynamicTags = Array.from(tagStats.entries())
    .filter(([lower]) => !usedTags.has(lower))
    .sort((a, b) => b[1].gameCount - a[1].gameCount)
    .slice(0, 10);

  for (const [lower, stat] of sortedDynamicTags) {
    if (stat.gameCount < 2) continue;
    const avgWilson = stat.totalWilson / stat.gameCount;
    const chineseName = getTagChineseName(stat.rawTag);
    result.push({
      key: lower.replace(/[^a-z0-9]/g, "_"),
      label: chineseName,
      tag: stat.rawTag,
      count: stat.gameCount,
      gameCount: stat.gameCount,
      coverage: Math.round((stat.gameCount / poolBSize) * 100),
      avgWilson: Math.round(avgWilson * 1000) / 1000,
    });
  }

  result.sort((a, b) => b.coverage - a.coverage);

  console.log(`   [动态标签] 从 ${poolBGames.length} 个B池游戏中提取了 ${result.length} 个玩法融合标签`);
  if (result.length > 0) {
    const top5 = result.slice(0, 5).map((t) => `${t.label}(${t.gameCount}款)`).join(", ");
    console.log(`   [动态标签] Top5: ${top5}`);
  }

  return result;
}

function getTagChineseName(tag: string): string {
  const mapped = CHINESE_TAG_MAP[tag];
  if (mapped) return mapped;
  for (const [key, value] of Object.entries(CHINESE_TAG_MAP)) {
    if (key.toLowerCase() === tag.toLowerCase()) return value;
  }
  if (/[\u4e00-\u9fa5]/.test(tag)) return tag;
  return generateChineseName(tag);
}

function generateChineseName(tag: string): string {
  const wordMap: Record<string, string> = {
    "roguelite": "肉鸽融合", "roguelike": "类肉鸽", "action roguelike": "动作肉鸽",
    "action roguelites": "动作肉鸽", "traditional roguelike": "传统肉鸽",
    "roguelite deckbuilder": "肉鸽卡牌", "deckbuilding": "牌组构建",
    "card battler": "卡牌战斗", "survival": "生存建造", "crafting": "合成系统",
    "open world": "开放世界", "metroidvania": "银河恶魔城",
    "visual novel": "视觉小说", "dating sim": "恋爱模拟", "action rpg": "动作RPG",
    "rhythm": "音乐节奏", "choices matter": "选择影响", "time travel": "时间旅行",
    "procedural generation": "程序生成", "automation": "自动化", "farming sim": "农耕",
    "hack and slash": "砍杀", "bullet hell": "弹幕射击", "minigames": "小游戏",
    "time management": "时间管理", "resource management": "资源管理",
    "base building": "基地建设", "dungeon crawler": "地牢爬行",
    "immersive sim": "沉浸模拟", "survival horror": "生存恐怖",
    "action-adventure": "动作冒险", "combat": "战斗系统", "tactical": "战术",
    "building": "建造", "trading card game": "集换式卡牌",
    "open world survival craft": "开放世界生存建造",
  };
  const lower = tag.toLowerCase();
  if (wordMap[lower]) return wordMap[lower];
  const withoutSuffix = lower.replace(/\s*(game|rpg|sim|vania)\s*/i, "").trim();
  if (wordMap[withoutSuffix]) return wordMap[withoutSuffix];
  if (/[\u4e00-\u9fa5]/.test(tag)) return tag;
  return tag;
}

function getDefaultFeatureTags(): FeatureTagOption[] {
  return [
    { key: "survival", label: "生存建造", tag: "Survival", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
    { key: "roguelite", label: "肉鸽融合", tag: "Roguelite", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
    { key: "deckbuilding", label: "牌组构建", tag: "Deckbuilding", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
    { key: "openworld", label: "开放世界", tag: "Open World", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
    { key: "metroidvania", label: "银河恶魔城", tag: "Metroidvania", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
    { key: "morph", label: "形态融合", tag: "形态融合", count: 0, gameCount: 0, coverage: 0, avgWilson: 0 },
  ];
}

/**
 * 构建去重键：开发商列表（排序后）+ 游戏名称
 * 与 route.ts 的 buildDedupKey 保持一致
 * 开发商相同时认为是同一游戏，不同开发商的同名游戏视为不同游戏
 */
function buildDedupKey(game: PrecomputedGame): string {
  const devs = (game.developers || []).map((d) => d.toLowerCase().trim()).sort();
  const devKey = devs.length > 0 ? devs.join("|") : "__NO_DEV__";
  const nameKey = game.name.toLowerCase().trim();
  return `${devKey}|||${nameKey}`;
}

function transformGame(appId: string, raw: RawGameData): PrecomputedGame | null {
  const owners = parseEstimatedOwners(raw.estimated_owners);
  const totalReviews = raw.positive + raw.negative;
  const reviewScore = totalReviews > 0 ? Math.round((raw.positive / totalReviews) * 100) : 0;
  const tags = normalizeTags(raw.tags);
  const genres = normalizeGenres(raw.genres);
  const categories = normalizeCategories(raw.categories);

  const pokemonLikeTags = checkPokemonLike(tags);
  const isPokemonLike = pokemonLikeTags.length > 0;
  const turnBased = isTurnBased(tags, genres);

  const isTestByData = raw._is_test_version === true || raw._is_playtest === true;
  const isTestByName = detectTestVersionByName(raw.name || "");
  const isTestByTag = isTestVersionByTag(tags, categories);
  const isTest = isTestByData || isTestByName || isTestByTag;
  const testVersionType: "name" | "tag" | "data" | "none" = isTestByData ? "data" : isTestByName ? "name" : isTestByTag ? "tag" : "none";

  const tagWeight = calculateTagWeight(tags);

  return {
    id: appId,
    steamAppId: appId,
    name: raw.name || "",
    shortDescription: raw.short_description || "",
    developers: raw.developers || [],
    publishers: raw.publishers || [],
    genres,
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
    isPokemonLike,
    pokemonLikeTags,
    wilsonScore: wilsonScore(raw.positive, raw.negative),
    isTurnBased: turnBased,
    isTestVersion: isTest,
    testVersionType,
    isSuspiciousDelisted: raw._is_suspicious_delisted === true,
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

// ============ SQLite 数据加载 ============

async function loadFromSQLite(): Promise<{ games: PrecomputedGame[]; source: 'sqlite'; count: number } | null> {
  try {
    const sqlite3 = await import('better-sqlite3');
    const DB_FILE = path.join(process.cwd(), "public", "data", "games.db");
    
    if (!fs.existsSync(DB_FILE)) {
      console.log("   SQLite数据库不存在，跳过");
      return null;
    }

    console.log("   从SQLite数据库加载...");
    const t0 = Date.now();
    const db = sqlite3.default(DB_FILE);
    db.pragma('journal_mode = WAL');

    const rows = db.prepare(`
      SELECT g.appid, g.name, g.release_date, g.header_image, g.short_description,
             g.estimated_owners, g.price, g.positive, g.negative, g.peak_ccu,
             g.metacritic_score, g._is_test_version, g._is_suspicious_delisted,
             j.developers, j.publishers, j.genres, j.categories, j.screenshots, j.tags
      FROM games g
      LEFT JOIN games_json j ON g.appid = j.appid
    `).all() as any[];

    const games: PrecomputedGame[] = [];
    for (const row of rows) {
      try {
        const raw: RawGameData = {
          name: row.name || "",
          release_date: row.release_date || "",
          price: row.price || 0,
          short_description: row.short_description || "",
          header_image: row.header_image || "",
          estimated_owners: row.estimated_owners || "0 - 0",
          positive: row.positive || 0,
          negative: row.negative || 0,
          peak_ccu: row.peak_ccu || 0,
          metacritic_score: row.metacritic_score || 0,
          _is_test_version: row._is_test_version === 1,
          _is_suspicious_delisted: row._is_suspicious_delisted === 1,
          developers: row.developers ? JSON.parse(row.developers) : [],
          publishers: row.publishers ? JSON.parse(row.publishers) : [],
          genres: row.genres ? JSON.parse(row.genres) : [],
          categories: row.categories ? JSON.parse(row.categories) : [],
          screenshots: row.screenshots ? JSON.parse(row.screenshots) : [],
          tags: row.tags ? JSON.parse(row.tags) : {},
        };
        const game = transformGame(String(row.appid), raw);
        if (game) games.push(game);
      } catch (e) {
        console.warn(`   [警告] 解析游戏失败 appid=${row.appid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    db.close();
    console.log(`   从SQLite加载 ${games.length.toLocaleString()} 个游戏，耗时 ${Date.now() - t0}ms`);
    return { games, source: 'sqlite', count: games.length };
  } catch (e) {
    console.log(`   SQLite加载失败: ${e}`);
    return null;
  }
}

// ============ JSON 数据加载（降级）============

function loadFromJson(sourceFile: string): { games: PrecomputedGame[]; source: 'json'; count: number } {
  console.log("   从JSON文件加载...");
  const t0 = Date.now();
  const raw = fs.readFileSync(sourceFile, "utf-8");
  const rawData = JSON.parse(raw) as Record<string, RawGameData>;
  
  const games: PrecomputedGame[] = [];
  for (const [appId, data] of Object.entries(rawData)) {
    const game = transformGame(appId, data);
    if (game) games.push(game);
  }
  
  console.log(`   从JSON加载 ${games.length.toLocaleString()} 个游戏，耗时 ${Date.now() - t0}ms`);
  return { games, source: 'json', count: games.length };
}

// ============ 主程序 ============

async function main() {
  const SOURCE_JSON = path.join(process.cwd(), "public", "data", "games-index.json");
  const CACHE_FILE = path.join(process.cwd(), "public", "data", "games-cache.json");

  console.log("🚀 开始预计算缓存生成...\n");

  // 1. 加载数据（优先JSON，降级SQLite）
  // 注意: JSON文件包含完整数据，SQLite可能缺失增量数据
  const t0 = Date.now();
  let sourceData: { games: PrecomputedGame[]; source: 'sqlite' | 'json'; count: number };
  let sourceFile: string;

  // 先检查两个数据源的游戏数量
  let jsonCount = 0;
  if (fs.existsSync(SOURCE_JSON)) {
    const jsonRaw = fs.readFileSync(SOURCE_JSON, "utf-8");
    const jsonData = JSON.parse(jsonRaw);
    jsonCount = Object.keys(jsonData).length;
  }

  let sqliteCount = 0;
  const sqliteData = await loadFromSQLite();
  if (sqliteData) {
    sqliteCount = sqliteData.count;
  }

  console.log(`   数据源对比: JSON=${jsonCount.toLocaleString()} | SQLite=${sqliteCount.toLocaleString()}`);

  // 优先使用 JSON 数据源
  // 原因：JSON 包含完整字段（包括 header_image），而 SQLite 在迁移时可能丢失部分字段
  // 即使 JSON 和 SQLite 游戏数量相同，也应优先使用 JSON
  if (fs.existsSync(SOURCE_JSON)) {
    const jsonHasHeader = (() => {
      try {
        const sample = Object.values(JSON.parse(fs.readFileSync(SOURCE_JSON, "utf-8")) as Record<string, unknown>).slice(0, 10);
        return sample.some((g: any) => g && typeof g === 'object' && (g as any).header_image && String((g as any).header_image).startsWith('http'));
      } catch { return false; }
    })();
    if (jsonHasHeader || jsonCount >= sqliteCount) {
      console.log(`   优先使用 JSON (包含完整字段，数据量 ${jsonCount.toLocaleString()})`);
      sourceData = loadFromJson(SOURCE_JSON);
      sourceFile = SOURCE_JSON;
    } else if (sqliteData) {
      console.log(`   JSON header_image 数据异常，切换到 SQLite`);
      sourceData = sqliteData;
      sourceFile = "SQLite Database";
    } else {
      sourceData = loadFromJson(SOURCE_JSON);
      sourceFile = SOURCE_JSON;
    }
  } else if (sqliteData) {
    console.log(`   SQLite 降级使用`);
    sourceData = sqliteData;
    sourceFile = "SQLite Database";
  } else {
    console.error(`❌ 数据源不存在: ${SOURCE_JSON}`);
    process.exit(1);
  }

  console.log(`\n📊 数据加载完成: ${sourceData.count.toLocaleString()} 个游戏\n`);

  // 2. 去重
  const t2 = Date.now();
  console.log("🔄 去重（开发商+名称，保留拥有者最多的条目）...");
  const dedupMap = new Map<string, PrecomputedGame>();
  for (const game of sourceData.games) {
    if (!game.name) continue;
    const key = buildDedupKey(game);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, game);
    } else if (
      game.estimatedOwners > existing.estimatedOwners ||
      (game.estimatedOwners === existing.estimatedOwners &&
        (game.steamReviews?.totalReviews ?? 0) > (existing.steamReviews?.totalReviews ?? 0))
    ) {
      dedupMap.set(key, game);
    }
  }
  const deduped = Array.from(dedupMap.values());
  console.log(`   去重完成: 保留 ${deduped.length.toLocaleString()} 个（移除 ${sourceData.games.length - deduped.length} 个重复），耗时 ${Date.now() - t2}ms`);

  // 3. 预计算池子归属
  const t3 = Date.now();
  console.log("\n📊 预计算池子归属...");
  let poolA = 0, poolB = 0, poolC = 0, turnBased = 0, testVer = 0;
  for (const g of deduped) {
    if (g.isTurnBased) turnBased++;
    if (g.isTestVersion) testVer++;
    const pool = calculatePool(g);
    if (pool === "A") poolA++;
    else if (pool === "B") poolB++;
    else if (pool === "C") poolC++;
  }
  console.log(`   回合制: ${turnBased.toLocaleString()} | A池: ${poolA.toLocaleString()} | B池: ${poolB.toLocaleString()} | C池: ${poolC.toLocaleString()} | 测试版: ${testVer.toLocaleString()}`);
  console.log(`   耗时 ${Date.now() - t3}ms`);

  // 4. 动态提取创新融合标签
  const t5 = Date.now();
  console.log("\n🏷️  动态提取创新融合标签（从B池成功游戏中）...");
  const featureTagOptions = extractFeatureTagsFromPoolB(deduped);

  // 5. 生成缓存
  const t4 = Date.now();
  console.log("\n💾 生成缓存文件...");
  const cache: CacheData = {
    meta: {
      version: 2,  // 版本2支持SQLite
      createdAt: new Date().toISOString(),
      sourceFile,
      source: sourceData.source,
      totalRaw: sourceData.count,
      totalAfterDedup: deduped.length,
      totalTurnBased: turnBased,
      totalTestVersion: testVer,
      poolA, poolB, poolC,
    },
    games: deduped,
    featureTagOptions,
  };

  const json = JSON.stringify(cache);
  fs.writeFileSync(CACHE_FILE, json);
  const sizeMB = (Buffer.byteLength(json, "utf8") / 1024 / 1024).toFixed(2);
  console.log(`   缓存已保存: ${CACHE_FILE}`);
  console.log(`   文件大小: ${sizeMB} MB`);
  console.log(`   写入耗时 ${Date.now() - t4}ms`);

  const totalMs = Date.now() - t0;
  console.log(`\n✅ 预计算完成！总耗时 ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
  console.log(`   数据源: ${sourceData.source === 'sqlite' ? 'SQLite数据库' : 'JSON文件'}`);
  console.log(`   下次启动时，API 将直接加载缓存文件，加载时间预计 100-500ms\n`);
}

main().catch((e) => {
  console.error("❌ 预计算失败:", e);
  process.exit(1);
});
