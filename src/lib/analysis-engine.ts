import { Game, PokemonLikeAnalysis } from "@/types/game";
import { chatPokemonLikeAnalysis, parsePokemonLikeAnalysis } from "@/lib/llm";

/**
 * 生成宝可梦Like游戏专项分析
 */
export async function generateAnalysis(
  game: Game,
  pool?: "A" | "B" | "C" | null
): Promise<PokemonLikeAnalysis> {
  const gameInfo = buildGameInfo(game);

  const content = await chatPokemonLikeAnalysis(gameInfo, pool);
  const raw = parsePokemonLikeAnalysis(content);

  return parseAnalysis(raw, game, pool);
}

/**
 * 构建游戏信息字符串，供LLM分析使用
 */
function buildGameInfo(game: Game): string {
  const parts: string[] = [];

  parts.push(`游戏名称：${game.name}`);
  parts.push(`开发商：${game.developers.join(", ") || "未知"}`);
  parts.push(`发行商：${game.publishers.join(", ") || "未知"}`);

  if (game.releaseDate) {
    parts.push(`发售日期：${game.releaseDate}`);
  }

  parts.push(`类型标签：${game.genres.join(", ") || "未知"}`);
  parts.push(`游戏标签：${game.tags.join(", ") || "无"}`);

  if (game.steamReviews) {
    const { totalPositive, totalNegative, reviewScore, reviewScoreDescription } = game.steamReviews;
    const totalReviews = totalPositive + totalNegative;
    parts.push(
      `Steam评价：${reviewScore}% (${reviewScoreDescription})，${totalPositive.toLocaleString()}好评 / ${totalNegative.toLocaleString()}差评，总计${totalReviews.toLocaleString()}条评价`
    );
  }

  if (game.price === 0) {
    parts.push("价格：免费");
  } else if (game.price) {
    parts.push(`价格：$${(game.price / 100).toFixed(2)}`);
  }

  if (game.shortDescription) {
    const desc = game.shortDescription
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`\n游戏简介：\n${desc.slice(0, 1000)}`);
  }

  if (game.description) {
    const fullDesc = game.description
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`\n完整描述：\n${fullDesc.slice(0, 3000)}`);
  }

  if (game.isPokemonLike && game.pokemonLikeTags && game.pokemonLikeTags.length > 0) {
    parts.push(`\n宝可梦Like标签：${game.pokemonLikeTags.join(", ")}`);
  }

  return parts.join("\n\n");
}

interface RawAnalysis {
  verdict?: string;
  coreGameplay?: {
    description?: string;
    creatureCollection?: boolean;
    creatureCount?: string;
    captureSystem?: string;
    evolutionSystem?: string;
    teamBuilding?: string;
    playerExperience?: string;
  };
  battleSystem?: {
    turnMechanism?: string;
    typeAdvantages?: string;
    moveSystem?: string;
    uniqueMechanics?: string[];
    battlePace?: string;
  };
  differentiation?: {
    coreTag?: string;
    innovationDescription?: string;
    combinedMechanics?: string[];
    whySuccessful?: string;
    marketPosition?: string;
  };
  negativeFeedback?: {
    summary?: string;
    topComplaints?: string[];
    complaintKeywords?: string[];
    designPitfalls?: string[];
    playerExpectations?: string;
  };
  designSuggestions?: {
    strengthsToLearn?: string[];
    pitfallsToAvoid?: string[];
    difficultyBalance?: string;
    grindAnalysis?: string;
    recommendation?: string;
  };
  referenceValue?: {
    forPoolA?: number;
    forPoolB?: number;
    forPoolC?: number;
    overallScore?: number;
  };
}

function parseAnalysis(
  raw: RawAnalysis,
  game: Game,
  pool?: "A" | "B" | "C" | null
): PokemonLikeAnalysis {
  const gameId = game.id;

  const coreGameplay = raw.coreGameplay || {};
  const battleSystem = raw.battleSystem || {};
  const differentiation = raw.differentiation || {};
  const negativeFeedback = raw.negativeFeedback || {};
  const designSuggestions = raw.designSuggestions || {};
  const referenceValue = raw.referenceValue || {};

  return {
    id: `pokemon-analysis-${gameId}-${Date.now()}`,
    gameId,
    gameName: game.name,
    generatedAt: new Date().toISOString(),
    pool: pool || null,
    verdict: raw.verdict || `${game.name}是一款需要进一步分析的回合制游戏`,

    coreGameplay: {
      type: "coreGameplay" as const,
      description: coreGameplay.description || "暂无核心玩法描述",
      creatureCollection: coreGameplay.creatureCollection ?? false,
      creatureCount: coreGameplay.creatureCount || "未知",
      captureSystem: coreGameplay.captureSystem || "暂无捕捉系统",
      evolutionSystem: coreGameplay.evolutionSystem || "暂无进化系统",
      teamBuilding: coreGameplay.teamBuilding || "暂无队伍构建系统",
      playerExperience: coreGameplay.playerExperience || "暂无玩家体验描述",
    },

    battleSystem: {
      type: "battleSystem" as const,
      turnMechanism: battleSystem.turnMechanism || "暂无回合制机制描述",
      typeAdvantages: battleSystem.typeAdvantages || "暂无属性克制描述",
      moveSystem: battleSystem.moveSystem || "暂无技能系统描述",
      uniqueMechanics: Array.isArray(battleSystem.uniqueMechanics)
        ? battleSystem.uniqueMechanics.filter(Boolean)
        : [],
      battlePace: battleSystem.battlePace || "暂无战斗节奏描述",
    },

    differentiation: {
      type: "differentiation" as const,
      coreTag: differentiation.coreTag || "普通回合制",
      innovationDescription: differentiation.innovationDescription || "暂无差异化描述",
      combinedMechanics: Array.isArray(differentiation.combinedMechanics)
        ? differentiation.combinedMechanics.filter(Boolean)
        : [],
      whySuccessful: differentiation.whySuccessful || "暂无成功原因分析",
      marketPosition: differentiation.marketPosition || "暂无市场定位分析",
    },

    negativeFeedback: {
      type: "negativeFeedback" as const,
      summary: negativeFeedback.summary || "暂无差评分析",
      topComplaints: Array.isArray(negativeFeedback.topComplaints)
        ? negativeFeedback.topComplaints.filter(Boolean)
        : [],
      complaintKeywords: Array.isArray(negativeFeedback.complaintKeywords)
        ? negativeFeedback.complaintKeywords.filter(Boolean)
        : [],
      designPitfalls: Array.isArray(negativeFeedback.designPitfalls)
        ? negativeFeedback.designPitfalls.filter(Boolean)
        : [],
      playerExpectations: negativeFeedback.playerExpectations || "暂无玩家预期分析",
    },

    designSuggestions: {
      type: "designSuggestions" as const,
      strengthsToLearn: Array.isArray(designSuggestions.strengthsToLearn)
        ? designSuggestions.strengthsToLearn.filter(Boolean)
        : [],
      pitfallsToAvoid: Array.isArray(designSuggestions.pitfallsToAvoid)
        ? designSuggestions.pitfallsToAvoid.filter(Boolean)
        : [],
      difficultyBalance: designSuggestions.difficultyBalance || "暂无难度分析",
      grindAnalysis: designSuggestions.grindAnalysis || "暂无肝度分析",
      recommendation: designSuggestions.recommendation || "暂无综合建议",
    },

    referenceValue: {
      forPoolA: clampScore(referenceValue.forPoolA),
      forPoolB: clampScore(referenceValue.forPoolB),
      forPoolC: clampScore(referenceValue.forPoolC),
      overallScore: clampScore(referenceValue.overallScore),
    },
  };
}

function clampScore(value: number | undefined): number {
  if (typeof value !== "number" || isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}
