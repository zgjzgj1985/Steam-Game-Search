/**
 * 模式2: 宝可梦Like语义分析API
 * ================================
 * 对候选游戏进行 LLM 语义分析，返回置信度评分和判定理由
 *
 * 判定维度：
 * 1. 核心玩法闭环：收集→养成→战斗→进化
 * 2. 回合制战斗系统
 * 3. 生物/怪物作为核心交互对象
 * 4. 与宝可梦的相似度
 */

import { NextRequest, NextResponse } from "next/server";
import { chat, type LLMMessage } from "@/lib/llm";
import {
  getAnalysisResult,
  saveAnalysisResult,
  saveAnalysisResults,
  type AnalyzeResult,
} from "@/lib/analyze-cache";

// ============ 类型定义 ============

export interface AnalyzeRequest {
  gameId: string;
  name: string;
  tags: string[];
  genres: string[];
  shortDescription?: string;
  detailedDescription?: string;
  // 关键词匹配结果（用于上下文）
  keywordMatchedTags?: string[];
  keywordConfidence?: "high" | "medium" | "low";
}

// ============ 宝可梦Like核心特征定义 ============

const POKEMON_LIKE_CORE_FEATURES = {
  collection: {
    name: "收集系统",
    description: "玩家可以收集、捕获野生或可捕捉的生物/怪物/宠物",
    examples: ["捕捉", "捕获", "收集", "抓捕", "收服", "捕获"],
  },
  raising: {
    name: "养成系统",
    description: "玩家可以培养、训练这些生物（升级、技能学习、性格等）",
    examples: ["养成", "培养", "训练", "升级", "培育"],
  },
  battle: {
    name: "回合战斗",
    description: "使用收集的生物进行回合制战斗",
    examples: ["回合制", "回合战斗", "战棋", "回合策略"],
  },
  evolution: {
    name: "进化系统",
    description: "生物可以通过某种机制变强或改变形态",
    examples: ["进化", "形态变化", "进化系统", "进阶"],
  },
};

// ============ LLM 分析提示词 ============

const SYSTEM_PROMPT = `你是一个专业的游戏品类分析师，专门判断游戏是否是"宝可梦Like"游戏。

【宝可梦Like游戏定义】
宝可梦Like游戏是指那些核心玩法与《宝可梦》系列相似的游戏，具有以下关键特征：

1. 【收集系统】玩家可以收集、捕获野生或可捕捉的生物/怪物/宠物
2. 【养成系统】玩家可以培养、训练这些生物（进化、等阶、技能、性格等）
3. 【回合战斗】使用收集的生物进行回合制战斗
4. 【闭环循环】形成"收集→养成→战斗→进化→再收集"的玩法闭环

【判定标准】
- 高置信度(80-100): 具备完整的"收集+养成+回合战斗"闭环，且生物是核心交互对象
- 中置信度(50-79): 具备其中2-3个核心特征，但可能不完整
- 低置信度(20-49): 只有1个核心特征，或特征不够明显
- 非宝可梦Like(0-19): 不具备上述特征，或生物只是辅助元素

【重要区分】
- "Monster Hunter"不是宝可梦Like（玩家不是收集/养成怪物，怪物是敌人）
- "Palworld"是宝可梦Like（可以收集、养成、战斗）
- "Stardew Valley"的农场动物不是宝可梦Like（没有回合战斗）
- 带有"Creature Collector"标签的游戏通常是宝可梦Like

请根据提供的数据进行判断，不要猜测你没有看到的信息。`;

function buildAnalysisPrompt(data: AnalyzeRequest): string {
  const features = Object.values(POKEMON_LIKE_CORE_FEATURES)
    .map((f) => `- ${f.name}: ${f.description}`)
    .join("\n");

  const contextInfo = data.keywordMatchedTags?.length
    ? `\n【关键词匹配信息（仅供参考）】\n已匹配的关键词/标签: ${data.keywordMatchedTags.join(", ")}\n关键词匹配置信度: ${data.keywordConfidence || "unknown"}`
    : "";

  return `请分析以下游戏是否为宝可梦Like游戏：

【游戏基本信息】
- 游戏名: ${data.name}
- 标签: ${data.tags.slice(0, 20).join(", ") || "无"}
- 类型: ${data.genres.join(", ") || "无"}
- 简短描述: ${data.shortDescription || "无"}
- 详细描述: ${(data.detailedDescription || "").slice(0, 1000)}${(data.detailedDescription || "").length > 1000 ? "..." : ""}

${contextInfo}

【需要判断的核心特征】
${features}

请输出JSON格式的分析结果：
{
  "isPokemonLike": true/false,
  "confidence": 0-100的数字,
  "confidenceLevel": "high"/"medium"/"low",
  "matchingFeatures": ["匹配到的特征列表"],
  "missingFeatures": ["缺失的特征列表"],
  "reasons": "详细的分析理由（100字以上）",
  "llmAnalysis": {
    "coreLoop": true/false,
    "collectionSystem": true/false,
    "raisingSystem": true/false,
    "battleSystem": true/false,
    "evolutionSystem": true/false
  }
}`;
}

// ============ 解析 LLM 返回结果 ============

function parseAnalysisResult(raw: string): Partial<AnalyzeResult> {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?$/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      isPokemonLike: Boolean(parsed.isPokemonLike),
      confidence: Number(parsed.confidence) || 0,
      confidenceLevel: parsed.confidenceLevel || "low",
      matchingFeatures: Array.isArray(parsed.matchingFeatures) ? parsed.matchingFeatures : [],
      missingFeatures: Array.isArray(parsed.missingFeatures) ? parsed.missingFeatures : [],
      reasons: String(parsed.reasons || ""),
      llmAnalysis: parsed.llmAnalysis || undefined,
    };
  } catch {
    throw new Error(`LLM 返回的不是有效 JSON:\n${cleaned.slice(0, 500)}`);
  }
}

// ============ 综合置信度计算 ============

function calculateFinalConfidence(
  keywordConfidence: "high" | "medium" | "low" | undefined,
  llmConfidence: number
): { confidence: number; level: "high" | "medium" | "low" } {
  // 关键词置信度权重
  const keywordWeight = keywordConfidence ? { high: 0.4, medium: 0.3, low: 0.2 }[keywordConfidence] : 0.2;

  // LLM置信度权重
  const llmWeight = 1 - keywordWeight;

  // 关键词置信度转数值
  const keywordScore = keywordConfidence ? { high: 90, medium: 70, low: 50 }[keywordConfidence] : 50;

  // 加权平均
  const finalScore = Math.round(keywordScore * keywordWeight + llmConfidence * llmWeight);

  // 确定等级
  let level: "high" | "medium" | "low";
  if (finalScore >= 75) {
    level = "high";
  } else if (finalScore >= 50) {
    level = "medium";
  } else {
    level = "low";
  }

  return { confidence: finalScore, level };
}

// ============ API 路由 ============

export async function POST(request: NextRequest) {
  try {
    const data: AnalyzeRequest = await request.json();

    if (!data.gameId || !data.name) {
      return NextResponse.json(
        { error: "缺少必要参数: gameId, name" },
        { status: 400 }
      );
    }

    // 检查持久化缓存
    const cached = getAnalysisResult(data.gameId);
    if (cached) {
      return NextResponse.json({
        result: cached,
        cached: true,
      });
    }

    // 构建提示词
    const messages: LLMMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildAnalysisPrompt(data) },
    ];

    // 调用 LLM
    const response = await chat(messages);

    // 解析结果
    const parsed = parseAnalysisResult(response.content);

    // 计算综合置信度
    const finalConfidence = calculateFinalConfidence(data.keywordConfidence, parsed.confidence || 0);

    const result: AnalyzeResult = {
      gameId: data.gameId,
      isPokemonLike: parsed.isPokemonLike ?? false,
      confidence: finalConfidence.confidence,
      confidenceLevel: finalConfidence.level,
      matchingFeatures: parsed.matchingFeatures || [],
      missingFeatures: parsed.missingFeatures || [],
      reasons: parsed.reasons || "",
      llmAnalysis: parsed.llmAnalysis,
    };

    // 持久化缓存结果
    saveAnalysisResult(result);

    return NextResponse.json({
      result,
      cached: false,
      usage: response.usage,
    });
  } catch (error) {
    console.error("[Mode2/Analyze] 分析失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析失败" },
      { status: 500 }
    );
  }
}

// 批量分析接口
export async function PUT(request: NextRequest) {
  try {
    const { games }: { games: AnalyzeRequest[] } = await request.json();

    if (!Array.isArray(games) || games.length === 0) {
      return NextResponse.json(
        { error: "缺少 games 参数或数组为空" },
        { status: 400 }
      );
    }

    const results: AnalyzeResult[] = [];
    const newResults: AnalyzeResult[] = [];

    for (const game of games) {
      // 检查持久化缓存
      const cached = getAnalysisResult(game.gameId);
      if (cached) {
        results.push(cached);
        continue;
      }

      try {
        const messages: LLMMessage[] = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildAnalysisPrompt(game) },
        ];

        const response = await chat(messages);
        const parsed = parseAnalysisResult(response.content);
        const finalConfidence = calculateFinalConfidence(game.keywordConfidence, parsed.confidence || 0);

        const result: AnalyzeResult = {
          gameId: game.gameId,
          isPokemonLike: parsed.isPokemonLike ?? false,
          confidence: finalConfidence.confidence,
          confidenceLevel: finalConfidence.level,
          matchingFeatures: parsed.matchingFeatures || [],
          missingFeatures: parsed.missingFeatures || [],
          reasons: parsed.reasons || "",
          llmAnalysis: parsed.llmAnalysis,
        };

        results.push(result);
        newResults.push(result);

        // 避免请求过快
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[Mode2/Analyze] 游戏 ${game.gameId} 分析失败:`, err);
        results.push({
          gameId: game.gameId,
          isPokemonLike: false,
          confidence: 0,
          confidenceLevel: "low",
          matchingFeatures: [],
          missingFeatures: [],
          reasons: `分析失败: ${err instanceof Error ? err.message : "未知错误"}`,
        });
      }
    }

    // 批量持久化新结果
    if (newResults.length > 0) {
      saveAnalysisResults(newResults);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[Mode2/Analyze] 批量分析失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量分析失败" },
      { status: 500 }
    );
  }
}
