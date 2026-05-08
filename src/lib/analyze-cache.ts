/**
 * 模式2: LLM分析结果持久化缓存管理
 * =====================================
 * 管理宝可梦Like语义分析结果的持久化存储
 *
 * 使用 JSON 文件存储，支持批量读写
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============ 类型定义 ============

export interface AnalyzeResult {
  gameId: string;
  isPokemonLike: boolean;
  confidence: number;
  confidenceLevel: "high" | "medium" | "low";
  matchingFeatures: string[];
  missingFeatures: string[];
  reasons: string;
  llmAnalysis?: {
    coreLoop: boolean;
    collectionSystem: boolean;
    raisingSystem: boolean;
    battleSystem: boolean;
    evolutionSystem: boolean;
  };
}

export interface AnalyzeCacheData {
  version: number;
  createdAt: string;
  updatedAt: string;
  results: Record<string, AnalyzeResult & { timestamp: number }>;
}

// ============ 配置 ============

const CACHE_FILE = path.join(process.cwd(), "public", "data", "mode2-analysis-cache.json");

// 缓存版本号（结构变更时递增）
const CACHE_VERSION = 1;

// ============ 内存缓存层 ============

// 内存缓存
let memoryCache: AnalyzeCacheData | null = null;
let memoryCacheLoadedAt: number = 0;

// 延迟写入配置
const DEBOUNCE_WRITE_DELAY_MS = 2000; // 2秒延迟写入
const BATCH_WRITE_THRESHOLD = 100; // 积累100条后写入
let pendingWrites: AnalyzeResult[] = [];
let writeTimeout: NodeJS.Timeout | null = null;
let writePendingCount = 0; // 待写入计数

// 缓存有效期（毫秒）：10分钟
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;

// ============ 工具函数 ============

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 加载缓存数据（优先使用内存缓存）
 */
function loadCacheData(): AnalyzeCacheData {
  // 检查内存缓存是否有效
  const now = Date.now();
  if (memoryCache && now - memoryCacheLoadedAt < MEMORY_CACHE_TTL_MS) {
    return memoryCache;
  }

  ensureDir(path.dirname(CACHE_FILE));

  if (!fs.existsSync(CACHE_FILE)) {
    const newCache = {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      results: {},
    };
    // 更新内存缓存
    memoryCache = newCache;
    memoryCacheLoadedAt = now;
    return newCache;
  }

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const data = JSON.parse(raw) as AnalyzeCacheData;

    // 版本检查
    if (data.version !== CACHE_VERSION) {
      console.warn("[AnalyzeCache] 缓存版本不匹配，清空旧缓存");
      const newCache = {
        version: CACHE_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        results: {},
      };
      // 更新内存缓存
      memoryCache = newCache;
      memoryCacheLoadedAt = now;
      return newCache;
    }

    // 更新内存缓存
    memoryCache = data;
    memoryCacheLoadedAt = now;
    return data;
  } catch (err) {
    console.error("[AnalyzeCache] 加载缓存失败:", err);
    const newCache = {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      results: {},
    };
    // 更新内存缓存
    memoryCache = newCache;
    memoryCacheLoadedAt = now;
    return newCache;
  }
}

/**
 * 延迟写入缓存数据到磁盘
 */
function debouncedSaveCacheData(): void {
  if (writeTimeout) {
    clearTimeout(writeTimeout);
  }

  writeTimeout = setTimeout(() => {
    flushPendingWrites();
  }, DEBOUNCE_WRITE_DELAY_MS);
}

/**
 * 立即刷新待写入的数据到磁盘
 */
function flushPendingWrites(): void {
  if (pendingWrites.length === 0) return;

  const cache = loadCacheDataFromDisk();
  const now = Date.now();

  for (const result of pendingWrites) {
    cache.results[result.gameId] = {
      ...result,
      timestamp: now,
    };
  }

  try {
    ensureDir(path.dirname(CACHE_FILE));
    cache.updatedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    // 更新内存缓存
    memoryCache = cache;
    memoryCacheLoadedAt = now;
  } catch (err) {
    console.error("[AnalyzeCache] 保存缓存失败:", err);
  }

  pendingWrites = [];
  writeTimeout = null;
}

/**
 * 直接从磁盘加载缓存（用于写入时读取最新状态）
 */
function loadCacheDataFromDisk(): AnalyzeCacheData {
  ensureDir(path.dirname(CACHE_FILE));

  if (!fs.existsSync(CACHE_FILE)) {
    return {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      results: {},
    };
  }

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as AnalyzeCacheData;
  } catch {
    return {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      results: {},
    };
  }
}

/**
 * 同步保存缓存数据（立即写入）
 */
function saveCacheDataSync(data: AnalyzeCacheData): void {
  try {
    ensureDir(path.dirname(CACHE_FILE));
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
    // 更新内存缓存
    memoryCache = data;
    memoryCacheLoadedAt = Date.now();
  } catch (err) {
    console.error("[AnalyzeCache] 保存缓存失败:", err);
  }
}

// ============ 公开 API ============

/**
 * 获取单个游戏的分析结果（使用内存缓存）
 */
export function getAnalysisResult(gameId: string): AnalyzeResult | null {
  const cache = loadCacheData();
  const entry = cache.results[gameId];

  if (!entry) {
    return null;
  }

  return {
    gameId: entry.gameId,
    isPokemonLike: entry.isPokemonLike,
    confidence: entry.confidence,
    confidenceLevel: entry.confidenceLevel,
    matchingFeatures: entry.matchingFeatures,
    missingFeatures: entry.missingFeatures,
    reasons: entry.reasons,
    llmAnalysis: entry.llmAnalysis,
  };
}

/**
 * 批量获取分析结果（使用内存缓存）
 */
export function getAnalysisResults(gameIds: string[]): Record<string, AnalyzeResult | null> {
  const cache = loadCacheData();
  const results: Record<string, AnalyzeResult | null> = {};

  for (const gameId of gameIds) {
    const entry = cache.results[gameId];
    if (entry) {
      results[gameId] = {
        gameId: entry.gameId,
        isPokemonLike: entry.isPokemonLike,
        confidence: entry.confidence,
        confidenceLevel: entry.confidenceLevel,
        matchingFeatures: entry.matchingFeatures,
        missingFeatures: entry.missingFeatures,
        reasons: entry.reasons,
        llmAnalysis: entry.llmAnalysis,
      };
    } else {
      results[gameId] = null;
    }
  }

  return results;
}

/**
 * 保存单个分析结果（延迟写入）
 */
export function saveAnalysisResult(result: AnalyzeResult): void {
  pendingWrites.push(result);
  writePendingCount++;

  // 更新内存缓存
  if (memoryCache) {
    memoryCache.results[result.gameId] = {
      ...result,
      timestamp: Date.now(),
    };
  }

  // 如果积累了一定数量的写入，直接触发写入
  if (writePendingCount >= BATCH_WRITE_THRESHOLD) {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    flushPendingWrites();
    writePendingCount = 0;
  } else {
    debouncedSaveCacheData();
  }
}

/**
 * 批量保存分析结果（延迟写入）
 */
export function saveAnalysisResults(results: AnalyzeResult[]): void {
  if (results.length === 0) return;

  pendingWrites.push(...results);
  writePendingCount += results.length;

  // 更新内存缓存
  if (memoryCache) {
    const now = Date.now();
    for (const result of results) {
      memoryCache.results[result.gameId] = {
        ...result,
        timestamp: now,
      };
    }
  }

  // 如果积累了一定数量的写入，直接触发写入
  if (writePendingCount >= BATCH_WRITE_THRESHOLD) {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    flushPendingWrites();
    writePendingCount = 0;
  } else {
    debouncedSaveCacheData();
  }
}

/**
 * 删除单个分析结果
 */
export function deleteAnalysisResult(gameId: string): void {
  const cache = loadCacheDataFromDisk();
  if (cache.results[gameId]) {
    delete cache.results[gameId];
    saveCacheDataSync(cache);
  }
}

/**
 * 清空所有分析结果
 */
export function clearAnalysisCache(): void {
  // 清除待写入队列
  pendingWrites = [];
  if (writeTimeout) {
    clearTimeout(writeTimeout);
    writeTimeout = null;
  }
  writePendingCount = 0;

  const now = new Date().toISOString();
  const emptyCache: AnalyzeCacheData = {
    version: CACHE_VERSION,
    createdAt: now,
    updatedAt: now,
    results: {},
  };
  saveCacheDataSync(emptyCache);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { total: number; version: number; createdAt: string; updatedAt: string; memoryCached: boolean; pendingWrites: number } {
  const cache = loadCacheData();
  return {
    total: Object.keys(cache.results).length,
    version: cache.version,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
    memoryCached: memoryCache !== null,
    pendingWrites: pendingWrites.length,
  };
}

/**
 * 检查哪些游戏需要分析（未缓存的）
 */
export function getUnanalyzedGameIds(allGameIds: string[]): string[] {
  const cache = loadCacheData();
  return allGameIds.filter((id) => !cache.results[id]);
}

/**
 * 预热内存缓存（启动时调用）
 */
export function warmupCache(): void {
  console.log("[AnalyzeCache] 预热缓存中...");
  loadCacheData();
  console.log(`[AnalyzeCache] 缓存预热完成，当前 ${Object.keys(memoryCache?.results || {}).length} 条记录`);
}

/**
 * 强制刷新缓存到磁盘（用于关闭前调用）
 */
export function flushCache(): void {
  console.log("[AnalyzeCache] 强制刷新缓存到磁盘...");
  flushPendingWrites();
  console.log("[AnalyzeCache] 缓存刷新完成");
}
