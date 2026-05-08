/**
 * 模式2: 宝可梦Like批量LLM语义分析脚本
 * ==========================================
 * 对中、低置信度游戏进行LLM语义分析，完成两阶段判定的第二阶段
 *
 * 使用方法：
 *   npx tsx scripts/batch-analyze-mode2.ts [--limit 10] [--dry-run]
 *
 * 参数：
 *   --limit N     只分析前N个游戏（用于测试）
 *   --dry-run     只显示要分析的游戏列表，不实际调用API
 *   --pool A|B|C  只分析指定池子的游戏
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============ 配置 ============

const FILTER_API = "http://localhost:3000/api/mode2/filter";
const ANALYZE_API = "http://localhost:3000/api/mode2/analyze";

// 一次请求分析的游戏数量（避免请求过大）
const BATCH_SIZE = 5;

// API调用间隔（毫秒）
const API_DELAY = 1000;

// 高置信度阈值：confidence = "high" 时跳过分析
const SKIP_CONFIDENCE_LEVELS = ["high"];

// ============ 类型定义 ============

interface GameRecord {
  id: string;
  name: string;
  tags: string[];
  genres: string[];
  shortDescription: string;
  detailed_description?: string;
  isPokemonLike: boolean;
  pokemonLikeTags: string[];
  pokemonLikeConfidence?: string;
}

interface FilterResponse {
  results: GameRecord[];
  total: number;
  stats: {
    poolA: number;
    poolB: number;
    poolC: number;
  };
}

interface AnalyzeRequest {
  gameId: string;
  name: string;
  tags: string[];
  genres: string[];
  shortDescription?: string;
  detailedDescription?: string;
  keywordMatchedTags?: string[];
  keywordConfidence?: "high" | "medium" | "low";
}

interface AnalyzeResult {
  gameId: string;
  isPokemonLike: boolean;
  confidence: number;
  confidenceLevel: "high" | "medium" | "low";
  matchingFeatures: string[];
  missingFeatures: string[];
  reasons: string;
}

// ============ 主逻辑 ============

async function fetchGames(pool?: "A" | "B" | "C"): Promise<GameRecord[]> {
  console.log(`\n[1/4] 正在获取${pool ? pool + "池" : "所有"}游戏列表...`);

  const params = new URLSearchParams();
  params.set("pool", pool || "B");  // 默认分析B池
  params.set("pageSize", "500");
  params.set("page", "1");

  const response = await fetch(`${FILTER_API}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`获取游戏列表失败: ${response.status} ${response.statusText}`);
  }

  const data: FilterResponse = await response.json();
  console.log(`    获取到 ${data.results.length} 个游戏`);
  console.log(`    池子统计: A=${data.stats.poolA}, B=${data.stats.poolB}, C=${data.stats.poolC}`);

  return data.results;
}

function filterGamesForAnalysis(games: GameRecord[]): {
  toAnalyze: GameRecord[];
  skipHighConfidence: GameRecord[];
} {
  console.log(`\n[2/4] 筛选需要分析的游戏...`);

  const toAnalyze: GameRecord[] = [];
  const skipHighConfidence: GameRecord[] = [];

  for (const game of games) {
    // 只分析 isPokemonLike = true 的游戏
    if (!game.isPokemonLike) {
      continue;
    }

    // 跳过高置信度游戏
    if (game.pokemonLikeConfidence && SKIP_CONFIDENCE_LEVELS.includes(game.pokemonLikeConfidence)) {
      skipHighConfidence.push(game);
      continue;
    }

    // 其他都需要分析
    toAnalyze.push(game);
  }

  console.log(`    跳过高置信度: ${skipHighConfidence.length} 个`);
  console.log(`    需要LLM分析: ${toAnalyze.length} 个`);

  return { toAnalyze, skipHighConfidence };
}

async function analyzeGames(games: GameRecord[], limit?: number): Promise<{
  analyzed: AnalyzeResult[];
  failed: string[];
}> {
  const targetGames = limit ? games.slice(0, limit) : games;
  const total = targetGames.length;

  console.log(`\n[3/4] 开始LLM语义分析 (共 ${total} 个)...`);
  console.log("    API地址:", ANALYZE_API);
  console.log("    API间隔:", `${API_DELAY}ms`);
  console.log("    批次大小:", BATCH_SIZE);

  const analyzed: AnalyzeResult[] = [];
  const failed: string[] = [];

  for (let i = 0; i < targetGames.length; i += BATCH_SIZE) {
    const batch = targetGames.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    console.log(`\n    [批次 ${batchNum}/${totalBatches}] 分析 ${batch.length} 个游戏...`);
    console.log(`    ${targetGames[i].name}${batch.length > 1 ? ` 等` : ""}`);

    // 准备批量分析请求
    const requests: AnalyzeRequest[] = batch.map((game) => ({
      gameId: game.id,
      name: game.name,
      tags: game.tags,
      genres: game.genres,
      shortDescription: game.shortDescription,
      detailedDescription: game.detailed_description,
      keywordMatchedTags: game.pokemonLikeTags,
      keywordConfidence: (game.pokemonLikeConfidence || "low") as "high" | "medium" | "low",
    }));

    try {
      const response = await fetch(ANALYZE_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: requests }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`    [批次 ${batchNum}] API错误: ${response.status}`);
        console.error(`    错误详情: ${errorText.slice(0, 200)}`);

        // 标记这批游戏为失败
        for (const game of batch) {
          failed.push(game.name);
        }
        continue;
      }

      const data = await response.json();
      analyzed.push(...data.results);

      // 统计这批结果
      const batchStats = {
        high: data.results.filter((r: AnalyzeResult) => r.confidenceLevel === "high").length,
        medium: data.results.filter((r: AnalyzeResult) => r.confidenceLevel === "medium").length,
        low: data.results.filter((r: AnalyzeResult) => r.confidenceLevel === "low").length,
        notLike: data.results.filter((r: AnalyzeResult) => !r.isPokemonLike).length,
      };

      console.log(`    [批次 ${batchNum}] 完成:`);
      console.log(`        高置信度: ${batchStats.high}, 中置信度: ${batchStats.medium}, 低置信度: ${batchStats.low}`);
      console.log(`        LLM判定非宝可梦Like: ${batchStats.notLike}`);

      // 等待一段时间避免API限流
      if (i + BATCH_SIZE < targetGames.length) {
        await new Promise((resolve) => setTimeout(resolve, API_DELAY));
      }
    } catch (err) {
      console.error(`    [批次 ${batchNum}] 请求失败:`, err);
      for (const game of batch) {
        failed.push(game.name);
      }
    }
  }

  return { analyzed, failed };
}

function printSummary(analyzed: AnalyzeResult[], failed: string[], skipped: GameRecord[]) {
  console.log(`\n[4/4] 分析完成!`);
  console.log("=".repeat(60));

  // 统计结果分布
  const stats = {
    total: analyzed.length,
    high: analyzed.filter((r) => r.confidenceLevel === "high").length,
    medium: analyzed.filter((r) => r.confidenceLevel === "medium").length,
    low: analyzed.filter((r) => r.confidenceLevel === "low").length,
    notLike: analyzed.filter((r) => !r.isPokemonLike).length,
  };

  console.log(`\nLLM分析统计:`);
  console.log(`  总分析数: ${stats.total}`);
  console.log(`  高置信度: ${stats.high}`);
  console.log(`  中置信度: ${stats.medium}`);
  console.log(`  低置信度: ${stats.low}`);
  console.log(`  LLM判定非宝可梦Like: ${stats.notLike}`);
  console.log(`\n跳过高置信度游戏: ${skipped.length}`);
  console.log(`失败游戏数: ${failed.length}`);

  // 列出LLM判定为非宝可梦Like的游戏（这些需要关注）
  if (stats.notLike > 0) {
    console.log(`\nLLM判定为非宝可梦Like的游戏 (共${stats.notLike}个):`);
    const notLikeGames = analyzed.filter((r) => !r.isPokemonLike);
    for (const game of notLikeGames.slice(0, 20)) {
      console.log(`  - ${game.gameId}: ${game.reasons.slice(0, 80)}...`);
    }
    if (notLikeGames.length > 20) {
      console.log(`  ... 还有 ${notLikeGames.length - 20} 个`);
    }
  }

  // 列出失败的游戏
  if (failed.length > 0) {
    console.log(`\n分析失败的游戏 (共${failed.length}个):`);
    for (const name of failed.slice(0, 10)) {
      console.log(`  - ${name}`);
    }
    if (failed.length > 10) {
      console.log(`  ... 还有 ${failed.length - 10} 个`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

// ============ 入口 ============

async function main() {
  console.log("=".repeat(60));
  console.log("模式2 宝可梦Like 批量LLM语义分析");
  console.log("=".repeat(60));

  // 解析命令行参数
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;
  let pool: "A" | "B" | "C" | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--pool" && args[i + 1]) {
      const p = args[i + 1].toUpperCase();
      if (["A", "B", "C"].includes(p)) {
        pool = p as "A" | "B" | "C";
      }
      i++;
    }
  }

  if (dryRun) {
    console.log("\n[DRY RUN 模式] 只会显示待分析的游戏列表，不会实际调用API");
  }

  try {
    // 1. 获取游戏列表
    const games = await fetchGames(pool);

    // 2. 筛选需要分析的游戏
    const { toAnalyze, skipHighConfidence } = filterGamesForAnalysis(games);

    if (dryRun) {
      console.log("\n[DRY RUN] 待分析游戏列表:");
      for (const game of toAnalyze.slice(0, 20)) {
        console.log(`  - ${game.name} (${game.id})`);
        console.log(`    置信度: ${game.pokemonLikeConfidence || "unknown"}`);
        console.log(`    匹配标签: ${game.pokemonLikeTags.join(", ") || "无"}`);
        console.log(`    描述: ${game.shortDescription.slice(0, 100)}...`);
      }
      if (toAnalyze.length > 20) {
        console.log(`  ... 还有 ${toAnalyze.length - 20} 个`);
      }
      console.log(`\n总待分析: ${toAnalyze.length} 个`);
      return;
    }

    if (toAnalyze.length === 0) {
      console.log("\n没有需要分析的游戏（所有游戏都是高置信度）");
      return;
    }

    // 3. 执行LLM分析
    const { analyzed, failed } = await analyzeGames(toAnalyze, limit);

    // 4. 输出摘要
    printSummary(analyzed, failed, skipHighConfidence);

    // 5. 保存结果到文件
    const resultsPath = path.join(process.cwd(), "public", "data", "mode2-analysis-results.json");
    const resultsData = {
      analyzedAt: new Date().toISOString(),
      totalAnalyzed: analyzed.length,
      totalFailed: failed.length,
      skippedHighConfidence: skipHighConfidence.length,
      results: analyzed,
      failedGames: failed,
    };

    fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2), "utf-8");
    console.log(`\n结果已保存到: ${resultsPath}`);

  } catch (err) {
    console.error("\n执行出错:", err);
    process.exit(1);
  }
}

main();
