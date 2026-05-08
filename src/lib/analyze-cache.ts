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

// ============ 工具函数 ============

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadCacheData(): AnalyzeCacheData {
  ensureDir(path.dirname(CACHE_FILE));

  if (!fs.existsSync(CACHE_FILE)) {
    const now = new Date().toISOString();
    return {
      version: CACHE_VERSION,
      createdAt: now,
      updatedAt: now,
      results: {},
    };
  }

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const data = JSON.parse(raw) as AnalyzeCacheData;

    // 版本检查
    if (data.version !== CACHE_VERSION) {
      console.warn("[AnalyzeCache] 缓存版本不匹配，清空旧缓存");
      const now = new Date().toISOString();
      return {
        version: CACHE_VERSION,
        createdAt: now,
        updatedAt: now,
        results: {},
      };
    }

    return data;
  } catch (err) {
    console.error("[AnalyzeCache] 加载缓存失败:", err);
    const now = new Date().toISOString();
    return {
      version: CACHE_VERSION,
      createdAt: now,
      updatedAt: now,
      results: {},
    };
  }
}

function saveCacheData(data: AnalyzeCacheData): void {
  try {
    ensureDir(path.dirname(CACHE_FILE));
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[AnalyzeCache] 保存缓存失败:", err);
  }
}

// ============ 公开 API ============

/**
 * 获取单个游戏的分析结果
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
 * 批量获取分析结果
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
 * 保存单个分析结果
 */
export function saveAnalysisResult(result: AnalyzeResult): void {
  const cache = loadCacheData();
  cache.results[result.gameId] = {
    ...result,
    timestamp: Date.now(),
  };
  saveCacheData(cache);
}

/**
 * 批量保存分析结果
 */
export function saveAnalysisResults(results: AnalyzeResult[]): void {
  if (results.length === 0) return;

  const cache = loadCacheData();
  const now = Date.now();

  for (const result of results) {
    cache.results[result.gameId] = {
      ...result,
      timestamp: now,
    };
  }

  saveCacheData(cache);
}

/**
 * 删除单个分析结果
 */
export function deleteAnalysisResult(gameId: string): void {
  const cache = loadCacheData();
  if (cache.results[gameId]) {
    delete cache.results[gameId];
    saveCacheData(cache);
  }
}

/**
 * 清空所有分析结果
 */
export function clearAnalysisCache(): void {
  const now = new Date().toISOString();
  const emptyCache: AnalyzeCacheData = {
    version: CACHE_VERSION,
    createdAt: now,
    updatedAt: now,
    results: {},
  };
  saveCacheData(emptyCache);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { total: number; version: number; createdAt: string; updatedAt: string } {
  const cache = loadCacheData();
  return {
    total: Object.keys(cache.results).length,
    version: cache.version,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
  };
}

/**
 * 检查哪些游戏需要分析（未缓存的）
 */
export function getUnanalyzedGameIds(allGameIds: string[]): string[] {
  const cache = loadCacheData();
  return allGameIds.filter((id) => !cache.results[id]);
}
