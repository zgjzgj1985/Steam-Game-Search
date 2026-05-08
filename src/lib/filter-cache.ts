/**
 * 模式2前端筛选缓存管理器
 * ============================
 * 管理池子级别的基础筛选结果缓存
 * 用于在用户改变排序、翻页、标签筛选等条件时进行客户端快速筛选
 *
 * 核心思想：
 * - 池子条件（好评率下限、评论数下限等）变化时，必须重新请求后端
 * - 排序、翻页、价格、标签筛选变化时，使用缓存数据进行客户端筛选
 */

// ============ 类型定义 ============

// 游戏记录类型（与 page.tsx 保持一致）
export interface GameRecord {
  id: string;
  name: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  categories: string[];
  releaseDate: string | null;
  price: number;
  steamReviews: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
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
  cnWilsonScore: number;
  overseasWilsonScore: number;
  headerImage: string | null;
  steamUrl: string;
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  wilsonScore: number;
  pool: "A" | "B" | "C" | null;
  isTestVersion: boolean;
  testVersionType: "name" | "tag" | "data" | "none";
  coreTagCount: number;
  secondaryTagCount: number;
  modernTagCount: number;
  tagWeight: number;
  matchedCoreTags: string[];
  matchedSecondaryTags: string[];
  matchedModernTags: string[];
  uniqueFeatureTags: string[];
  differentiationLabels: string[];
  activeFeatureTagFilter?: string;
  activeFeatureTagLabel?: string;
  displayModernTags: string[];
  llmMechanics: string[];
  llmMechanicsSummary: string;
  llmRawMechanics: string[];
  innovationTags: string[];
  llmAnalysis?: {
    isPokemonLike: boolean;
    confidence: number;
    confidenceLevel: "high" | "medium" | "low";
    matchingFeatures: string[];
    missingFeatures: string[];
    reasons: string;
  };
}

export interface PoolStats {
  total: number;
  totalTurnBased: number;
  poolA: number;
  poolB: number;
  poolC: number;
}

export interface PriceStats {
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

export interface FeatureTagOption {
  key: string;
  label: string;
  tag: string;
  count: number;
  gameCount: number;
  coverage: number;
  avgWilson: number;
  poolDistribution?: {
    A: number;
    B: number;
    C: number;
  };
  positiveRate?: number;
  totalPositive?: number;
  totalNegative?: number;
  innovationScore?: number;
}

export interface PoolConfig {
  poolA: { minRating: number; minReviews: number };
  poolB: { minRating: number; minReviews: number };
  poolC: { minRating: number; maxRating: number; minReviews: number };
}

export interface CachedPoolData {
  // 缓存键（基于池子条件和日期范围）
  cacheKey: string;
  // 缓存的完整结果集（未分页）
  games: GameRecord[];
  // 池子统计
  stats: PoolStats;
  // 价格统计
  priceStats: PriceStats;
  // 特色标签选项
  featureTagOptions: FeatureTagOption[];
  // 池子配置
  poolConfig: PoolConfig;
  // 缓存创建时间
  createdAt: number;
  // 最后访问时间
  lastAccessedAt: number;
  // 基础筛选条件快照（用于验证缓存有效性）
  baseConditions: BaseConditions;
}

export interface BaseConditions {
  pools: string[];
  poolA: { minRating: number; minReviews: number };
  poolB: { minRating: number; minReviews: number };
  poolC: { minRating: number; maxRating: number; minReviews: number };
  yearsFilter: number;
  excludeTestVersions: boolean;
  reviewSource: "all" | "cn" | "overseas";
}

export interface ClientFilterOptions {
  sortBy: "wilson" | "rating" | "reviews" | "date";
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
  query?: string;
  priceMin?: number;
  priceMax?: number;
  modernTagFilter?: "hasCore" | "hasModern";
  featureTagFilters?: string[];
  minReleaseDate?: string;
  maxReleaseDate?: string;
  reviewSource: "all" | "cn" | "overseas";
}

export interface FilterResult {
  results: GameRecord[];
  total: number;
  totalPages: number;
  stats: PoolStats;
  priceStats: PriceStats | undefined;
  featureTagOptions: FeatureTagOption[];
  fromCache: boolean;
}

// ============ 配置 ============

// 缓存过期时间（毫秒）：5分钟
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// 最大缓存条目数
const MAX_CACHE_ENTRIES = 10;

// ============ 工具函数 ============

/**
 * 生成缓存键
 * 缓存键基于：池子选择 + 各池子条件 + 日期范围 + 测试版过滤 + 评价来源
 * 这些条件变化时需要重新请求后端
 */
export function generateCacheKey(
  pools: string[],
  poolA: { minRating: number; minReviews: number },
  poolB: { minRating: number; minReviews: number },
  poolC: { minRating: number; maxRating: number; minReviews: number },
  yearsFilter: number,
  excludeTestVersions: boolean,
  reviewSource: "all" | "cn" | "overseas"
): string {
  const keyData = {
    pools: [...pools].sort().join(","),
    poolA: `${poolA.minRating}:${poolA.minReviews}`,
    poolB: `${poolB.minRating}:${poolB.minReviews}`,
    poolC: `${poolC.minRating}:${poolC.maxRating}:${poolC.minReviews}`,
    yearsFilter,
    excludeTestVersions,
    reviewSource,
  };
  return btoa(JSON.stringify(keyData));
}

/**
 * 生成基础条件对象（用于缓存验证）
 */
export function createBaseConditions(
  pools: string[],
  poolA: { minRating: number; minReviews: number },
  poolB: { minRating: number; minReviews: number },
  poolC: { minRating: number; maxRating: number; minReviews: number },
  yearsFilter: number,
  excludeTestVersions: boolean,
  reviewSource: "all" | "cn" | "overseas"
): BaseConditions {
  return {
    pools: [...pools].sort(),
    poolA: { ...poolA },
    poolB: { ...poolB },
    poolC: { ...poolC },
    yearsFilter,
    excludeTestVersions,
    reviewSource,
  };
}

/**
 * 比较两个基础条件是否完全相同
 */
function conditionsEqual(a: BaseConditions, b: BaseConditions): boolean {
  return (
    JSON.stringify(a.pools.sort()) === JSON.stringify(b.pools.sort()) &&
    a.poolA.minRating === b.poolA.minRating &&
    a.poolA.minReviews === b.poolA.minReviews &&
    a.poolB.minRating === b.poolB.minRating &&
    a.poolB.minReviews === b.poolB.minReviews &&
    a.poolC.minRating === b.poolC.minRating &&
    a.poolC.maxRating === b.poolC.maxRating &&
    a.poolC.minReviews === b.poolC.minReviews &&
    a.yearsFilter === b.yearsFilter &&
    a.excludeTestVersions === b.excludeTestVersions &&
    a.reviewSource === b.reviewSource
  );
}

// ============ 缓存存储 ============

// 使用 Map 存储缓存，天然支持 LRU
const cacheStore = new Map<string, CachedPoolData>();

// SessionStorage 键名
const SESSION_KEY = "mode2_filter_cache_data";
const SESSION_INDEX_KEY = "mode2_filter_cache_index";

// 最大 sessionStorage 大小（约4MB，留一些余量）
const MAX_SESSION_SIZE = 3 * 1024 * 1024;

/**
 * 保存缓存到 sessionStorage
 */
function saveToSessionStorage(cached: CachedPoolData): void {
  if (typeof window === "undefined") return;

  try {
    const data = JSON.stringify(cached);
    if (data.length > MAX_SESSION_SIZE) {
      console.log("[FilterCache] 数据过大，跳过 sessionStorage 存储");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, data);

    // 保存索引信息
    const index = {
      cacheKey: cached.cacheKey,
      createdAt: cached.createdAt,
      baseConditions: cached.baseConditions,
      gameCount: cached.games.length,
    };
    sessionStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn("[FilterCache] sessionStorage 存储失败:", e);
  }
}

/**
 * 从 sessionStorage 恢复缓存
 */
export function restoreFromSessionStorage(): CachedPoolData | null {
  if (typeof window === "undefined") return null;

  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const cached = JSON.parse(data) as CachedPoolData;

    // 检查是否过期
    if (Date.now() - cached.createdAt > CACHE_EXPIRY_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_INDEX_KEY);
      return null;
    }

    console.log(`[FilterCache] 从 sessionStorage 恢复缓存，共 ${cached.games.length} 条数据`);
    return cached;
  } catch (e) {
    console.warn("[FilterCache] sessionStorage 恢复失败:", e);
    return null;
  }
}

/**
 * 获取 sessionStorage 中保存的缓存索引
 */
export function getSessionCacheIndex(): { cacheKey: string; createdAt: number; gameCount: number } | null {
  if (typeof window === "undefined") return null;

  try {
    const data = sessionStorage.getItem(SESSION_INDEX_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 清除 sessionStorage 中的缓存
 */
export function clearSessionCache(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_INDEX_KEY);
}

/**
 * 获取缓存
 */
export function getCache(key: string): CachedPoolData | null {
  const cached = cacheStore.get(key);
  if (!cached) {
    // 尝试从 sessionStorage 恢复
    const sessionCached = restoreFromSessionStorage();
    if (sessionCached && sessionCached.cacheKey === key) {
      cacheStore.set(key, sessionCached);
      return sessionCached;
    }
    return null;
  }

  // 检查是否过期
  if (Date.now() - cached.createdAt > CACHE_EXPIRY_MS) {
    cacheStore.delete(key);
    clearSessionCache();
    return null;
  }

  // 更新最后访问时间
  cached.lastAccessedAt = Date.now();
  return cached;
}

/**
 * 获取缓存（仅内存，不查询 sessionStorage）
 */
export function getCacheFromMemory(key: string): CachedPoolData | null {
  const cached = cacheStore.get(key);
  if (!cached) return null;

  // 检查是否过期
  if (Date.now() - cached.createdAt > CACHE_EXPIRY_MS) {
    cacheStore.delete(key);
    return null;
  }

  // 更新最后访问时间
  cached.lastAccessedAt = Date.now();
  return cached;
}

/**
 * 设置缓存
 */
export function setCache(
  key: string,
  games: GameRecord[],
  stats: PoolStats,
  priceStats: PriceStats,
  featureTagOptions: FeatureTagOption[],
  poolConfig: PoolConfig,
  baseConditions: BaseConditions
): void {
  // 如果缓存已满，执行 LRU 淘汰
  if (cacheStore.size >= MAX_CACHE_ENTRIES && !cacheStore.has(key)) {
    evictLRU();
  }

  const cachedData: CachedPoolData = {
    cacheKey: key,
    games,
    stats,
    priceStats,
    featureTagOptions,
    poolConfig,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    baseConditions,
  };

  cacheStore.set(key, cachedData);

  // 同时保存到 sessionStorage
  saveToSessionStorage(cachedData);
}

/**
 * LRU 淘汰：删除最久未访问的缓存
 */
function evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (const [key, value] of cacheStore) {
    if (value.lastAccessedAt < oldestTime) {
      oldestTime = value.lastAccessedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cacheStore.delete(oldestKey);
  }
}

/**
 * 清除所有缓存
 */
export function clearCache(): void {
  cacheStore.clear();
  clearSessionCache();
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { count: number; keys: string[]; oldestAge: number } {
  let oldestAge = 0;
  let oldestEntry: CachedPoolData | null = null;

  for (const cached of cacheStore.values()) {
    const age = Date.now() - cached.createdAt;
    if (age > oldestAge) {
      oldestAge = age;
      oldestEntry = cached;
    }
  }

  return {
    count: cacheStore.size,
    keys: Array.from(cacheStore.keys()),
    oldestAge: oldestEntry ? Date.now() - oldestEntry.createdAt : 0,
  };
}

// ============ 客户端筛选器 ============

/**
 * 客户端筛选函数
 * 用于在缓存命中的情况下，对缓存数据进行快速筛选
 */
export function clientSideFilter(
  cached: CachedPoolData,
  options: ClientFilterOptions
): FilterResult {
  const { games } = cached;
  let filtered = [...games];

  // 1. 文本搜索
  if (options.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    filtered = filtered.filter((g) => {
      return (
        g.name.toLowerCase().includes(q) ||
        g.shortDescription.toLowerCase().includes(q) ||
        g.tags.some((t) => t.toLowerCase().includes(q)) ||
        g.developers.some((d) => d.toLowerCase().includes(q))
      );
    });
  }

  // 2. 价格筛选
  if (options.priceMin !== undefined || options.priceMax !== undefined) {
    filtered = filtered.filter((g) => {
      if (options.priceMin !== undefined && g.price < options.priceMin) return false;
      if (options.priceMax !== undefined && g.price > options.priceMax) return false;
      return true;
    });
  }

  // 3. 日期筛选
  if (options.minReleaseDate || options.maxReleaseDate) {
    filtered = filtered.filter((g) => {
      if (!g.releaseDate) return false;
      const gameTime = new Date(g.releaseDate).getTime();
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
  }

  // 4. 现代标签筛选（核心标签 / 现代融合标签）
  if (options.modernTagFilter) {
    filtered = filtered.filter((g) => {
      if (options.modernTagFilter === "hasCore" && g.coreTagCount === 0) {
        return false;
      }
      if (options.modernTagFilter === "hasModern" && g.modernTagCount === 0) {
        return false;
      }
      return true;
    });
  }

  // 5. 特色标签筛选（使用模糊匹配）
  if (options.featureTagFilters && options.featureTagFilters.length > 0) {
    filtered = filtered.filter((g) => {
      for (const filterKey of options.featureTagFilters!) {
        // 尝试用 key 匹配，如果找不到就用 label 或 tag 匹配
        let featureTag = cached.featureTagOptions.find(
          (f) => f.key === filterKey || f.label === filterKey || f.tag === filterKey
        );
        if (featureTag) {
          const llmM = (g.llmMechanics || []) as string[];
          const llmRawM = (g.llmRawMechanics || []) as string[];
          const tagLower = featureTag.tag.toLowerCase();
          const llmMLower = llmM.map((m: string) => m.toLowerCase());
          const llmRawMLower = llmRawM.map((m: string) => m.toLowerCase());
          // 模糊匹配：检查标签是否是任意 mechanics 的子串
          const hasTag = llmMLower.some((mech) => mech.includes(tagLower) || mech === tagLower) ||
            llmRawMLower.some((mech) => mech.includes(tagLower) || mech === tagLower);
          if (!hasTag) return false;
        }
      }
      return true;
    });
  }

  // 6. 重新计算池子统计（因为筛选可能改变池子分布）
  const stats: PoolStats = {
    total: filtered.length,
    totalTurnBased: filtered.length,
    poolA: 0,
    poolB: 0,
    poolC: 0,
  };
  for (const g of filtered) {
    if (g.pool === "A") stats.poolA++;
    else if (g.pool === "B") stats.poolB++;
    else if (g.pool === "C") stats.poolC++;
  }

  // 7. 计算价格统计
  const priceStats = calculatePriceStatsClient(filtered);

  // 8. 排序
  filtered.sort((a, b) => {
    let cmp = 0;
    const reviewSource = options.reviewSource;

    switch (options.sortBy) {
      case "wilson": {
        const aWilson = reviewSource === "cn" ? a.cnWilsonScore : reviewSource === "overseas" ? a.overseasWilsonScore : a.wilsonScore;
        const bWilson = reviewSource === "cn" ? b.cnWilsonScore : reviewSource === "overseas" ? b.overseasWilsonScore : b.wilsonScore;
        cmp = bWilson - aWilson;
        break;
      }
      case "rating": {
        const aReviews = reviewSource === "cn" ? a.cnReviews : reviewSource === "overseas" ? a.overseasReviews : a.steamReviews;
        const bReviews = reviewSource === "cn" ? b.cnReviews : reviewSource === "overseas" ? b.overseasReviews : b.steamReviews;
        cmp = (bReviews?.reviewScore ?? 0) - (aReviews?.reviewScore ?? 0);
        break;
      }
      case "reviews": {
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

  // 9. 分页
  const total = filtered.length;
  const totalPages = Math.ceil(total / options.pageSize);
  const offset = (options.page - 1) * options.pageSize;
  const results = filtered.slice(offset, offset + options.pageSize);

  return {
    results,
    total,
    totalPages,
    stats,
    priceStats,
    featureTagOptions: cached.featureTagOptions,
    fromCache: true,
  };
}

/**
 * 客户端价格统计计算
 */
function calculatePriceStatsClient(games: GameRecord[]): PriceStats {
  if (games.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      total: 0,
      distribution: { free: 0, under10: 0, under20: 0, under30: 0, under50: 0, over50: 0 },
    };
  }

  const prices = games.map((g) => g.price).sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);

  const distribution = {
    free: games.filter((g) => g.price === 0).length,
    under10: games.filter((g) => g.price > 0 && g.price < 10).length,
    under20: games.filter((g) => g.price >= 10 && g.price < 20).length,
    under30: games.filter((g) => g.price >= 20 && g.price < 30).length,
    under50: games.filter((g) => g.price >= 30 && g.price < 50).length,
    over50: games.filter((g) => g.price >= 50).length,
  };

  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    min: prices[0],
    max: prices[prices.length - 1],
    avg: Math.round((sum / prices.length) * 100) / 100,
    median,
    total: games.length,
    distribution,
  };
}

// ============ React Hook ============

/**
 * 检查筛选条件是否与缓存的基础条件匹配
 */
export function matchesBaseConditions(
  current: BaseConditions,
  cached: BaseConditions
): boolean {
  return conditionsEqual(current, cached);
}

/**
 * 检查是否可以使用缓存进行筛选
 * 只有池子基础条件匹配时才能使用缓存
 */
export function canUseCache(
  currentBaseConditions: BaseConditions,
  cachedData: CachedPoolData | null
): boolean {
  if (!cachedData) return false;
  return matchesBaseConditions(currentBaseConditions, cachedData.baseConditions);
}
