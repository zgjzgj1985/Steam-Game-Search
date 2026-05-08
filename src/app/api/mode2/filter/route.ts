/**
 * 模式2: 宝可梦Like游戏筛选API
 * ================================
 * 从海量回合制游戏中筛选出有价值的参考对象
 *
 * 三池筛选逻辑（可通过参数覆盖）:
 * - A池(神作参考): 普通回合制, 好评率>=90%, 评论数>=2000, 2024年后上线
 * - B池(核心竞品): 宝可梦Like, 好评率>=85%, 评论数>=500
 * - C池(避坑指南): 宝可梦Like, 好评率40%-74%, 评论数>=500
 *
 * 性能优化：优先使用 SQLite 数据库（games-cache.db）直接查询，
 * 避免将 300MB JSON 文件全部加载到内存导致 OOM
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { SYNONYM_MERGE as TAG_SYNONYM_MERGE, INNOVATION_BLACKLIST as TAG_BLACKLIST } from "@/lib/tag-config";
import type Database from "better-sqlite3";

// 导入LLM分析缓存（用于两阶段判定）
import { getAnalysisResults } from "@/lib/analyze-cache";

// ============ 性能优化：预构建查找表 ============
// 将 Object 遍历改为 Map/Set 的 O(1) 查找，避免每次筛选都遍历整个对象
// 同义词合并映射：废弃标签 → 保留标签
const SYNONYM_MAP = new Map(Object.entries(TAG_SYNONYM_MERGE));

// 黑名单 Set：快速判断标签是否应被过滤
const BLACKLIST_SET = new Set(Object.keys(TAG_BLACKLIST));

// 反向索引：保留标签 → 所有废弃同义词（用于特色标签筛选时展开）
const REVERSE_SYNONYM_MAP: Map<string, string[]> = new Map();
for (const [discarded, kept] of Object.entries(TAG_SYNONYM_MERGE)) {
  if (!REVERSE_SYNONYM_MAP.has(kept)) {
    REVERSE_SYNONYM_MAP.set(kept, []);
  }
  REVERSE_SYNONYM_MAP.get(kept)!.push(discarded);
}

// ============ 池子默认值配置 ============
// 这些值是池子筛选的默认条件，所有默认值引用都应使用此常量
// 前端 page.tsx 的初始状态也应与此保持一致
export const POOL_DEFAULTS = {
  A: { minRating: 90, minReviews: 2000, minYear: 2024 },      // 好评率90%, 评论数2000+, 2024年后
  B: { minRating: 85, minReviews: 500 },                       // 好评率85%, 评论数500+
  C: { minRating: 40, maxRating: 74, minReviews: 500 },      // 好评率40-74%, 评论数500+
};

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
  // 宝可梦Like判定置信度
  pokemonLikeConfidence: PokemonLikeConfidence;
  pokemonLikeMatchedBy: string[];
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
  // LLM 语义分析结果（来自 analyze-cache.json，两阶段判定的第二阶段）
  llmAnalysis?: {
    isPokemonLike: boolean;
    confidence: number;
    confidenceLevel: "high" | "medium" | "low";
    matchingFeatures: string[];
    missingFeatures: string[];
    reasons: string;
  };
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

// 品类标配黑名单（与同义词体系解耦）
// 只包含真正无区分度的泛化标签，有意义的标签全部走同义词合并路径
// 来源: @/lib/tag-config（由 manage_tags.py --export-config 生成）
// 已在模块顶部通过 import 导入为 TAG_BLACKLIST

// 同义词合并映射（废弃标签 → 保留标签）
// 来源: @/lib/tag-config（由 manage_tags.py --export-config 生成）
// 已在模块顶部通过 import 导入为 TAG_SYNONYM_MERGE

// ============ 标签权重系统 ============

// 核心标签（最高权重）- 生物收集/怪物养成类游戏必须有
// 与 pokemonLikeKeywords.json 中的 tags 保持同步
const CORE_TAGS = [
  "Creature Collector",
  "Monster Catching",
  "Monster Taming",
  "Creature Collection",
  "Pokemon",
  "Insect Catching",
  "Bug Catching",
  "Fish Collection",
  "养宠",
  "养成",
  "宠物养成",
  "怪物养成",
  "生物收集",
  "怪物收集",
  "精灵养成",
  "精灵捕捉",
  "宠物收集",
  "妖怪养成",
  "妖怪收集",
  "昆虫捕捉",
  "虫子养成",
  "鱼类收集",
  "Monster Breeder",
  "Monster Raising",
  "Creature Raising",
  "Monster Ranching",
  "Summoner",
  "Summoning",
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
  "Deckbuilder": "牌组构建",
  "build your deck": "牌组构建",
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
  "Rogue-lite / Procedural Generation": "肉鸽融合",
  "Procedural Generation": "程序生成",
  // 开放世界
  "开放世界": "开放世界",
  "Open World": "开放世界",
  // 生存建造
  "Survival": "生存建造",
  "Survival Game": "生存建造",
  "Crafting": "合成系统",
  "生存": "生存建造",
  "建造": "建造系统",
  "Base Building": "基地建造",
  "Building": "建造",
  "Sandbox": "沙盒",
  // 形态融合
  "形态融合": "形态融合",
  // 时间旅行
  "Time Travel": "时间旅行",
  "时间旅行": "时间旅行",
  // 塔防
  "Tower Defense": "塔防",
  // 上帝模拟
  "God Game": "上帝模拟",
  // 解谜
  "Puzzle": "解谜",
  "Puzzle-Platformer": "解谜平台",
  // 宠物
  "Magic Pets": "宠物伴游",
  "Pets": "宠物",
  // 地牢探索
  "Dungeon Exploration": "地牢探索",
  "Dungeon Exploration / Mining": "地牢探索",
  "Mining": "采矿",
  // 农场模拟
  "Farming Sim": "农场模拟",
  "Farming Sim / Life Sim": "农场模拟",
  "Life Sim": "生活模拟",
  "Crafting / Building / Sandbox": "合成建造",
  // 战术解谜
  "Tactical / Puzzle": "战术解谜",
  "Tactical Puzzle": "战术解谜",
  // 网格移动
  "Grid-Based Movement": "网格移动",
  "Grid Movement": "网格移动",
  // 博弈
  "Gambling": "博弈",
  "Slot Machine": "老虎机",
  // 迷宫建造
  "Maze Building": "迷宫建造",
  "Labyrinth Building": "迷宫建造",
  // 肉鸽+牌组组合
  "Roguelike Deckbuilder": "牌组构建",
  "Deckbuilding / Roguelike Deckbuilder": "牌组构建",
  // 网格相关
  "Grid-Based Tactics": "网格战术",
  "Grid-based Tactics": "网格战术",
  "Grid-Based Combat": "网格战斗",
  "Grid-free Placement": "自由布局",
  "Grid-based maps": "网格地图",
  "Grid-based Deduction": "网格推理",
  "Grid-based Strategy / Placement": "网格策略",
  "Block-dropping": "方块消除",
  "Three-tiered vertical gameplay": "三层垂直玩法",
  "Falling Block Puzzle": "下落方块解谜",
  "Real-Time mechanics": "即时机制",
  "Real-time mechanics": "即时机制",
};

// ============ 标签匹配工具函数 ============

// 转义正则表达式特殊字符
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============ 性能优化：正则表达式预编译缓存 ============
// 避免 matchWordBoundary 每次调用都创建新的 RegExp 对象
const regexCache = new Map<string, RegExp>();

/**
 * 单词边界匹配
 * - 精确匹配：标签完全相等
 * - 子串匹配：关键词是标签的完整单词（单词边界）
 * 用于避免 "Monster Hunter" 误匹配 "Monster Catching" 中的 "monster"
 */
function matchWordBoundary(text: string, keyword: string): boolean {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  if (lower === kw) return true;
  
  // 使用缓存的正则表达式，避免重复创建
  if (!regexCache.has(kw)) {
    regexCache.set(kw, new RegExp(`\\b${escapeRegex(kw)}\\b`, "i"));
  }
  return regexCache.get(kw)!.test(text);
}

// 简化翻译函数（复用DIFFERENTIATION_LABELS）
function translateTag(tag: string): string {
  return DIFFERENTIATION_LABELS[tag] || tag;
}

// ============ 性能优化：标签权重计算缓存 ============
// 避免对相同标签集重复计算权重
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

// 使用标签数组序列化作为缓存键（标签长度 + 排序后的标签字符串）
const tagWeightCache = new Map<string, TagWeight>();

function getTagsCacheKey(tags: string[], isPokemonLike: boolean): string {
  const sorted = [...tags].sort();
  return `${isPokemonLike ? "1" : "0"}|${sorted.length}|${sorted.join(",")}`;
}

function calculateTagWeight(tags: string[], isPokemonLike: boolean = false): TagWeight {
  const cacheKey = getTagsCacheKey(tags, isPokemonLike);
  if (tagWeightCache.has(cacheKey)) {
    return tagWeightCache.get(cacheKey)!;
  }

  const normalizedTags = tags.map((t) => t.toLowerCase());
  const matchedCoreTags: string[] = [];
  const matchedSecondaryTags: string[] = [];
  const matchedModernTags: string[] = [];
  const uniqueFeatureTags: string[] = [];
  const differentiationLabels: string[] = [];

  // 匹配核心标签：使用单词边界匹配避免误匹配
  for (const tag of CORE_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      matchedCoreTags.push(tag);
    }
  }

  // 匹配次级标签（不在核心中的才计入）
  const coreSet = new Set(matchedCoreTags.map((t) => t.toLowerCase()));
  for (const tag of SECONDARY_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag)) && !coreSet.has(tag.toLowerCase())) {
      matchedSecondaryTags.push(tag);
    }
  }

  // 匹配现代融合标签（独立计算）
  // 使用单词边界匹配避免误匹配（如"Open World RPG"不应匹配"Open World"）
  for (const tag of MODERN_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      matchedModernTags.push(tag);
      // 添加到特色标签
      if (!uniqueFeatureTags.includes(tag)) {
        uniqueFeatureTags.push(tag);
        // 添加展示用标签
        const label = translateTag(tag);
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
  let tagWeight = matchedCoreTags.length * 3 + matchedSecondaryTags.length * 2 + matchedModernTags.length * 1;

  // 兜底：Pokemon-like 游戏如果标签太少（<10个），给予最小权重
  // 避免 Steam 标签采集不完整导致完全没有匹配度
  if (tagWeight === 0 && isPokemonLike && tags.length < 10) {
    tagWeight = 1;
  }

  const result: TagWeight = {
    coreTagCount: matchedCoreTags.length,
    secondaryTagCount: matchedSecondaryTags.length,
    modernTagCount: matchedModernTags.length,
    tagWeight,
    matchedCoreTags: matchedCoreTags.map(translateTag),
    matchedSecondaryTags: matchedSecondaryTags.map(translateTag),
    matchedModernTags: matchedModernTags.map(translateTag),
    uniqueFeatureTags,
    differentiationLabels,
  };

  // 缓存结果（限制缓存大小避免内存泄漏）
  if (tagWeightCache.size < 10000) {
    tagWeightCache.set(cacheKey, result);
  }

  return result;
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

// 回合制类型genres（genres中有这些也视为回合制RPG）
const TURN_BASED_GENRES = [
  "RPG",
  "JRPG",
  "策略",
  "Strategy",
  "Role-Playing",
];

// ============ 宝可梦Like关键词配置 ============
// 统一从 src/config/pokemonLikeKeywords.json 读取
import pokemonLikeConfig from "@/config/pokemonLikeKeywords.json";

// 核心标签（高权重匹配）
const POKEMON_LIKE_TAGS: string[] = pokemonLikeConfig.coreTags;

// 次级标签（中等权重）
const POKEMON_LIKE_SECONDARY_TAGS: string[] = pokemonLikeConfig.secondaryTags || [];

// 描述关键词
const POKEMON_LIKE_DESC_KEYWORDS: string[] = pokemonLikeConfig.descriptionKeywords;

// 同义词映射（用于扩展匹配）
const POKEMON_LIKE_SYNONYMS: Record<string, string[]> = pokemonLikeConfig.synonyms || {};

// ============ 同义词扩展：从配置动态构建扩展标签列表 ============
// 将同义词配置展开为核心标签列表的补充
const SYNONYMS_EXTENDED_TAGS: string[] = [];
for (const [key, values] of Object.entries(POKEMON_LIKE_SYNONYMS)) {
  // 只有当 key 存在于核心标签中时，才将其同义词加入扩展列表
  if (POKEMON_LIKE_TAGS.includes(key)) {
    SYNONYMS_EXTENDED_TAGS.push(...values);
  }
}

// 合并后的完整核心标签列表（原有 + 同义词扩展）
const ALL_CORE_TAGS: string[] = [...POKEMON_LIKE_TAGS, ...SYNONYMS_EXTENDED_TAGS];
// 回合制描述关键词（当标签不可靠时，用描述兜底检测）
const TURN_BASED_DESC_KEYWORDS = [
  "turn-based",
  "回合制",
  "回合策略",
  "回合战斗",
  "tactical rpg",
  "srpg",
  "jrpg",
  "策略rpg",
  "战棋",
];

// 黑名单标签(这些类型的游戏不值得参考)
const BLACKLIST_TAGS = [
  // NSFW/成人内容（独立维护）
  "NSFW",
  "Hentai",
  "Sexual Content",
];

// 黑名单描述关键词（NSFW 成人内容兜底检测）
// 用于检测 Steam 标签不准确/缺失，但描述中暴露了成人内容的情况
// 使用精确词组模式避免误判（如 "adult education" 是正经教育游戏）
const BLACKLIST_DESC_KEYWORDS = [
  "adult visual novel",
  "adult game",
  "adult rpg",
  "adult sim",
  "erotic",
  "erotica",
  "nsfw",
  "hentai",
  "porn",
  "xxx",
  "steamy visual",
  "erotic visual",
  "sexy visual",
  "spicy erotic",
  "hot girls",
  "sultry teacher",
  "intimate encounter",
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
// 策略：先检查标签 → 再检查 genres（兜底） → 再检查描述关键词（额外兜底）
function isTurnBased(tags: string[], genres: string[], shortDescription?: string): boolean {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const normalizedGenres = genres.map((g) => g.toLowerCase());

  // 策略1：检查标签
  const hasTurnBasedTag = TURN_BASED_TAGS.some((tb) => {
    const tbLower = tb.toLowerCase();
    return normalizedTags.some((t) => t.includes(tbLower));
  });
  if (hasTurnBasedTag) return true;

  // 策略2：genres 兜底（RPG/JRPG/策略类型本身暗示回合制特征）
  const hasGenreFallback = TURN_BASED_GENRES.some((g) =>
    normalizedGenres.some((ng) => ng.includes(g.toLowerCase()))
  );
  if (hasGenreFallback) return true;

  // 策略3：描述关键词兜底（Steam 标签为空/乱填时补救）
  if (shortDescription) {
    const descLower = shortDescription.toLowerCase();
    const hasDescFallback = TURN_BASED_DESC_KEYWORDS.some((kw) =>
      descLower.includes(kw.toLowerCase())
    );
    if (hasDescFallback) return true;
  }

  return false;
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

// ============ 性能优化：特色标签统计缓存 ============
// 避免对相同的筛选条件重复计算标签统计
interface FeatureTagCacheEntry {
  data: FeatureTagOption[];
  timestamp: number;
}
const FEATURE_TAG_CACHE_TTL = 60 * 1000; // 1分钟缓存
const featureTagCache = new Map<string, FeatureTagCacheEntry>();

function getFeatureTagCacheKey(params: {
  pools: string[];
  yearsFilter?: number;
  minReleaseDate?: string;
  maxReleaseDate?: string;
  excludeTestVersions?: boolean;
  reviewSource: ReviewSource;
}): string {
  return [
    params.pools.sort().join(","),
    params.yearsFilter || 0,
    params.minReleaseDate || "",
    params.maxReleaseDate || "",
    params.excludeTestVersions !== false ? "1" : "0",
    params.reviewSource || "all",
  ].join("|");
}

// ============ LRU 查询结果缓存 ============
// 优化：缓存完整过滤结果，支持快速分页切片（无需重新计算）
// 缓存键不包含 page，因为完整结果会被缓存用于任意分页切片

const CACHE_VERSION = "v5"; // v5: 缓存完整过滤结果，支持分页切片
const MAX_QUERY_CACHE_SIZE = 30; // 降低数量以节省内存（每个缓存包含完整结果）
type QueryCacheKey = string;
interface QueryCacheEntry {
  allFiltered: GameRecord[];  // 完整过滤结果（用于分页切片）
  total: number;
  stats: PoolStats;
  priceStats: PriceStats | undefined;
  timestamp: number;
}

const queryCache = new Map<QueryCacheKey, QueryCacheEntry>();

function getBaseCacheKey(params: {
  pools?: string[];
  query?: string;
  sortBy?: string;
  sortOrder?: string;
  tagSortBy?: string;
  yearsFilter?: number;
  minReleaseDate?: string;
  maxReleaseDate?: string;
  excludeTestVersions?: boolean;
  priceMin?: number;
  priceMax?: number;
  modernTagFilter?: string;
  featureTagFilters?: string[];
  poolA_minRating?: number;
  poolA_minReviews?: number;
  poolA_minYear?: number;
  poolB_minRating?: number;
  poolB_minReviews?: number;
  poolC_minRating?: number;
  poolC_maxRating?: number;
  poolC_minReviews?: number;
  reviewSource?: string;
}): QueryCacheKey {
  const parts = [
    CACHE_VERSION,
    params.pools?.join(",") || "",
    params.query?.toLowerCase().trim() || "",
    params.sortBy || "wilson",
    params.sortOrder || "desc",
    params.tagSortBy || "count",
    params.yearsFilter || 0,
    params.minReleaseDate || "",
    params.maxReleaseDate || "",
    params.excludeTestVersions !== false ? "1" : "0",
    params.priceMin?.toFixed(2) || "",
    params.priceMax?.toFixed(2) || "",
    params.modernTagFilter || "",
    Array.isArray(params.featureTagFilters) ? params.featureTagFilters.sort().join(",") : (params.featureTagFilters || ""),
    params.poolA_minRating || POOL_DEFAULTS.A.minRating,
    params.poolA_minReviews || POOL_DEFAULTS.A.minReviews,
    params.poolA_minYear || POOL_DEFAULTS.A.minYear,
    params.poolB_minRating || POOL_DEFAULTS.B.minRating,
    params.poolB_minReviews || POOL_DEFAULTS.B.minReviews,
    params.poolC_minRating || POOL_DEFAULTS.C.minRating,
    params.poolC_maxRating || POOL_DEFAULTS.C.maxRating,
    params.poolC_minReviews || POOL_DEFAULTS.C.minReviews,
    params.reviewSource || "all",
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
const REGIONAL_REVIEWS_FILE = path.join(process.cwd(), "public", "data", "regional-reviews.json");

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
    isPokemonLike: row.is_pokemon_like === 1
      || checkPokemonLike(
          row.tags ? JSON.parse(row.tags) : [],
          [],
          row.short_description || ""
        ).isPokemonLike,
    pokemonLikeTags: row.pokemon_like_tags ? JSON.parse(row.pokemon_like_tags) : [],
    wilsonScore: row.wilson_score,
    cnWilsonScore: row.cn_wilson_score,
    overseasWilsonScore: row.overseas_wilson_score,
    pool: row.pool === "A" || row.pool === "B" || row.pool === "C" ? row.pool as "A" | "B" | "C" : null,
    isTurnBased: row.is_turn_based === 1
      || isTurnBased(
          row.tags ? JSON.parse(row.tags) : [],
          row.genres ? JSON.parse(row.genres) : [],
          row.short_description || ""
        ),
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
    innovationTags: [],
  };
}

// 从 combinedMechanics.json 加载 LLM 玩法分析数据并合并到游戏记录中
// 对所有游戏尝试匹配（按 appId 和名称），即使没有匹配到数据也确保字段已初始化
// 优化：如果没有数据文件或数据为空，跳过整个处理
function mergeLlMechancics(games: GameRecord[]): void {
  try {
    if (!fs.existsSync(COMBINED_MECHANICS_FILE)) {
      console.warn("[Mode2] combinedMechanics.json 不存在，跳过 LLM 数据合并");
      return;
    }
    const raw = fs.readFileSync(COMBINED_MECHANICS_FILE, "utf-8");
    const mechanicsData = JSON.parse(raw) as any;
    const gamesData = mechanicsData.games || {};

    // 优化：如果没有 LLM 数据，直接返回（不遍历所有游戏）
    const gameKeys = Object.keys(gamesData);
    if (gameKeys.length === 0) {
      console.log("[Mode2] LLM 数据为空，跳过合并");
      return;
    }

    // 建立 appId -> LLM 数据的映射（同时按 ID 和名称索引）
    const mechanicsMap = new Map<string, any>();
    for (const [key, data] of Object.entries(gamesData)) {
      mechanicsMap.set(key, data);
      const name = (data as any).name;
      if (name) {
        mechanicsMap.set(name, data);
      }
    }

    // 合并到每个游戏（只处理有匹配的游戏）
    let matchedCount = 0;
    for (const game of games) {
      const data = mechanicsMap.get(game.id) || mechanicsMap.get(game.name);
      if (data) {
        // 合并 llmMechanics（同时应用同义词合并，将废弃标签替换为保留标签）
        const llmMechanics = (data as any).mechanics || [];
        const existingSet = new Set(game.llmMechanics);
        for (const m of llmMechanics) {
          const merged = TAG_SYNONYM_MERGE[m] || m;
          if (!existingSet.has(merged)) {
            game.llmMechanics.push(merged);
            existingSet.add(merged);
          }
        }
        // 合并 llmRawMechanics（同样应用同义词合并）
        const rawMechanics = (data as any).rawMechanics || [];
        const rawSet = new Set(game.llmRawMechanics);
        for (const m of rawMechanics) {
          const merged = TAG_SYNONYM_MERGE[m] || m;
          if (!rawSet.has(merged)) {
            game.llmRawMechanics.push(merged);
            rawSet.add(merged);
          }
        }
        // 合并 llmMechanicsSummary
        if (!game.llmMechanicsSummary && (data as any).summary) {
          game.llmMechanicsSummary = (data as any).summary;
        }
        matchedCount++;
      }
    }
    console.log(`[Mode2] LLM 数据合并完成: 匹配 ${matchedCount} 个 (共 ${games.length} 个游戏)`);
  } catch (e) {
    console.warn(`[Mode2] 合并 LLM 玩法数据失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 加载区域评价数据并合并到游戏记录中
interface RegionalReviewData {
  cn: { positive: number; negative: number; total: number; review_score: number };
  overseas: { positive: number; negative: number; total: number; review_score: number };
}

function mergeRegionalReviews(games: GameRecord[]): void {
  try {
    if (!fs.existsSync(REGIONAL_REVIEWS_FILE)) {
      console.warn("[Mode2] regional-reviews.json 不存在，跳过区域评价数据合并");
      return;
    }
    const raw = fs.readFileSync(REGIONAL_REVIEWS_FILE, "utf-8");
    const regionalData = JSON.parse(raw) as Record<string, RegionalReviewData>;

    // 建立 appId -> 区域评价数据的映射
    const regionalMap = new Map<string, RegionalReviewData>();
    for (const [appId, data] of Object.entries(regionalData)) {
      regionalMap.set(appId, data);
    }

    // 合并到每个游戏
    let matchedCount = 0;
    for (const game of games) {
      const data = regionalMap.get(game.id);
      if (data && data.cn && data.overseas) {
        // 计算好评率百分比（0-100）
        const cnScore = data.cn.total > 0
          ? Math.round((data.cn.positive / data.cn.total) * 100)
          : 0;
        const overseasScore = data.overseas.total > 0
          ? Math.round((data.overseas.positive / data.overseas.total) * 100)
          : 0;
        // 更新 cnReviews
        game.cnReviews = {
          totalPositive: data.cn.positive,
          totalNegative: data.cn.negative,
          totalReviews: data.cn.total,
          reviewScore: cnScore,
          reviewScoreDescription: getReviewScoreDesc(cnScore),
        };
        // 更新 overseasReviews
        game.overseasReviews = {
          totalPositive: data.overseas.positive,
          totalNegative: data.overseas.negative,
          totalReviews: data.overseas.total,
          reviewScore: overseasScore,
          reviewScoreDescription: getReviewScoreDesc(overseasScore),
        };
        matchedCount++;
      }
    }
    console.log(`[Mode2] 区域评价数据合并完成: 匹配 ${matchedCount} 个游戏 (共 ${games.length} 个)`);
  } catch (e) {
    console.warn(`[Mode2] 合并区域评价数据失败: ${e instanceof Error ? e.message : String(e)}`);
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
  // 小众创新标签新增字段
  positiveRate?: number;    // 好评率 0-100
  totalPositive?: number;  // 好评数合计
  totalNegative?: number;   // 差评数合计
  innovationScore?: number;  // 创新指数
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

// ============ 宝可梦Like判定结果类型 ============
export type PokemonLikeConfidence = "high" | "medium" | "low";

export interface PokemonLikeResult {
  isPokemonLike: boolean;
  matchingTags: string[];
  confidence: PokemonLikeConfidence;
  matchedBy: string[];  // 记录通过什么匹配（tag/genre/description）
  coreMatchCount: number;  // 核心标签匹配数量
  secondaryMatchCount: number;  // 次级标签匹配数量
  descMatchCount: number;  // 描述关键词匹配数量
}

/**
 * 检查游戏是否为宝可梦Like
 * 使用两层匹配策略：
 * - 第一层：标签匹配（核心标签 + 同义词扩展）→ 判定 isPokemonLike
 * - 第二层：描述关键词 → 作为 isPokemonLike 判定补充，降低漏判率
 */
function checkPokemonLike(
  tags: string[],
  genres: string[],
  shortDescription?: string,
  detailedDescription?: string
): PokemonLikeResult {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const normalizedGenres = genres.map((g) => g.toLowerCase());
  const matchingTags: string[] = [];
  const matchedBy: string[] = [];
  let coreMatchCount = 0;
  let secondaryMatchCount = 0;
  let descMatchCount = 0;

  // 策略1：检查核心标签（含同义词扩展，使用单词边界匹配避免误匹配）
  // 【核心】必须有核心标签匹配才能判定为宝可梦Like
  for (const tag of ALL_CORE_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      matchingTags.push(tag);
      matchedBy.push(`tag:${tag}`);
      coreMatchCount++;
    }
  }

  // 策略2：检查次级标签（仅作为置信度补充，不单独作为判定依据）
  // 次级标签如 Fishing, Hunting 等太泛化，不应用于 isPokemonLike 判定
  for (const tag of POKEMON_LIKE_SECONDARY_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      matchedBy.push(`secondary:${tag}`);
      secondaryMatchCount++;
    }
  }

  // 策略3：描述关键词兜底（参与 isPokemonLike 判定，降低漏判率）
  // 典型场景：Steam 标签被成人/自动化等无关内容污染，或小众游戏标签不完整
  const fullDesc = [shortDescription, detailedDescription].filter(Boolean).join(" ");
  if (fullDesc) {
    const descLower = fullDesc.toLowerCase();
    for (const keyword of POKEMON_LIKE_DESC_KEYWORDS) {
      if (descLower.includes(keyword.toLowerCase())) {
        matchedBy.push(`desc:${keyword}`);
        descMatchCount++;
      }
    }
  }

  // 【改进】isPokemonLike 判定逻辑
  // 原有：coreMatchCount > 0
  // 修改为：核心标签匹配 OR 描述关键词丰富（>=2个关键词）
  // 这样即使标签缺失，只要描述中明确提到宝可梦Like玩法，也能进入候选池
  const isPokemonLike = coreMatchCount > 0 || descMatchCount >= 2;

  // 计算置信度（基于所有匹配来源）
  let confidence: PokemonLikeConfidence = "low";
  if (coreMatchCount >= 3) {
    confidence = "high";
  } else if (coreMatchCount >= 2) {
    confidence = "high";
  } else if (coreMatchCount === 1) {
    // 有核心标签：参考次级标签和描述关键词提升置信度
    if (secondaryMatchCount >= 2 || descMatchCount >= 3) {
      confidence = "high";
    } else if (secondaryMatchCount >= 1 || descMatchCount >= 1) {
      confidence = "medium";
    } else {
      confidence = "medium";  // 有核心标签至少是中等置信度
    }
  } else if (descMatchCount >= 3) {
    // 无核心标签但描述丰富：中等置信度（由LLM最终判定）
    confidence = "medium";
  } else if (descMatchCount >= 2) {
    // 描述关键词触发 isPokemonLike，置信度为 low（等待LLM分析）
    confidence = "low";
  }
  // 注意：没有核心标签且描述不丰富时，isPokemonLike = false，置信度为 low

  return {
    isPokemonLike,
    matchingTags,
    confidence,
    matchedBy,
    coreMatchCount,
    secondaryMatchCount,
    descMatchCount,
  };
}

function isBlacklisted(tags: string[], genres: string[], shortDescription?: string): boolean {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  // 策略1：标签黑名单
  if (BLACKLIST_TAGS.some((bl) => normalizedTags.some((t) => t.includes(bl.toLowerCase())))) {
    return true;
  }
  // 策略2：描述黑名单兜底（Steam 标签不准确/缺失时补救）
  // 133个A池游戏描述含NSFW词但标签未检测到
  if (shortDescription) {
    const descLower = shortDescription.toLowerCase();
    if (BLACKLIST_DESC_KEYWORDS.some((bl) => descLower.includes(bl.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function transformGame(appId: string, raw: RawGameData): GameRecord {
  const owners = parseEstimatedOwners(raw.estimated_owners);
  const totalReviews = raw.positive + raw.negative;
  const reviewScore = totalReviews > 0 ? Math.round((raw.positive / totalReviews) * 100) : 0;
  const tags = normalizeTags(raw.tags);
  // games-index.json 的 categories 是数字数组（如 [2, 22, 29]），转换为字符串
  const categories = (raw.categories || []).map((c: unknown) => String(c));

  const pokemonCheck = checkPokemonLike(tags, raw.genres || [], raw.short_description, raw.detailed_description);
  const blacklisted = isBlacklisted(tags, raw.genres || [], raw.short_description);
  const turnBased = isTurnBased(tags, raw.genres || [], raw.short_description);

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
  const tagWeight = calculateTagWeight(tags, pokemonCheck.isPokemonLike);

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
    pokemonLikeConfidence: pokemonCheck.confidence,
    pokemonLikeMatchedBy: pokemonCheck.matchedBy,
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
    innovationTags: [],
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

function loadDatabase(): { games: GameRecord[] } {
  const now = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  // 开发环境缓存 1 分钟，生产环境缓存 5 分钟
  const cacheValid =
    dbCache.games.length > 0 &&
    dbCache.loadedAt !== null &&
    (isProduction || now - dbCache.loadedAt < 60 * 1000);

  if (cacheValid) {
    console.log(`[Mode2] 使用内存缓存的 ${dbCache.games.length} 个游戏 (距上次加载 ${Math.round((now - dbCache.loadedAt!) / 1000)}s 前)`);
    return { games: dbCache.games };
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
      // 合并区域评价数据
      mergeRegionalReviews(games);
      dbCache.loadedAt = now;
      dbCache.loadError = null;
      console.log(`[Mode2] 从 SQLite 加载 ${games.length} 个游戏，耗时 ${Date.now() - loadStart}ms`);
      return { games };
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
      // 初始化所有游戏的 LLM 字段（cache.games 中的原始对象可能缺少这些字段）
      for (const game of cache.games) {
        if (!game.llmMechanics) game.llmMechanics = [];
        if (!game.llmRawMechanics) game.llmRawMechanics = [];
        if (game.innovationTags === undefined) game.innovationTags = [];

        // 运行时重新计算宝可梦Like置信度
        // 原因：预计算时的关键词列表可能不完整，需要用最新的关键词配置重新检测
        const tags = normalizeTags(game.tags);
        const genres = game.genres || [];
        const detailedDesc = (game as Record<string, unknown>).detailed_description as string | undefined;
        const pokemonCheck = checkPokemonLike(tags, genres, game.shortDescription || "", detailedDesc);

        game.isPokemonLike = pokemonCheck.isPokemonLike;
        game.pokemonLikeTags = pokemonCheck.matchingTags;
        game.pokemonLikeConfidence = pokemonCheck.confidence;
        game.pokemonLikeMatchedBy = pokemonCheck.matchedBy;

        // 运行时兜底：如果预计算的 isTurnBased 为 false，用描述关键词重新检测
        // 解决预计算时描述关键词覆盖不足导致回合制游戏漏判的问题
        if (!game.isTurnBased) {
          if (isTurnBased(tags, genres, game.shortDescription || "")) {
            game.isTurnBased = true;
          }
        }
      }
      // 从 combinedMechanics.json 合并 LLM 玩法分析数据到每个游戏
      mergeLlMechancics(cache.games);
      // 合并区域评价数据
      mergeRegionalReviews(cache.games);
      dbCache.loadedAt = now;
      dbCache.loadError = null;
      console.log(`[Mode2] 从 JSON 缓存加载 ${cache.games.length} 个游戏，耗时 ${Date.now() - loadStart}ms`);
      console.log(`[Mode2] 缓存信息: 去重后 ${cache.meta.totalAfterDedup} 个 | 回合制 ${cache.meta.totalTurnBased} | A池 ${cache.meta.poolA} | B池 ${cache.meta.poolB} | C池 ${cache.meta.poolC}`);
      return { games: dbCache.games };
    }

    console.warn("[Mode2] 预计算缓存不存在或为空，降级使用原始 JSON");
    if (!fs.existsSync(DB_FILE)) {
      dbCache.loadError = `数据库文件不存在: ${DB_FILE}`;
      console.error("[Mode2] 文件不存在:", DB_FILE);
      return { games: [] };
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
    // 合并区域评价数据
    mergeRegionalReviews(deduped);
    dbCache.loadedAt = now;
    dbCache.loadError = null;
    console.log(`[Mode2] 数据转换完成，耗时 ${Date.now() - transformStart}ms`);

    return { games: deduped };
  } catch (e) {
    const msg = `加载数据库失败: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[Mode2]", msg);
    dbCache.loadError = msg;
    return { games: [] };
  }
}

// ============ 池子计算逻辑 ============

interface PoolConfig {
  poolA: {
    minRating: number;
    minReviews: number;
    excludePokemonLike: boolean;
    minYear?: number;
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

// 池子规则接口
interface PoolRule {
  name: "A" | "B" | "C";
  conditions: {
    isPokemonLike?: boolean;
    minRating: number;
    maxRating?: number;
    minReviews: number;
    minYear?: number;
  };
}

// 池子计算规则配置（已废弃，请使用 POOL_DEFAULTS）
// 注意：此常量未在代码中使用，仅作参考保留
const DEFAULT_POOL_RULES: PoolRule[] = [
  {
    name: "A",
    conditions: { isPokemonLike: false, minRating: POOL_DEFAULTS.A.minRating, minReviews: POOL_DEFAULTS.A.minReviews, minYear: POOL_DEFAULTS.A.minYear },
  },
  {
    name: "B",
    conditions: { isPokemonLike: true, minRating: POOL_DEFAULTS.B.minRating, minReviews: POOL_DEFAULTS.B.minReviews },
  },
  {
    name: "C",
    conditions: { isPokemonLike: true, minRating: POOL_DEFAULTS.C.minRating, maxRating: POOL_DEFAULTS.C.maxRating, minReviews: POOL_DEFAULTS.C.minReviews },
  },
];

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
  const blacklisted = isBlacklisted(game.tags, game.genres || [], game.shortDescription);

  // 黑名单游戏不进入任何池子
  if (blacklisted) {
    return null;
  }

  // 根据 config 构建动态规则
  const rules: PoolRule[] = [
    {
      name: "A",
      conditions: {
        isPokemonLike: config.poolA.excludePokemonLike ? false : undefined,
        minRating: config.poolA.minRating,
        minReviews: config.poolA.minReviews,
        minYear: config.poolA.minYear,
      },
    },
    {
      name: "B",
      conditions: {
        isPokemonLike: config.poolB.requirePokemonLike ? true : undefined,
        minRating: config.poolB.minRating,
        minReviews: config.poolB.minReviews,
      },
    },
    {
      name: "C",
      conditions: {
        isPokemonLike: config.poolC.requirePokemonLike ? true : undefined,
        minRating: config.poolC.minRating,
        maxRating: config.poolC.maxRating,
        minReviews: config.poolC.minReviews,
      },
    },
  ];

  // 规则顺序很重要：A -> B -> C
  for (const rule of rules) {
    const cond = rule.conditions;

    // 检查 isPokemonLike 条件
    if (cond.isPokemonLike !== undefined) {
      if (cond.isPokemonLike !== game.isPokemonLike) {
        continue;
      }
    }

    // 检查好评率下限
    if (reviewScore < cond.minRating) {
      continue;
    }

    // 检查好评率上限（仅 C 池需要）
    if (cond.maxRating !== undefined && reviewScore > cond.maxRating) {
      continue;
    }

    // 检查评论数
    if (totalReviews < cond.minReviews) {
      continue;
    }

    // 检查年份（仅 A 池需要）
    if (cond.minYear !== undefined) {
      if (!game.releaseDate) {
        continue;
      }
      const year = new Date(game.releaseDate).getFullYear();
      if (year < cond.minYear) {
        continue;
      }
    }

    return rule.name;
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
    featureTagFilters?: string[];
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
  if (options.modernTagFilter || options.featureTagFilters) {
    results = results.filter((g) => {
      // 核心标签筛选
      if (options.modernTagFilter === "hasCore" && g.coreTagCount === 0) {
        return false;
      }
      // 现代融合标签筛选
      if (options.modernTagFilter === "hasModern" && g.modernTagCount === 0) {
        return false;
      }
      // 具体特色标签筛选（同时检查 llmMechanics 和 llmRawMechanics，并展开同义词）
      // 使用模糊匹配：标签是 mechanics 的子串则匹配
      if (options.featureTagFilters && options.featureTagFilters.length > 0) {
        // 多标签筛选：游戏必须包含所有选中的标签（AND 逻辑）
        for (const filterKey of options.featureTagFilters) {
          // 尝试用 key 匹配，如果找不到就用 label 或 tag（中文标签名）匹配
          let featureTag = options.featureTagOptions?.find((f) => f.key === filterKey);
          if (!featureTag) {
            featureTag = options.featureTagOptions?.find((f) => f.label === filterKey || f.tag === filterKey);
          }
          if (featureTag) {
            const llmM = (g.llmMechanics || []) as string[];
            const llmRawM = (g.llmRawMechanics || []) as string[];
            // 使用预构建的反向索引快速获取废弃同义词
            const tagLower = featureTag.tag.toLowerCase();
            const synonymsToCheck = [tagLower, ...(REVERSE_SYNONYM_MAP.get(featureTag.tag) || []).map(s => s.toLowerCase())];
            // 统一转为小写比较，避免大小写不匹配
            const llmMLower = llmM.map((m: string) => m.toLowerCase());
            const llmRawMLower = llmRawM.map((m: string) => m.toLowerCase());
            // 模糊匹配：检查标签是否是任意 mechanics 的子串
            const hasTag = synonymsToCheck.some(tag =>
              llmMLower.some(mech => mech.includes(tag) || mech === tag) ||
              llmRawMLower.some(mech => mech.includes(tag) || mech === tag)
            );
            if (!hasTag) return false; // 只要有一个标签不匹配就过滤掉
          }
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

  // 6. 统计各池数量（基于筛选后的结果）- 优化：单次遍历代替3次遍历
  const stats: PoolStats = {
    total: results.length,
    totalTurnBased: results.length,
    poolA: 0,
    poolB: 0,
    poolC: 0,
  };
  for (const g of results) {
    if (g.pool === "A") stats.poolA++;
    else if (g.pool === "B") stats.poolB++;
    else if (g.pool === "C") stats.poolC++;
  }

  // 7. 计算价格统计
  const priceStats = calculatePriceStats(results);

  // 8. 分页
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const offset = (page - 1) * pageSize;
  const paged = results.slice(offset, offset + pageSize);

  // 8. 动态计算特色标签（基于当前 MODERN_TAGS 配置）
  // 使用动态加载的标签翻译映射表（translateTag函数内部缓存）
  const pagedWithFeatures = paged.map((game) => {
    const tagWeight = calculateTagWeight(game.tags, !!game.isPokemonLike);
    // 多选模式下，取第一个选中的标签用于高亮（如果有的话）
    const firstFilterKey = Array.isArray(options.featureTagFilters) ? options.featureTagFilters[0] : options.featureTagFilters;
    const featureTagOption = firstFilterKey ? options.featureTagOptions?.find((f) => f.key === firstFilterKey) : undefined;
    const activeTag = featureTagOption?.tag;
    const activeLabel = featureTagOption?.label;

    // 从 uniqueFeatureTags 转换为中文展示标签
    // 用 Set 去重：不同英文标签可能映射到同一个中文标签（如 Card Battler 和 Deckbuilding 都映射到"牌组构建"）
    const seenLabels = new Set<string>();
    const differentiationLabels: string[] = [];
    for (const t of tagWeight.uniqueFeatureTags) {
      const label = translateTag(t);
      if (!seenLabels.has(label)) {
        seenLabels.add(label);
        differentiationLabels.push(label);
      }
    }

    // 排重：featureTagOption.tag 是原始标签（如 "Time Travel"），与 matchedModernTags 英文原名对比
    // 只对 displayModernTags 排重（matchedModernTags 是英文预计算数据）
    const excludedRawTag = activeTag ? activeTag.toLowerCase() : "";
    // 用中文标签做排重检查（因为 differentiationLabels 已转换为中文）
    const excludedLabelInChinese = activeTag ? translateTag(activeTag) : "";
    // matchedModernTags 转中文后也需要去重（不同英文标签可能映射到同一中文标签）
    const displaySeen = new Set<string>();
    const displayModernTags: string[] = [];
    for (const t of tagWeight.matchedModernTags) {
      const label = translateTag(t);
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
    // 所有标签必须翻译成中文
    const rawMechanicsBlacklist: Record<string, boolean> = TAG_BLACKLIST;
    const innovationTagSeen = new Set<string>(); // 用于英文原名去重
    const innovationTagSeenCN = new Set<string>(); // 用于中文标签去重
    const innovationTags: string[] = [];

    // 先加入 activeFeatureTagLabel（用户筛选的标签）
    if (activeFeatureTagLabel) {
      innovationTagSeenCN.add(activeFeatureTagLabel);
    }
    // 加入 differentiationLabels 中已有的标签（避免重复）
    for (const l of differentiationLabels) {
      innovationTagSeenCN.add(l);
    }

    // 过滤 llmRawMechanics：排除黑名单标签和已显示的标签，翻译成中文
    for (const tag of (game.llmRawMechanics || [])) {
      const lower = tag.toLowerCase();
      // 跳过黑名单（品类标配）和已显示的标签
      if (rawMechanicsBlacklist[tag] || rawMechanicsBlacklist[lower]) {
        continue;
      }
      // 翻译成中文
      const cnLabel = translateTag(tag);
      // 中文标签去重
      if (innovationTagSeenCN.has(cnLabel)) {
        continue;
      }
      innovationTagSeen.add(lower);
      innovationTagSeenCN.add(cnLabel);
      innovationTags.push(cnLabel);
    }

    // 同时将 llmMechanics 中非黑名单的标签也加入（作为权威补充）
    for (const tag of (game.llmMechanics || [])) {
      const lower = tag.toLowerCase();
      if (rawMechanicsBlacklist[tag] || rawMechanicsBlacklist[lower]) {
        continue;
      }
      // 翻译成中文
      const cnLabel = translateTag(tag);
      // 中文标签去重
      if (innovationTagSeenCN.has(cnLabel)) {
        continue;
      }
      innovationTagSeen.add(lower);
      innovationTagSeenCN.add(cnLabel);
      innovationTags.push(cnLabel);
    }

    return {
      ...game,
      uniqueFeatureTags: tagWeight.uniqueFeatureTags,
      differentiationLabels,
      matchedModernTags: tagWeight.matchedModernTags,
      modernTagCount: tagWeight.modernTagCount,
      activeFeatureTagFilter: options.featureTagFilters?.[0],
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
  featureTagFilters?: string[],
  featureTagOptions?: FeatureTagOption[],
  reviewSource: ReviewSource = "all"
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
    const pool = calculatePool(game, poolConfig, reviewSource);

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

    // 特色标签筛选（和各池子数量同步，支持多选）
    // 使用模糊匹配：标签是 mechanics 的子串则匹配
    if (featureTagFilters && featureTagFilters.length > 0) {
      let hasAllTags = true;
      for (const filterKey of featureTagFilters) {
        const featureTag = featureTagOptions?.find((f) => f.key === filterKey);
        if (featureTag) {
          const llmM = (game.llmMechanics || []) as string[];
          const llmRawM = (game.llmRawMechanics || []) as string[];
          // 使用预构建的反向索引快速获取废弃同义词
          const tagLower = featureTag.tag.toLowerCase();
          const synonymsToCheck = [tagLower, ...(REVERSE_SYNONYM_MAP.get(featureTag.tag) || []).map(s => s.toLowerCase())];
          // 统一转为小写比较，避免大小写不匹配
          const llmMLower = llmM.map((m: string) => m.toLowerCase());
          const llmRawMLower = llmRawM.map((m: string) => m.toLowerCase());
          // 模糊匹配：检查标签是否是任意 mechanics 的子串
          const hasTag = synonymsToCheck.some(tag =>
            llmMLower.some(mech => mech.includes(tag) || mech === tag) ||
            llmRawMLower.some(mech => mech.includes(tag) || mech === tag)
          );
          if (!hasTag) {
            hasAllTags = false;
            break;
          }
        }
      }
      if (!hasAllTags) continue;
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
// 优化：添加缓存机制，避免对相同筛选条件重复计算
function calculateFeatureTagCounts(
  allGames: GameRecord[],
  poolConfig: PoolConfig,
  pools: ("A" | "B" | "C")[],
  yearsFilter?: number,
  minReleaseDate?: string,
  maxReleaseDate?: string,
  excludeTestVersions?: boolean,
  reviewSource: ReviewSource = "all"
): FeatureTagOption[] {
  const excludeTest = excludeTestVersions !== false;

  // 尝试从缓存获取
  const cacheKey = getFeatureTagCacheKey({ pools, yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions, reviewSource });
  const cached = featureTagCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FEATURE_TAG_CACHE_TTL) {
    console.log(`[Mode2] 特色标签统计命中缓存`);
    return cached.data;
  }

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
    pool: calculatePool(g, poolConfig, reviewSource),
  }));

  // 根据用户勾选的池子筛选游戏
  const filteredByPool = gamesWithPools.filter((g) => {
    if (g.pool === null) return false;
    return pools.includes(g.pool);
  });

  if (filteredByPool.length === 0) return [];

  // ============ 从游戏动态收集所有唯一标签 ============
  // 遍历所有游戏，收集 llmMechanics 和 llmRawMechanics 中的标签
  // 应用同义词合并和黑名单过滤
  const tagCountMap: Record<string, { total: number; poolA: number; poolB: number; poolC: number }> = {};

  for (const game of filteredByPool) {
    // 收集该游戏的所有标签（含去重）
    const seen = new Set<string>();
    const allMechs = [...(game.llmMechanics || []), ...(game.llmRawMechanics || [])];
    for (const m of allMechs) {
      if (seen.has(m)) continue;
      seen.add(m);

      const merged = SYNONYM_MAP.get(m) || m;
      if (BLACKLIST_SET.has(merged)) continue;

      if (!tagCountMap[merged]) {
        tagCountMap[merged] = { total: 0, poolA: 0, poolB: 0, poolC: 0 };
      }
      tagCountMap[merged].total++;
      if (game.pool === "A") tagCountMap[merged].poolA++;
      else if (game.pool === "B") tagCountMap[merged].poolB++;
      else if (game.pool === "C") tagCountMap[merged].poolC++;
    }
  }

  // 构建结果：按 count 降序
  const result: FeatureTagOption[] = Object.entries(tagCountMap)
    .map(([tag, counts]) => {
      const key = tag.toLowerCase().replace(/\s+/g, "_").replace(/\//g, "_");
      return {
        key,
        label: tag,
        tag,
        count: counts.total,
        gameCount: counts.total,
        coverage: 0,
        avgWilson: 0,
        poolDistribution: {
          A: counts.poolA,
          B: counts.poolB,
          C: counts.poolC,
        },
        positiveRate: 0,
        totalPositive: 0,
        totalNegative: 0,
        innovationScore: 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  // 缓存结果
  if (featureTagCache.size < 100) {
    featureTagCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
}

// 计算价格统计 - 优化：单次遍历统计分布
function calculatePriceStats(games: GameRecord[]): PriceStats {
  const prices: number[] = [];
  for (const g of games) {
    if (g.price >= 0) {
      prices.push(g.price);
    }
  }

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

  // 单次遍历统计价格分布
  const distribution = { free: 0, under10: 0, under20: 0, under30: 0, under50: 0, over50: 0 };
  for (const p of prices) {
    if (p === 0) distribution.free++;
    else if (p < 10) distribution.under10++;
    else if (p < 20) distribution.under20++;
    else if (p < 30) distribution.under30++;
    else if (p < 50) distribution.under50++;
    else distribution.over50++;
  }

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

  // 获取池子筛选范围
  const pools = searchParams.getAll("pool").filter((p) => ["A", "B", "C"].includes(p)) as ("A" | "B" | "C")[];

  // 获取池子参数（默认值来自 POOL_DEFAULTS）
  // A池: 上线时间2024年之后，非宝可梦Like，好评率>=90%, 评论数>=2000
  const poolA_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolA_minRating") || String(POOL_DEFAULTS.A.minRating), 10)));
  const poolA_minReviews = Math.max(0, parseInt(searchParams.get("poolA_minReviews") || String(POOL_DEFAULTS.A.minReviews), 10));
  const poolA_minYear = Math.max(2020, parseInt(searchParams.get("poolA_minYear") || String(POOL_DEFAULTS.A.minYear), 10) || 2024);

  // B池: 宝可梦Like，好评率>=85%, 评论数>=500
  const poolB_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolB_minRating") || String(POOL_DEFAULTS.B.minRating), 10)));
  const poolB_minReviews = Math.max(0, parseInt(searchParams.get("poolB_minReviews") || String(POOL_DEFAULTS.B.minReviews), 10));

  // C池: 宝可梦Like，好评率40%-74%, 评论数>=500
  const poolC_minRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolC_minRating") || String(POOL_DEFAULTS.C.minRating), 10)));
  const poolC_maxRating = Math.max(0, Math.min(100, parseInt(searchParams.get("poolC_maxRating") || String(POOL_DEFAULTS.C.maxRating), 10)));
  const poolC_minReviews = Math.max(0, parseInt(searchParams.get("poolC_minReviews") || String(POOL_DEFAULTS.C.minReviews), 10));

  const query = searchParams.get("q")?.trim().slice(0, 200) || "";
  const rawSortBy = searchParams.get("sortBy") ?? "";
  const sortBy: "wilson" | "rating" | "reviews" | "date" =
    rawSortBy === "rating" || rawSortBy === "reviews" || rawSortBy === "date" || rawSortBy === "wilson"
      ? rawSortBy
      : "wilson";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(parseInt(searchParams.get("page") || "1", 10) || 1, 1000));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "24", 10) || 24));

  // 特色标签排序方式：count=按数量, innovation=按创新指数
  const tagSortBy = searchParams.get("tagSortBy") === "innovation" ? "innovation" : "count";

  // 时间过滤：只显示最近N年内上线的游戏
  const yearsFilter = Math.max(0, Math.min(100, parseInt(searchParams.get("yearsFilter") || "0", 10) || 0));
  const minReleaseDate = searchParams.get("minReleaseDate")?.trim() || undefined;
  const maxReleaseDate = searchParams.get("maxReleaseDate")?.trim() || undefined;

  // 是否过滤测试版（默认 true）
  const excludeTestVersions = searchParams.get("excludeTestVersions") !== "false";

  // 价格筛选参数
  const priceMin = searchParams.get("priceMin") ? parseFloat(searchParams.get("priceMin")!) : undefined;
  const priceMax = searchParams.get("priceMax") ? parseFloat(searchParams.get("priceMax")!) : undefined;

  // 特色标签筛选参数（支持多选）
  const modernTagFilter = searchParams.get("modernTagFilter") as "hasCore" | "hasModern" | undefined;
  // 收集所有 featureTagFilter 参数（支持多个同名参数）
  const featureTagFilters: string[] = [];
  searchParams.forEach((value, key) => {
    if (key === "featureTagFilter" && value) {
      featureTagFilters.push(value);
    }
  });

  // 评价来源参数（默认全部）
  const rawReviewSource = searchParams.get("reviewSource") ?? "all";
  const reviewSource: ReviewSource =
    rawReviewSource === "cn" || rawReviewSource === "overseas"
      ? rawReviewSource
      : "all";

  // 是否只获取统计信息
  const statsOnly = searchParams.get("statsOnly") === "true";

  // 是否返回完整结果集（用于前端缓存）
  const fullResults = searchParams.get("fullResults") === "true";

  console.log("[Mode2] 开始加载数据库");
  const { games: allGames } = loadDatabase();
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
    poolA: {
      minRating: poolA_minRating,
      minReviews: poolA_minReviews,
      excludePokemonLike: true,
      minYear: poolA_minYear,
    },
    poolB: { minRating: poolB_minRating, minReviews: poolB_minReviews, requirePokemonLike: true },
    poolC: { minRating: poolC_minRating, maxRating: poolC_maxRating, minReviews: poolC_minReviews, requirePokemonLike: true },
  };

  // 动态计算每个特色标签的实际数量（根据当前筛选条件）
  // 这样标签显示的数量会和各池子实际筛选结果一致
  let dynamicFeatureTagOptions = calculateFeatureTagCounts(
    allGames,
    poolConfig,
    pools.length > 0 ? pools : ["A", "B", "C"],
    yearsFilter,
    minReleaseDate,
    maxReleaseDate,
    excludeTestVersions,
    reviewSource
  );

  // 根据 tagSortBy 排序特色标签列表
  if (tagSortBy === "innovation") {
    // 按创新指数降序排序
    dynamicFeatureTagOptions = dynamicFeatureTagOptions.sort((a, b) =>
      (b.innovationScore ?? 0) - (a.innovationScore ?? 0)
    );
  } else {
    // 默认按数量降序排序
    dynamicFeatureTagOptions = dynamicFeatureTagOptions.sort((a, b) => b.count - a.count);
  }

  // 构建基础缓存键（不含分页参数）
  const baseCacheKey = getBaseCacheKey({
    pools, query, sortBy, sortOrder, tagSortBy,
    yearsFilter, minReleaseDate, maxReleaseDate,
    excludeTestVersions, priceMin, priceMax, modernTagFilter,
    featureTagFilters, poolA_minRating, poolA_minReviews,
    poolA_minYear, poolB_minRating, poolB_minReviews,
    poolC_minRating, poolC_maxRating, poolC_minReviews, reviewSource,
  });

  // 尝试从查询缓存获取（所有页面都尝试，命中则直接切片）
  const cached = getFromQueryCache(baseCacheKey);
  if (cached) {
    // 缓存命中：从完整结果中切片返回
    // 先合并 LLM 分析结果（如果缓存中没有的话）
    const allGameIds = cached.allFiltered.map((g: { id: string }) => g.id);
    const llmAnalysisResults = getAnalysisResults(allGameIds);
    const resultsWithLlm = cached.allFiltered.map((game: { id: string }) => {
      const llmResult = llmAnalysisResults[game.id];
      if (llmResult && !game.llmAnalysis) {
        return {
          ...game,
          llmAnalysis: {
            isPokemonLike: llmResult.isPokemonLike,
            confidence: llmResult.confidence,
            confidenceLevel: llmResult.confidenceLevel,
            matchingFeatures: llmResult.matchingFeatures,
            missingFeatures: llmResult.missingFeatures,
            reasons: llmResult.reasons,
          },
        };
      }
      return game;
    });

    const startIdx = (page - 1) * pageSize;
    const slicedResults = resultsWithLlm.slice(startIdx, startIdx + pageSize);
    console.log(`[Mode2] 命中查询缓存，完整结果 ${cached.total} 条，切片返回第 ${page} 页`);
    return NextResponse.json({
      results: slicedResults,
      total: cached.total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(cached.total / pageSize)),
      stats: cached.stats,
      priceStats: cached.priceStats,
      poolConfig,
      query,
      poolFilters: pools.length > 0 ? pools : ["A", "B", "C"],
      reviewSource,
      description: {
        A: `神作参考池 - 2024年后上线 · 好评率≥${POOL_DEFAULTS.A.minRating}% · 评论数≥${POOL_DEFAULTS.A.minReviews}`,
        B: `核心竞品池 - 宝可梦Like · 好评率≥${POOL_DEFAULTS.B.minRating}% · 评论数≥${POOL_DEFAULTS.B.minReviews}`,
        C: `避坑指南池 - 宝可梦Like争议/失败案例 · 好评率${POOL_DEFAULTS.C.minRating}%-${POOL_DEFAULTS.C.maxRating}% · 评论数≥${POOL_DEFAULTS.C.minReviews}`,
      },
      featureTagOptions: dynamicFeatureTagOptions,
      cached: true,
      // 返回完整结果集（用于前端缓存）
      ...(fullResults ? {
        fullResults: resultsWithLlm,
        allStats: cached.stats,
        allPriceStats: cached.priceStats,
      } : {}),
    });
  }

  // 只获取统计信息（不走完整过滤路径）
  if (statsOnly) {
    const stats = getPoolCounts(
      allGames, poolConfig, pools.length > 0 ? pools : undefined,
      yearsFilter, minReleaseDate, maxReleaseDate, excludeTestVersions,
      featureTagFilters, dynamicFeatureTagOptions, reviewSource
    );
    return NextResponse.json({
      stats,
      poolConfig,
      totalGames: allGames.length,
      excludeTestVersions,
    });
  }

  // 执行完整过滤（排序后的完整结果）
  const { results, total, stats, priceStats } = filterGames(allGames, {
    pools: pools.length > 0 ? pools : undefined,
    poolConfig,
    query,
    sortBy,
    sortOrder,
    page: 1,  // 始终获取完整结果用于缓存
    pageSize: 10000,  // 获取足够多的结果用于缓存
    yearsFilter,
    minReleaseDate,
    maxReleaseDate,
    excludeTestVersions,
    priceMin,
    priceMax,
    modernTagFilter,
    featureTagFilters,
    featureTagOptions: dynamicFeatureTagOptions,
    reviewSource,
  });

  // 两阶段判定：合并 LLM 语义分析结果
  // 从分析缓存中获取所有游戏的 LLM 分析结果
  const allGameIds = results.map((g) => g.id);
  const llmAnalysisResults = getAnalysisResults(allGameIds);

  // 合并 LLM 分析结果到游戏记录
  const resultsWithLlmAnalysis = results.map((game) => {
    const llmResult = llmAnalysisResults[game.id];
    if (llmResult) {
      return {
        ...game,
        llmAnalysis: {
          isPokemonLike: llmResult.isPokemonLike,
          confidence: llmResult.confidence,
          confidenceLevel: llmResult.confidenceLevel,
          matchingFeatures: llmResult.matchingFeatures,
          missingFeatures: llmResult.missingFeatures,
          reasons: llmResult.reasons,
        },
      };
    }
    return game;
  });

  // 缓存完整过滤结果（用于后续分页切片）
  setQueryCache(baseCacheKey, { allFiltered: resultsWithLlmAnalysis, total, stats, priceStats, timestamp: Date.now() });

  // 返回当前页的切片
  const startIdx = (page - 1) * pageSize;
  const slicedResults = resultsWithLlmAnalysis.slice(startIdx, startIdx + pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    results: slicedResults,
    total,
    page,
    pageSize,
    totalPages,
    stats,
    priceStats,
    poolConfig,
    query,
    poolFilters: pools.length > 0 ? pools : ["A", "B", "C"],
    reviewSource,
    description: {
      A: `神作参考池 - 2024年后上线 · 好评率≥${POOL_DEFAULTS.A.minRating}% · 评论数≥${POOL_DEFAULTS.A.minReviews}`,
      B: `核心竞品池 - 宝可梦Like · 好评率≥${POOL_DEFAULTS.B.minRating}% · 评论数≥${POOL_DEFAULTS.B.minReviews}`,
      C: `避坑指南池 - 宝可梦Like争议/失败案例 · 好评率${POOL_DEFAULTS.C.minRating}%-${POOL_DEFAULTS.C.maxRating}% · 评论数≥${POOL_DEFAULTS.C.minReviews}`,
    },
    featureTagOptions: dynamicFeatureTagOptions,
    // 返回完整结果集（用于前端缓存）
    ...(fullResults ? {
      fullResults: resultsWithLlmAnalysis,
      allStats: stats,
      allPriceStats: priceStats,
    } : {}),
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
