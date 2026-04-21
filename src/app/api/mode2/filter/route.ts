/**
 * 模式2: 宝可梦Like游戏筛选API
 * ================================
 * 从海量回合制游戏中筛选出有价值的参考对象
 *
 * 三池筛选逻辑（默认条件，可通过参数覆盖）:
 * - A池(神作参考): 普通回合制, 好评率>=75%, 评论数>50
 * - B池(核心竞品): 宝可梦Like, 好评率>=75%, 评论数>50
 * - C池(避坑指南): 宝可梦Like, 好评率40%-74%, 评论数>50
 *
 * 性能优化：优先使用 SQLite 数据库（games-cache.db）直接查询，
 * 避免将 300MB JSON 文件全部加载到内存导致 OOM
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import type Database from "better-sqlite3";

// ============ 评价来源类型 ============

type ReviewSource = "all" | "cn" | "overseas";

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
  _is_playtest?: boolean;
  // 区域评价数据（国内/海外）
  cn_reviews?: {
    positive: number;
    negative: number;
    total: number;
  };
  overseas_reviews?: {
    positive: number;
    negative: number;
    total: number;
  };
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
  // 区域评价数据（国内/海外）
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
  headerImage: string | null;
  screenshots: string[];
  steamUrl: string;
  // 模式2扩展字段
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  wilsonScore: number;
  // 区域威尔逊得分
  cnWilsonScore: number;
  overseasWilsonScore: number;
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
  // 当前选中的特色标签筛选（卡片显示用）
  activeFeatureTagFilter?: string;
  activeFeatureTagLabel?: string;
  // 卡片展示用现代标签（已排重，排除与 activeFeatureTagLabel 重复的项）
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

// 价格统计接口
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

// 特色标签选项（动态从 combinedMechanics.json 的 tagStats 加载，移除硬编码限制）
// 来源：B 池游戏 LLM 融合玩法分析 v2（combinedMechanics.json）

// 基础标签黑名单：这些是"品类标配"标签，不是真正的创新融合
// 来自 combinedMechanics.json rawMechanics 字段中 LLM 误标记的通用标签
// 这些标签会在展示时被过滤掉，不作为"创新融合标签"显示
const INNOVATION_TAG_BLACKLIST: Record<string, boolean> = {
  // 品类标配标签
  "怪物收集": true,
  "怪物收集/养成": true,
  "角色扮演": true,
  "RPG": true,
  "JRPG": true,
  "RPG角色扮演": true,
  "回合制": true,
  "回合制战斗": true,
  "回合制策略": true,
  "回合制战术": true,
  "宝可梦Like": true,
  "Steam 评测": true,
  "Creature Collector": true,
  "RPG": true,
  "JRPG": true,
  "Turn-Based": true,
  "Turn-Based Combat": true,
  "Turn-Based Strategy": true,
  "Turn-Based Tactics": true,
  "Story Rich": true,
  "Adventure": true,
  "Singleplayer": true,
  "Fantasy": true,
  "2D": true,
  "3D": true,
  "Anime": true,
  "Pixel Graphics": true,
  "Indie": true,
  "Action": true,
  "Strategy": true,
  "Casual": true,
  "Family Friendly": true,
  "Cute": true,
  "Colorful": true,
  "Funny": true,
  "Replay Value": true,
  "MMORPG": true,
  "Auto Battler": true,
  "Card Game": true,
  "Deckbuilding": true,
  "Roguelike Deckbuilder": true,
  "Rogue-lite": true,
  "Rogue-like": true,
  "Roguelite": true,
  "Roguelike": true,
  "Metroidvania": true,
  "Card Battler": true,
  "Board Game": true,
  "Tabletop": true,
  "Simulation": true,
  "Sandbox": true,
  "Farming Sim": true,
  "Survival": true,
  "Survival Game": true,
  "Crafting": true,
  "Open World": true,
  "Exploration": true,
  "Collectathon": true,
  "Dungeon Crawler": true,
  "Dark": true,
  "Atmospheric": true,
  "Great Soundtrack": true,
  "Female Protagonist": true,
  "Multiple Endings": true,
  "Choices Matter": true,
  "PvE": true,
  "PvP": true,
  "Co-op": true,
  "Multiplayer": true,
  "Party-Based RPG": true,
  "Strategy RPG": true,
  "Tactical RPG": true,
  "Time Management": true,
  "Resource Management": true,
  "Life Sim": true,
  "Relaxing": true,
  "Character Customization": true,
  "Perma Death": true,
  "Procedural Generation": true,
  "Loot": true,
  // 更多 LLM 误标的基础标签
  "开放世界": true,
  "开放世界探索": true,
  "开放区域探索": true,
  "剧情驱动": true,
  "叙事丰富": true,
  "半开放世界探索": true,
  // 泛化的基础玩法标签（无差异化价值）
  "双人协作": true,
  "多人协作": true,
  "多人竞技": true,
  "异步对战": true,
  "异步多人": true,
  "时间管理": true,
  "生活模拟": true,
  "社交羁绊": true,
  "好感度养成": true,
  "快节奏回合制": true,
  "轻度策略": true,
  "极简养成": true,
  "内置卡牌": true,
  "数字世界观": true,
  "心灵潜入": true,
  "非暴力交涉": true,
  "解谜探索": true,
  "平台跳跃": true,
  "机关解谜": true,
  "半即时指令战斗": true,
  "ATB战斗": true,
  "无限地牢": true,
  "无尽爬塔": true,
  "无尽进程": true,
  "无限构筑": true,
  "海量收集": true,
  "海量组合": true,
  "海量支线任务": true,
  "随机地牢": true,
  "刷宝掉落": true,
  "刷宝驱动": true,
  "装备驱动": true,
  "装备镶嵌": true,
  "装备打造": true,
  "素材打造": true,
  "游戏素材": true,
  "程序生成": true,
  "程序化生成世界": true,
  "双世界穿梭": true,
  "主角变身": true,
  "主角尺寸切换": true,
  "季节变化": true,
  "分支叙事": true,
  "网状叙事": true,
  "多分支剧情": true,
  "多分支叙事": true,
  "流程交换": true,
  "角色定制": true,
  "自由角色构筑": true,
  "任务驱动": true,
  "JRPG叙事": true,
  "轻度肉鸽": true,
  "肉鸽Lite": true,
  "肉鸽LITE": true,
  "非战斗解法": true,
};

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
  "Deckbuilding", "Card Battler", "Card Game",
  "Pixel Graphics",
  "Exploration", "Collectathon", "Dungeon Crawler",
  "Rogue-lite", "Rogue-like", "Roguelite", "Roguelike", "类肉鸽",
  "开放世界", "Open World",
  "Survival", "Crafting", "Survival Game", "生存", "建造",
  "形态融合", "Time Travel", "时间旅行",
];

// 特色标签映射（用于展示差异化卖点）
const DIFFERENTIATION_LABELS: Record<string, string> = {
  // 牌组构建
  "Deckbuilding": "牌组构建",
  "Card Battler": "牌组构建",
  "Card Game": "卡牌游戏",
  // 像素风格
  "Pixel Graphics": "像素风格",
  // 探索冒险
  "Exploration": "探索冒险",
  "Collectathon": "收集冒险",
  "Dungeon Crawler": "地牢探索",
  // 肉鸽融合
  "Rogue-lite": "肉鸽融合",
  "Rogue-like": "肉鸽融合",
  "Roguelite": "肉鸽融合",
  "Roguelike": "肉鸽融合",
  "类肉鸽": "肉鸽融合",
  // 开放世界
  "开放世界": "开放世界",
  "Open World": "开放世界",
  // 生存建造
  "Survival": "生存建造",
  "Survival Game": "生存建造",
  "Crafting": "合成系统",
  "生存": "生存建造",
  "建造": "建造系统",
  // 形态融合
  "形态融合": "形态融合",
  // 时间旅行
  "Time Travel": "时间旅行",
  "时间旅行": "时间旅行",
};

// 标签中文名称映射
const TAG_CHINESE_NAMES: Record<string, string> = {
  // 核心标签
  "Creature Collector": "生物收集",
  "Monster Catching": "怪物捕捉",
  "Monster Tamer": "怪物养成",
  "Collectathon": "收集冒险",
  "生物收集": "生物收集",
  "怪物捕捉": "怪物捕捉",
  "怪物养成": "怪物养成",
  // 次级标签
  "JRPG": "JRPG",
  "Party-Based RPG": "队伍RPG",
  "Tactical RPG": "战术RPG",
  "Turn-Based Tactics": "回合制战术",
  "Turn-Based Strategy": "回合制策略",
  "回合制策略": "回合制策略",
  "角色扮演": "角色扮演",
  "RPG": "RPG",
  // 现代融合标签
  "Survival": "生存建造",
  "Survival Game": "生存建造",
  "Crafting": "合成系统",
  "Roguelite": "肉鸽融合",
  "Roguelike": "类肉鸽",
  "Deckbuilding": "牌组构建",
  "Open World": "开放世界",
  "开放世界": "开放世界",
  "Metroidvania": "银河恶魔城",
  "银河恶魔城": "银河恶魔城",
  "卡牌构建": "牌组构建",
  "牌组构建": "牌组构建",
  "形态融合": "形态融合",
  // 其他常见标签
  "2D": "2D",
  "3D": "3D",
  "Pixel Graphics": "像素风格",
  "Anime": "动漫风格",
  "Fantasy": "奇幻",
  "Magic": "魔法",
  "Adventure": "冒险",
  "Story Rich": "剧情丰富",
  "Multiple Endings": "多结局",
  "Singleplayer": "单人",
  "Indie": "独立游戏",
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

  // 精确匹配：标签必须完整匹配，不接受部分匹配
  const exactMatch = (normalizedTags: string[], target: string): boolean => {
    return normalizedTags.some((t) => t.toLowerCase() === target.toLowerCase());
  };

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
  // 使用精确匹配避免误匹配（如"Open World RPG"不应匹配"Open World"）
  for (const tag of MODERN_TAGS) {
    if (exactMatch(normalizedTags, tag)) {
      matchedModernTags.push(tag);
      // 添加到特色标签
      if (!uniqueFeatureTags.includes(tag)) {
        uniqueFeatureTags.push(tag);
        // 添加展示用标签（若转换后与 matchedModernTags 中文名重复则跳过，避免卡片标签重复）
        const label = DIFFERENTIATION_LABELS[tag] || DIFFERENTIATION_LABELS[tag.charAt(0).toUpperCase() + tag.slice(1)] || tag;
        const labelInChinese = TAG_CHINESE_NAMES[tag] || tag;
        if (!differentiationLabels.includes(label) && label !== labelInChinese) {
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

  // 转换为中文标签名
  const toChinese = (tags: string[]): string[] => {
    return tags.map((t) => TAG_CHINESE_NAMES[t] || t);
  };

  return {
    coreTagCount: matchedCoreTags.length,
    secondaryTagCount: matchedSecondaryTags.length,
    modernTagCount: matchedModernTags.length,
    tagWeight,
    matchedCoreTags: toChinese(matchedCoreTags),
    matchedSecondaryTags: toChinese(matchedSecondaryTags),
    matchedModernTags: toChinese(matchedModernTags),
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
  featureTagOptions: FeatureTagOption[];
  loadedAt: number | null;
  loadError: string | null;
} = {
  games: [],
  featureTagOptions: [],
  loadedAt: null,
  loadError: null,
};

// ============ LRU 查询结果缓存 ============

const CACHE_VERSION = "v3"; // 每次修改去重逻辑需要递增以清除旧缓存
const MAX_QUERY_CACHE_SIZE = 50; // 最多缓存 50 个查询结果（内存友好）
type QueryCacheKey = string;
interface QueryCacheEntry {
  results: GameRecord[];
  total: number;
  stats: PoolStats;
  priceStats: PriceStats | undefined;
  timestamp: number;
}

const queryCache = new Map<QueryCacheKey, QueryCacheEntry>();

function getQueryCacheKey(params: {
  pools?: string[];
  query?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
  yearsFilter?: number;
  minReleaseDate?: string;
  maxReleaseDate?: string;
  excludeTestVersions?: boolean;
  priceMin?: number;
  priceMax?: number;
  modernTagFilter?: string;
  featureTagFilter?: string;
  poolA_minRating?: number;
  poolA_minReviews?: number;
  poolB_minRating?: number;
  poolB_minReviews?: number;
  poolC_minRating?: number;
  poolC_maxRating?: number;
  poolC_minReviews?: number;
}): QueryCacheKey {
  const parts = [
    CACHE_VERSION,
    params.pools?.join(",") || "",
    params.query?.toLowerCase().trim() || "",
    params.sortBy || "wilson",
    params.sortOrder || "desc",
    params.page || 1,
    params.pageSize || 20,
    params.yearsFilter || 0,
    params.minReleaseDate || "",
    params.maxReleaseDate || "",
    params.excludeTestVersions !== false ? "1" : "0",
    params.priceMin?.toFixed(2) || "",
    params.priceMax?.toFixed(2) || "",
    params.modernTagFilter || "",
    params.featureTagFilter || "",
    params.poolA_minRating || 75,
    params.poolA_minReviews || 200,
    params.poolB_minRating || 75,
    params.poolB_minReviews || 50,
    params.poolC_minRating || 40,
    params.poolC_maxRating || 74,
    params.poolC_minReviews || 50,
  ];
  return parts.join("|");
}

function getFromQueryCache(key: QueryCacheKey): QueryCacheEntry | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  queryCache.delete(key);
  queryCache.set(key, entry);
  return entry;
}

function setQueryCache(key: QueryCacheKey, entry: QueryCacheEntry): void {
  if (queryCache.size >= MAX_QUERY_CACHE_SIZE) {
    const firstKey = queryCache.keys().next().value;
    if (firstKey !== undefined) queryCache.delete(firstKey);
  }
  queryCache.set(key, entry);
}

const CACHE_FILE = path.join(process.cwd(), "public", "data", "games-cache.json");
// 原始文件（仅在缓存不存在时降级使用）
const DB_FILE = path.join(process.cwd(), "public", "data", "games-index.json");
const CACHE_DB_FILE = path.join(process.cwd(), "public", "data", "games-cache.db");
const COMBINED_MECHANICS_FILE = path.join(process.cwd(), "public", "data", "combinedMechanics.json");

// SQLite 数据库连接（延迟初始化，避免构建时加载）
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

// SQLite 行转 GameRecord
function rowToGameRecord(row: any): GameRecord {
  const totalReviews = row.positive + row.negative;
  const reviewScore = totalReviews > 0 ? Math.round((row.positive / totalReviews) * 100) : 0;
  const totalCn = row.cn_positive + row.cn_negative;
  const cnScore = totalCn > 0 ? Math.round((row.cn_positive / totalCn) * 100) : 0;
  const totalOv = row.overseas_positive + row.overseas_negative;
  const ovScore = totalOv > 0 ? Math.round((row.overseas_positive / totalOv) * 100) : 0;
  return {
    id: row.appid,
    name: row.name,
    steamAppId: row.appid,
    shortDescription: row.short_description || "",
    developers: row.developers ? JSON.parse(row.developers) : [],
    publishers: row.publishers ? JSON.parse(row.publishers) : [],
    genres: row.genres ? JSON.parse(row.genres) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    categories: row.categories ? JSON.parse(row.categories) : [],
    releaseDate: row.release_date || null,
    isFree: row.is_free === 1,
    price: row.price || 0,
    estimatedOwners: row.estimated_owners_num || 0,
    peakCCU: row.peak_ccu || 0,
    steamReviews: { totalPositive: row.positive, totalNegative: row.negative, totalReviews, reviewScore, reviewScoreDescription: getReviewScoreDesc(reviewScore) },
    cnReviews: { totalPositive: row.cn_positive, totalNegative: row.cn_negative, totalReviews: totalCn, reviewScore: cnScore, reviewScoreDescription: getReviewScoreDesc(cnScore) },
    overseasReviews: { totalPositive: row.overseas_positive, totalNegative: row.overseas_negative, totalReviews: totalOv, reviewScore: ovScore, reviewScoreDescription: getReviewScoreDesc(ovScore) },
    headerImage: row.header_image || null,
    screenshots: row.screenshots ? JSON.parse(row.screenshots) : [],
    steamUrl: `https://store.steampowered.com/app/${row.appid}/`,
    isPokemonLike: row.is_pokemon_like === 1,
    pokemonLikeTags: row.pokemon_like_tags ? JSON.parse(row.pokemon_like_tags) : [],
    wilsonScore: row.wilson_score,
    cnWilsonScore: row.cn_wilson_score,
    overseasWilsonScore: row.overseas_wilson_score,
    pool: row.pool === "A" || row.pool === "B" || row.pool === "C" ? row.pool as "A" | "B" | "C" : null,
    isTurnBased: row.is_turn_based === 1,
    // SQLite 没有 _is_test_version 字段，通过名称和标签自动检测
    isTestVersion: detectTestVersionByName(row.name || "") || isTestVersionByTag(
      typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []),
      typeof row.categories === "string" ? JSON.parse(row.categories) : (row.categories || [])
    ),
    testVersionType: detectTestVersionByName(row.name || "") ? "name" : isTestVersionByTag(
      typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []),
      typeof row.categories === "string" ? JSON.parse(row.categories) : (row.categories || [])
    ) ? "tag" : "none",
    coreTagCount: 0,
    secondaryTagCount: 0,
    modernTagCount: 0,
    tagWeight: row.tag_weight,
    matchedCoreTags: [],
    matchedSecondaryTags: [],
    matchedModernTags: [],
    uniqueFeatureTags: row.unique_feature_tags ? JSON.parse(row.unique_feature_tags) : [],
    differentiationLabels: row.differentiation_labels ? JSON.parse(row.differentiation_labels) : [],
    displayModernTags: [],
    llmMechanics: row.llm_mechanics ? JSON.parse(row.llm_mechanics) : [],
    llmMechanicsSummary: row.llm_mechanics_summary || "",
    // llmRawMechanics 字段仅在 JSON 缓存中可用，SQLite 路径下为空数组
    llmRawMechanics: [],
  };
}

// 从 combinedMechanics.json 加载 LLM 玩法分析数据并合并到游戏记录中
function mergeLlMechancics(games: GameRecord[]): void {
  try {
    if (!fs.existsSync(COMBINED_MECHANICS_FILE)) {
      return;
    }
    const raw = fs.readFileSync(COMBINED_MECHANICS_FILE, "utf-8");
    const mechanicsData = JSON.parse(raw) as any;
    // combinedMechanics.json 结构: { games: { "appId": {...} }, tagStats, rawTagStats, tagOptions }
    const gamesData = mechanicsData.games || {};

    // 建立 appId -> LLM 数据的映射（同时按 ID 和名称索引）
    const mechanicsMap = new Map<string, any>();
    for (const [key, data] of Object.entries(gamesData)) {
      mechanicsMap.set(key, data);
      const name = (data as any).name;
      if (name) {
        mechanicsMap.set(name, data);
      }
    }

    // 合并到每个游戏
    let mergedCount = 0;
    for (const game of games) {
      const data = mechanicsMap.get(game.id) || mechanicsMap.get(game.name);
      if (data) {
        // 合并 llmMechanics（对应 JSON 中的 mechanics 字段）
        const llmMechanics = (data as any).mechanics || [];
        const existingSet = new Set(game.llmMechanics);
        for (const m of llmMechanics) {
          if (!existingSet.has(m)) {
            game.llmMechanics.push(m);
          }
        }
        // 合并 llmRawMechanics
        const rawMechanics = (data as any).rawMechanics || [];
        const rawSet = new Set(game.llmRawMechanics);
        for (const m of rawMechanics) {
          if (!rawSet.has(m)) {
            game.llmRawMechanics.push(m);
          }
        }
        // 合并 llmMechanicsSummary
        if (!game.llmMechanicsSummary && (data as any).summary) {
          game.llmMechanicsSummary = (data as any).summary;
        }
        mergedCount++;
      }
    }
    if (mergedCount > 0) {
      console.log(`[Mode2] 从 combinedMechanics.json 合并了 ${mergedCount} 个游戏的 LLM 玩法数据`);
    }
  } catch (e) {
    console.warn(`[Mode2] 合并 LLM 玩法数据失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 池子分布类型
export interface PoolDistribution {
  A: number;
  B: number;
  C: number;
}

// 动态标签选项类型
export interface FeatureTagOption {
  key: string;
  label: string;
  tag: string;
  count: number;
  gameCount: number;
  coverage: number;
  avgWilson: number;
  poolDistribution?: PoolDistribution;
}

interface CacheData {
  meta: {
    version: number;
    createdAt: string;
    totalRaw: number;
    totalAfterDedup: number;
    totalTurnBased: number;
    totalTestVersion: number;
    poolA: number;
    poolB: number;
    poolC: number;
  };
  games: GameRecord[];
  featureTagOptions?: FeatureTagOption[];
}

// API 响应类型
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
  // games-index.json 的 categories 是数字数组（如 [2, 22, 29]），转换为字符串
  const categories = (raw.categories || []).map((c: unknown) => String(c));

  const pokemonCheck = checkPokemonLike(tags, raw.genres || []);
  const blacklisted = isBlacklisted(tags, raw.genres || []);
  const turnBased = isTurnBased(tags, raw.genres || []);

  // 测试版检测：数据源标记 > 名称检测 > 标签检测
  const isTestByData = raw._is_test_version === true || raw._is_playtest === true;
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

  // 处理国内评价数据
  const cnReviewsRaw = raw.cn_reviews;
  const cnTotal = cnReviewsRaw?.total || 0;
  const cnReviewScore = cnTotal > 0 && cnReviewsRaw ? Math.round((cnReviewsRaw.positive / cnTotal) * 100) : 0;
  const cnWilson = cnReviewsRaw && cnTotal > 0 ? wilsonScore(cnReviewsRaw.positive, cnReviewsRaw.negative) : 0;

  // 处理海外评价数据
  const overseasReviewsRaw = raw.overseas_reviews;
  const overseasTotal = overseasReviewsRaw?.total || 0;
  const overseasReviewScore = overseasTotal > 0 && overseasReviewsRaw ? Math.round((overseasReviewsRaw.positive / overseasTotal) * 100) : 0;
  const overseasWilson = overseasReviewsRaw && overseasTotal > 0 ? wilsonScore(overseasReviewsRaw.positive, overseasReviewsRaw.negative) : 0;

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
    // 国内评价数据
    cnReviews: cnReviewsRaw && cnTotal > 0 ? {
      totalPositive: cnReviewsRaw.positive,
      totalNegative: cnReviewsRaw.negative,
      totalReviews: cnTotal,
      reviewScore: cnReviewScore,
      reviewScoreDescription: getReviewScoreDesc(cnReviewScore),
    } : null,
    // 海外评价数据
    overseasReviews: overseasReviewsRaw && overseasTotal > 0 ? {
      totalPositive: overseasReviewsRaw.positive,
      totalNegative: overseasReviewsRaw.negative,
      totalReviews: overseasTotal,
      reviewScore: overseasReviewScore,
      reviewScoreDescription: getReviewScoreDesc(overseasReviewScore),
    } : null,
    headerImage: raw.header_image || null,
    screenshots: raw.screenshots || [],
    steamUrl: `https://store.steampowered.com/app/${appId}`,
    isPokemonLike: pokemonCheck.isPokemonLike,
    pokemonLikeTags: pokemonCheck.matchingTags,
    wilsonScore: wilson,
    // 区域威尔逊得分
    cnWilsonScore: cnWilson,
    overseasWilsonScore: overseasWilson,
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
    displayModernTags: tagWeight.matchedModernTags,
    llmMechanics: [],
    llmMechanicsSummary: "",
    llmRawMechanics: [],
  };
}

/**
 * 按"开发商+游戏名称"组合去重，保留拥有者数量最多的条目
 * 相比仅按名称去重，可以区分不同开发商开发的同名游戏
 * 拥有者相同时，取评论数最多的
 * Steam 上同一游戏可能存在 Demo 版、限定版、捆绑包等多个条目
 */
function deduplicateByName(games: GameRecord[]): GameRecord[] {
  const map = new Map<string, GameRecord>();

  for (const game of games) {
    if (!game.name) continue;
    const key = buildDedupKey(game);
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

/**
 * 构建去重键：开发商列表（排序后）+ 游戏名称
 */
function buildDedupKey(game: GameRecord): string {
  const devs = (game.developers || []).map((d) => d.toLowerCase().trim()).sort();
  const devKey = devs.length > 0 ? devs.join("|") : "__NO_DEV__";
  const nameKey = game.name.toLowerCase().trim();
  return `${devKey}|||${nameKey}`;
}

function loadFeatureTagOptionsFromJson(): FeatureTagOption[] {
  try {
    if (fs.existsSync(CACHE_FILE) && fs.statSync(CACHE_FILE).size > 0) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const cache = JSON.parse(raw) as CacheData;
      if (cache.featureTagOptions && cache.featureTagOptions.length > 0) {
        return cache.featureTagOptions;
      }
    }
  } catch (e) {
    console.warn(`[Mode2] 读取 JSON 缓存中的动态标签失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 回退：从 combinedMechanics.json 动态计算 featureTagOptions
  return computeFeatureTagOptionsFromMechanics();
}

// 从 combinedMechanics.json 动态计算特色标签选项
// 从 tagStats 中读取全部标签，按 count 降序排列
function computeFeatureTagOptionsFromMechanics(): FeatureTagOption[] {
  try {
    if (!fs.existsSync(COMBINED_MECHANICS_FILE)) {
      console.warn("[Mode2] combinedMechanics.json 不存在，无法计算动态标签");
      return [];
    }
    const raw = fs.readFileSync(COMBINED_MECHANICS_FILE, "utf-8");
    const mechanicsData = JSON.parse(raw) as any;

    // 使用 rawTagStats（来自 rawMechanics 字段的原始标签统计，共207个）
    // 这是 LLM 从 B池游戏中提取的所有创新融合标签
    const tagStats = mechanicsData.rawTagStats || mechanicsData.tagStats || {};

    // 从 tagStats 动态构建标签选项，排除黑名单标签
    const options: FeatureTagOption[] = [];
    for (const [tag, count] of Object.entries(tagStats)) {
      if ((count as number) <= 0) continue;
      // 排除黑名单标签
      if (INNOVATION_TAG_BLACKLIST[tag]) continue;
      const key = tag.toLowerCase().replace(/\s+/g, "_");
      options.push({
        key,
        label: tag,
        tag,
        count: count as number,
      });
    }

    // 按 count 降序排列
    options.sort((a, b) => b.count - a.count);

    console.log(`[Mode2] 从 combinedMechanics.json 加载 ${options.length} 个特色标签`);
    return options;
  } catch (e) {
    console.warn(`[Mode2] 从 combinedMechanics.json 计算动态标签失败: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

function loadDatabase(): { games: GameRecord[]; featureTagOptions: FeatureTagOption[] } {
  const now = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  // 开发环境缓存 1 分钟，生产环境缓存 5 分钟
  const cacheValid =
    dbCache.games.length > 0 &&
    dbCache.loadedAt !== null &&
    (isProduction || now - dbCache.loadedAt < 60 * 1000);

  if (cacheValid) {
    console.log(`[Mode2] 使用内存缓存的 ${dbCache.games.length} 个游戏 (距上次加载 ${Math.round((now - dbCache.loadedAt!) / 1000)}s 前)`);
    return { games: dbCache.games, featureTagOptions: dbCache.featureTagOptions };
  }

  // ============ 优先: SQLite 直接查询 ============
  const db = getSqliteDb();
  if (db) {
    const loadStart = Date.now();
    try {
      const rows = db.prepare("SELECT * FROM games_cache").all() as any[];
      let games = rows.map(rowToGameRecord);

      // 检查原始数据中是否有同一 ID 多条记录的情况
      const rawIdCount: Record<string, number> = {};
      for (const row of rows) {
        rawIdCount[row.appid] = (rawIdCount[row.appid] || 0) + 1;
      }
      const rawDupIds = Object.entries(rawIdCount).filter(([, c]) => c > 1);
      if (rawDupIds.length > 0) {
        console.log(`[Mode2] 警告: SQLite 中有 ${rawDupIds.length} 个重复 appid:`, rawDupIds.slice(0, 3));
      }

      // 检查去重前是否有重复 key（开发商+名称）
      const beforeDedupKeyCount: Record<string, number> = {};
      for (const g of games) {
        const key = buildDedupKey(g);
        beforeDedupKeyCount[key] = (beforeDedupKeyCount[key] || 0) + 1;
      }
      const beforeDup = Object.entries(beforeDedupKeyCount).filter(([, c]) => c > 1);
      if (beforeDup.length > 0) {
        console.log(`[Mode2] 去重前有 ${beforeDup.length} 个重复 key（前3个）:`, beforeDup.slice(0, 3));
      }

      const beforeCount = games.length;
      games = deduplicateByName(games);
      const removed = beforeCount - games.length;
      if (removed > 0) {
        console.log(`[Mode2] 去重移除 ${removed} 个重复游戏（${beforeCount} -> ${games.length}）`);
      }
      // 检查去重后是否还有重复 ID
      const afterDedupIdCount: Record<string, number> = {};
      for (const g of games) {
        afterDedupIdCount[g.id] = (afterDedupIdCount[g.id] || 0) + 1;
      }
      const afterDup = Object.entries(afterDedupIdCount).filter(([, c]) => c > 1);
      if (afterDup.length > 0) {
        console.log(`[Mode2] 严重: 去重后仍有 ${afterDup.length} 个重复 ID（前5个）:`, afterDup.slice(0, 5));
      }

      dbCache.games = games;
      // 从 combinedMechanics.json 合并 LLM 玩法分析数据到每个游戏
      mergeLlMechancics(games);
      dbCache.featureTagOptions = loadFeatureTagOptionsFromJson();
      dbCache.loadedAt = now;
      dbCache.loadError = null;
      console.log(`[Mode2] 从 SQLite 加载 ${games.length} 个游戏，耗时 ${Date.now() - loadStart}ms`);
      console.log(`[Mode2] 动态标签: ${dbCache.featureTagOptions.length} 个`);
      return { games, featureTagOptions: dbCache.featureTagOptions };
    } catch (e) {
      console.warn(`[Mode2] SQLite 查询失败，降级到 JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ============ 降级: JSON 文件 ============
  try {
    if (fs.existsSync(CACHE_FILE) && fs.statSync(CACHE_FILE).size > 0) {
      const loadStart = Date.now();
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const cache = JSON.parse(raw) as CacheData;
      dbCache.games = cache.games;
      // 从 combinedMechanics.json 合并 LLM 玩法分析数据到每个游戏
      mergeLlMechancics(cache.games);
      dbCache.featureTagOptions = loadFeatureTagOptionsFromJson();
      dbCache.loadedAt = now;
      dbCache.loadError = null;
      console.log(`[Mode2] 从 JSON 缓存加载 ${cache.games.length} 个游戏，耗时 ${Date.now() - loadStart}ms`);
      console.log(`[Mode2] 动态标签: ${dbCache.featureTagOptions.length} 个`);
      console.log(`[Mode2] 缓存信息: 去重后 ${cache.meta.totalAfterDedup} 个 | 回合制 ${cache.meta.totalTurnBased} | A池 ${cache.meta.poolA} | B池 ${cache.meta.poolB} | C池 ${cache.meta.poolC}`);
      return { games: dbCache.games, featureTagOptions: dbCache.featureTagOptions };
    }

    console.warn("[Mode2] 预计算缓存不存在或为空，降级使用原始 JSON");
    if (!fs.existsSync(DB_FILE)) {
      dbCache.loadError = `数据库文件不存在: ${DB_FILE}`;
      console.error("[Mode2] 文件不存在:", DB_FILE);
      return { games: [], featureTagOptions: [] };
    }

    const loadStart = Date.now();
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    console.log(`[Mode2] 读取文件完成，耗时 ${Date.now() - loadStart}ms`);

    const parseStart = Date.now();
    const rawData = JSON.parse(raw) as Record<string, RawGameData>;
    console.log(`[Mode2] 解析完成，共 ${Object.keys(rawData).length} 条数据，耗时 ${Date.now() - parseStart}ms`);

    const transformStart = Date.now();
    const games: GameRecord[] = [];
    for (const [appId, data] of Object.entries(rawData)) {
      const game = transformGame(appId, data);
      games.push(game);
    }
    const deduped = deduplicateByName(games);
    console.log(`[Mode2] 去重完成，保留 ${deduped.length} 个（移除 ${games.length - deduped.length} 个重复）`);

    dbCache.games = deduped;
    // 从 combinedMechanics.json 合并 LLM 玩法分析数据到每个游戏
    mergeLlMechancics(deduped);
    dbCache.featureTagOptions = loadFeatureTagOptionsFromJson();
    dbCache.loadedAt = now;
    dbCache.loadError = null;
    console.log(`[Mode2] 数据转换完成，耗时 ${Date.now() - transformStart}ms`);

    return { games: deduped, featureTagOptions: dbCache.featureTagOptions };
  } catch (e) {
    const msg = `加载数据库失败: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[Mode2]", msg);
    dbCache.loadError = msg;
    return { games: [], featureTagOptions: [] };
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
  config: PoolConfig,
  reviewSource: ReviewSource = "all"
): "A" | "B" | "C" | null {
  // 根据评价来源选择评价数据
  let steamReviews = game.steamReviews;
  if (reviewSource === "cn" && game.cnReviews) {
    steamReviews = game.cnReviews;
  } else if (reviewSource === "overseas" && game.overseasReviews) {
    steamReviews = game.overseasReviews;
  }

  // 必须有评价数据
  if (!steamReviews || steamReviews.totalReviews === 0) {
    return null;
  }

  const { reviewScore, totalReviews } = steamReviews;
  const blacklisted = isBlacklisted(game.tags, game.genres || []);

  // 黑名单游戏不进入任何池子
  if (blacklisted) {
    return null;
  }

  // A池: 普通回合制游戏（不是宝可梦Like）
  if (!game.isPokemonLike && reviewScore >= config.poolA.minRating && totalReviews >= config.poolA.minReviews) {
    return "A";
  }

  // B池: 宝可梦Like + 高好评率
  if (game.isPokemonLike && reviewScore >= config.poolB.minRating && totalReviews >= config.poolB.minReviews) {
    return "B";
  }

  // C池: 宝可梦Like + 中等好评率
  if (
    game.isPokemonLike &&
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
    featureTagOptions?: FeatureTagOption[];
    reviewSource?: ReviewSource; // 评价来源筛选
  }
): { results: GameRecord[]; total: number; stats: PoolStats; priceStats: PriceStats | undefined } {
  // 默认过滤测试版
  const excludeTest = options.excludeTestVersions !== false;
  const reviewSource = options.reviewSource || "all";

  // 0. 测试版过滤（先于其他过滤执行）
  let filtered = allGames;
  if (excludeTest) {
    filtered = filtered.filter((g) => !g.isTestVersion);
  }

  // 1. 计算每个游戏的池子归属（根据评价来源）
  const gamesWithPools = filtered.filter((g) => g.isTurnBased).map((game) => ({
    ...game,
    pool: calculatePool(game, options.poolConfig, reviewSource),
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
      // 具体特色标签筛选（同时检查 llmMechanics 和 llmRawMechanics）
      if (options.featureTagFilter) {
        const featureTag = options.featureTagOptions?.find((f) => f.key === options.featureTagFilter);
        if (featureTag) {
          // 同时匹配 llmMechanics（权威标签）和 llmRawMechanics（原始标签）
          const llmM = (g.llmMechanics || []) as string[];
          const llmRawM = (g.llmRawMechanics || []) as string[];
          const hasTag = llmM.includes(featureTag.tag) || llmRawM.includes(featureTag.tag);
          if (!hasTag) return false;
        }
      }
      return true;
    });
  }

  // 7. 排序（根据评价来源使用对应的威尔逊得分）
  results.sort((a, b) => {
    let cmp = 0;
    switch (options.sortBy) {
      case "wilson": {
        // 根据评价来源选择威尔逊得分
        const aWilson = reviewSource === "cn" ? a.cnWilsonScore : reviewSource === "overseas" ? a.overseasWilsonScore : a.wilsonScore;
        const bWilson = reviewSource === "cn" ? b.cnWilsonScore : reviewSource === "overseas" ? b.overseasWilsonScore : b.wilsonScore;
        cmp = bWilson - aWilson;
        break;
      }
      case "rating": {
        // 根据评价来源选择好评率
        const aReviews = reviewSource === "cn" ? a.cnReviews : reviewSource === "overseas" ? a.overseasReviews : a.steamReviews;
        const bReviews = reviewSource === "cn" ? b.cnReviews : reviewSource === "overseas" ? b.overseasReviews : b.steamReviews;
        cmp = (bReviews?.reviewScore ?? 0) - (aReviews?.reviewScore ?? 0);
        break;
      }
      case "reviews": {
        // 根据评价来源选择评价数
        const aReviews = reviewSource === "cn" ? a.cnReviews : reviewSource === "overseas" ? a.overseasReviews : a.steamReviews;
        const bReviews = reviewSource === "cn" ? b.cnReviews : reviewSource === "overseas" ? b.overseasReviews : b.steamReviews;
        cmp = (bReviews?.totalReviews ?? 0) - (aReviews?.totalReviews ?? 0);
        break;
      }
      case "date":
        cmp = new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime();
        break;
      default: {
        const aWilson = reviewSource === "cn" ? a.cnWilsonScore : reviewSource === "overseas" ? a.overseasWilsonScore : a.wilsonScore;
        const bWilson = reviewSource === "cn" ? b.cnWilsonScore : reviewSource === "overseas" ? b.overseasWilsonScore : b.wilsonScore;
        cmp = bWilson - aWilson;
      }
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

  // 8. 动态计算特色标签（基于当前 MODERN_TAGS 配置）
  // 特色标签中文名映射（合并两个映射表）
  const ALL_TAG_LABELS: Record<string, string> = {
    ...DIFFERENTIATION_LABELS,
    ...TAG_CHINESE_NAMES,
  };
  const pagedWithFeatures = paged.map((game) => {
    const tagWeight = calculateTagWeight(game.tags);
    const featureTagOption = options.featureTagOptions?.find(
      (f) => f.key === options.featureTagFilter
    );
    const activeTag = featureTagOption?.tag;
    const activeLabel = featureTagOption?.label;

    // 从 uniqueFeatureTags 转换为中文展示标签
    // 用 Set 去重：不同英文标签可能映射到同一个中文标签（如 Card Battler 和 Deckbuilding 都映射到"牌组构建"）
    const seenLabels = new Set<string>();
    const differentiationLabels: string[] = [];
    for (const t of tagWeight.uniqueFeatureTags) {
      const label = ALL_TAG_LABELS[t] || t;
      if (!seenLabels.has(label)) {
        seenLabels.add(label);
        differentiationLabels.push(label);
      }
    }

    // 排重：featureTagOption.tag 是原始标签（如 "Time Travel"），与 matchedModernTags 英文原名对比
    // 只对 displayModernTags 排重（matchedModernTags 是英文预计算数据）
    const excludedRawTag = activeTag ? activeTag.toLowerCase() : "";
    // 用中文标签做排重检查（因为 differentiationLabels 已转换为中文）
    const excludedLabelInChinese = activeTag ? (ALL_TAG_LABELS[activeTag] || activeTag) : "";
    // matchedModernTags 转中文后也需要去重（不同英文标签可能映射到同一中文标签）
    const displaySeen = new Set<string>();
    const displayModernTags: string[] = [];
    for (const t of tagWeight.matchedModernTags) {
      const label = ALL_TAG_LABELS[t] || t;
      // 排除原始标签匹配 AND 中文标签匹配（避免与已选的特色标签重复）
      const isExcludedByRaw = t.toLowerCase() === excludedRawTag;
      const isExcludedByChinese = label === excludedLabelInChinese;
      if (isExcludedByRaw || isExcludedByChinese) continue;
      if (!displaySeen.has(label)) {
        displaySeen.add(label);
        displayModernTags.push(label);
      }
    }

    // 检查 activeFeatureTagLabel 是否已存在于 differentiationLabels（用中文标签比较）
    const activeFeatureTagLabel = (() => {
      if (!activeLabel) return undefined;
      // 用 Set 检查是否已存在（基于中文标签比较）
      if (seenLabels.has(activeLabel)) return undefined;
      return activeLabel;
    })();

    // 构建创新融合标签：过滤 llmRawMechanics，排除基础标签和已显示的特色标签
    const rawMechanicsBlacklist: Record<string, boolean> = INNOVATION_TAG_BLACKLIST;
    const innovationTagSeen = new Set<string>();
    const innovationTags: string[] = [];

    // 先加入 activeFeatureTagLabel（用户筛选的标签）
    if (activeFeatureTagLabel) {
      innovationTagSeen.add(activeFeatureTagLabel.toLowerCase());
    }
    // 加入 differentiationLabels 中已有的标签（避免重复）
    for (const l of differentiationLabels) {
      innovationTagSeen.add(l.toLowerCase());
    }
    // 过滤 llmRawMechanics：排除黑名单标签和已显示的标签
    for (const tag of (game.llmRawMechanics || [])) {
      const lower = tag.toLowerCase();
      // 跳过黑名单（品类标配）和已显示的标签
      if (rawMechanicsBlacklist[tag] || rawMechanicsBlacklist[lower] || innovationTagSeen.has(lower)) {
        continue;
      }
      innovationTagSeen.add(lower);
      innovationTags.push(tag);
    }

    // 同时将 llmMechanics 中非黑名单的标签也加入（作为权威补充）
    for (const tag of (game.llmMechanics || [])) {
      const lower = tag.toLowerCase();
      if (rawMechanicsBlacklist[tag] || rawMechanicsBlacklist[lower] || innovationTagSeen.has(lower)) {
        continue;
      }
      innovationTagSeen.add(lower);
      innovationTags.push(tag);
    }

    return {
      ...game,
      uniqueFeatureTags: tagWeight.uniqueFeatureTags,
      differentiationLabels,
      matchedModernTags: tagWeight.matchedModernTags,
      modernTagCount: tagWeight.modernTagCount,
      activeFeatureTagFilter: options.featureTagFilter,
      activeFeatureTagLabel,
      displayModernTags,
      innovationTags,
    };
  });

  // 最终安全去重：按 ID 去重，防止任何环节产生的重复
  const seenIds = new Set<string>();
  const deduplicated = pagedWithFeatures.filter((game) => {
    if (seenIds.has(game.id)) {
      console.log(`[Mode2] 警告: 过滤掉重复 ID ${game.id} (${game.name})`);
      return false;
    }
    seenIds.add(game.id);
    return true;
  });

  return { results: deduplicated, total: results.length, stats, priceStats };
}

// 获取各池子的游戏数量（用于显示预览）
function getPoolCounts(
  allGames: GameRecord[],
  poolConfig: PoolConfig,
  pools?: ("A" | "B" | "C")[],
  yearsFilter?: number,
  minReleaseDate?: string,
  maxReleaseDate?: string,
  excludeTestVersions?: boolean,
  featureTagFilter?: string,
  featureTagOptions?: FeatureTagOption[]
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

    // 特色标签筛选（和各池子数量同步）
    if (featureTagFilter) {
      const featureTag = featureTagOptions?.find((f) => f.key === featureTagFilter);
      if (featureTag) {
        // 同时检查 llmMechanics 和 llmRawMechanics
        const llmM = (game.llmMechanics || []) as string[];
        const llmRawM = (game.llmRawMechanics || []) as string[];
        const hasTag = llmM.includes(featureTag.tag) || llmRawM.includes(featureTag.tag);
        if (!hasTag) continue;
      }
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

// 动态计算每个特色标签在用户勾选的池子中的实际数量
function calculateFeatureTagCounts(
  allGames: GameRecord[],
  poolConfig: PoolConfig,
  pools: ("A" | "B" | "C")[],
  yearsFilter?: number,
  minReleaseDate?: string,
  maxReleaseDate?: string,
  excludeTestVersions?: boolean
): FeatureTagOption[] {
  const excludeTest = excludeTestVersions !== false;

  // 先筛选出符合条件的回合制游戏
  let filteredGames = allGames.filter((g) => g.isTurnBased);
  if (excludeTest) {
    filteredGames = filteredGames.filter((g) => !g.isTestVersion);
  }

  // 应用日期过滤
  if (yearsFilter && yearsFilter > 0) {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsFilter);
    const cutoffTime = cutoffDate.getTime();
    filteredGames = filteredGames.filter((g) => {
      if (!g.releaseDate) return false;
      return new Date(g.releaseDate).getTime() >= cutoffTime;
    });
  }
  if (minReleaseDate) {
    const minTime = new Date(minReleaseDate).getTime();
    filteredGames = filteredGames.filter((g) => {
      if (!g.releaseDate) return false;
      return new Date(g.releaseDate).getTime() >= minTime;
    });
  }
  if (maxReleaseDate) {
    const maxTime = new Date(maxReleaseDate).getTime();
    filteredGames = filteredGames.filter((g) => {
      if (!g.releaseDate) return false;
      return new Date(g.releaseDate).getTime() <= maxTime;
    });
  }

  // 计算每个游戏属于哪个池子
  const gamesWithPools = filteredGames.map((g) => ({
    ...g,
    pool: calculatePool(g, poolConfig),
  }));

  // 根据用户勾选的池子筛选游戏
  const filteredByPool = gamesWithPools.filter((g) => {
    if (g.pool === null) return false;
    return pools.includes(g.pool);
  });

  // 从缓存中获取预计算的标签选项
  const presetOptions = dbCache.featureTagOptions.length > 0 ? dbCache.featureTagOptions : [];

  if (presetOptions.length === 0) return [];

  // 计算每个标签在各池子中的分布
  const poolADist = gamesWithPools.filter((g) => g.pool === "A");
  const poolBDist = gamesWithPools.filter((g) => g.pool === "B");
  const poolCDist = gamesWithPools.filter((g) => g.pool === "C");

  // 动态计算每个标签在用户勾选的池子中的总数量
  // 同时检查 llmMechanics（权威标签，7个）和 llmRawMechanics（原始标签，207个）
  const result: FeatureTagOption[] = presetOptions.map((option) => {
    const tagLower = option.tag.toLowerCase();

    // 检查游戏是否有该标签（同时匹配 llmMechanics 和 llmRawMechanics）
    const hasTag = (g: GameRecord) => {
      const llmM = (g.llmMechanics || []).map((m: string) => m.toLowerCase());
      const llmRawM = (g.llmRawMechanics || []).map((m: string) => m.toLowerCase());
      return llmM.includes(tagLower) || llmRawM.includes(tagLower);
    };

    const totalCount = filteredByPool.filter(hasTag).length;
    const poolACount = poolADist.filter(hasTag).length;
    const poolBCount = poolBDist.filter(hasTag).length;
    const poolCCount = poolCDist.filter(hasTag).length;

    return {
      ...option,
      gameCount: totalCount,
      count: totalCount,
      coverage: filteredByPool.length > 0 ? Math.round((totalCount / filteredByPool.length) * 100) : 0,
      poolDistribution: {
        A: poolACount,
        B: poolBCount,
        C: poolCCount,
      },
    };
  });

  return result;
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
      total: 0,
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
    total: prices.length,
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

  // 评价来源参数（默认全部）
  const rawReviewSource = searchParams.get("reviewSource") ?? "all";
  const reviewSource: ReviewSource =
    rawReviewSource === "cn" || rawReviewSource === "overseas"
      ? rawReviewSource
      : "all";

  // 是否只获取统计信息
  const statsOnly = searchParams.get("statsOnly") === "true";

  console.log("[Mode2] 开始加载数据库");
  const { games: allGames, featureTagOptions } = loadDatabase();
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

  // 动态计算每个特色标签的实际数量（根据当前筛选条件）
  // 这样标签显示的数量会和各池子实际筛选结果一致
  const dynamicFeatureTagOptions = calculateFeatureTagCounts(
    allGames,
    poolConfig,
    pools.length > 0 ? pools : ["A", "B", "C"],
    yearsFilter,
    minReleaseDate,
    maxReleaseDate,
    excludeTestVersions
  );

  // 生成查询缓存键（第一页才缓存）
  const cacheKey = getQueryCacheKey({
    pools: pools.length > 0 ? pools : undefined,
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
    poolA_minRating,
    poolA_minReviews,
    poolB_minRating,
    poolB_minReviews,
    poolC_minRating,
    poolC_maxRating,
    poolC_minReviews,
  });

  // 尝试从查询缓存获取
  if (page === 1) {
    const cached = getFromQueryCache(cacheKey);
    if (cached) {
      console.log(`[Mode2] 命中查询缓存，返回 ${cached.results.length} 条结果`);
      return NextResponse.json({
        results: cached.results,
        total: cached.total,
        page: 1,
        pageSize,
        totalPages: Math.max(1, Math.ceil(cached.total / pageSize)),
        stats: cached.stats,
        priceStats: cached.priceStats,
        poolConfig,
        query,
        poolFilters: pools.length > 0 ? pools : ["A", "B", "C"],
        description: {
          A: "神作参考池 - 普通回合制游戏，优秀UI和战斗机制参考",
          B: "核心竞品池 - 宝可梦Like成功案例，学习成功要素",
          C: "避坑指南池 - 宝可梦Like争议/失败案例，避开玩家痛点",
        },
        featureTagOptions: dynamicFeatureTagOptions,
        cached: true,
      });
    }
  }

  // 只获取统计信息
  if (statsOnly) {
    const stats = getPoolCounts(
      allGames, poolConfig, pools.length > 0 ? pools : undefined,
      yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions,
      featureTagFilter, featureTagOptions
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
    featureTagOptions: dynamicFeatureTagOptions,
    reviewSource,
  });

  // 缓存第一页的查询结果
  if (page === 1) {
    setQueryCache(cacheKey, { results, total, stats, priceStats, timestamp: Date.now() });
  }

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
    reviewSource, // 当前评价来源
    description: {
      A: "神作参考池 - 普通回合制游戏，优秀UI和战斗机制参考",
      B: "核心竞品池 - 宝可梦Like成功案例，学习成功要素",
      C: "避坑指南池 - 宝可梦Like争议/失败案例，避开玩家痛点",
    },
    featureTagOptions: dynamicFeatureTagOptions,
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
