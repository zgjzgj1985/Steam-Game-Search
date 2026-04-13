import { Game, BattleAnalysis, AnalysisNarrative } from "@/types/game";
import { chatJSON } from "@/lib/llm";
import { buildJSONPrompt } from "@/lib/analysis-prompt";

export async function generateAnalysis(game: Game): Promise<BattleAnalysis> {
  const raw = await chatJSON<BattleAnalysisRaw>([
    {
      role: "user",
      content: buildJSONPrompt(game),
    },
  ]);

  return parseAnalysis(raw, game);
}

interface BattleAnalysisRaw {
  narrative?: {
    verdict?: string;
    summary?: string;
    battleInsight?: string;
    strategyInsight?: string;
    keyTakeaways?: string[];
    dataCaveat?: string;
  };
  battleMechanics: {
    turnSystem: string;
    actionSystem: string;
    targetSystem: string;
    damageFormula: string;
    critSystem: string;
    elements: {
      hasElements: boolean;
      elements: string[];
      interactions?: { attacker: string; defender: string; multiplier: number }[];
    };
    statusEffects: {
      name: string;
      type: string;
      duration: string;
      stacks: boolean;
    }[];
    ultimateSkills: boolean;
    comboSystem: boolean;
    breakGauge?: { name: string; max: number; gainMethod: string; usage: string } | null;
    specialMechanics?: string[];
  };
  strategicDepth: {
    positioning: {
      hasPositioning: boolean;
      gridSize?: { width: number; height: number } | null;
      facing?: boolean;
      height?: boolean;
      terrain?: boolean;
    };
    synergies: {
      hasSynergies: boolean;
      types: string[];
      examples: {
        name: string;
        description: string;
        powerLevel: string;
      }[];
    };
    counterStrategies: {
      name: string;
      description: string;
      difficulty: string;
    }[];
    difficultySettings: {
      hasSettings: boolean;
      options: { name: string; description: string; effect: string }[];
    };
    tacticalOptions?: {
      category: string;
      options: string[];
      importanceScore: number;
    }[];
    replayabilityScore: number;
  };
  innovationElements: {
    name: string;
    description: string;
    impact: string;
    category: string;
    detail?: string;
  }[];
  overallScore: number;
}

function defaultNarrative(game: Game): AnalysisNarrative {
  return {
    verdict: `《${game.name}》的完整战斗叙事未返回，请确认 LLM 已按新版 JSON 输出 narrative 字段。`,
    summary:
      "若你仍看到本说明，通常是模型未返回 narrative 或 JSON 解析失败。请重新打开页面触发重新生成，或检查 API 配置与模型是否支持长输出。",
    battleInsight: "",
    strategyInsight: "",
    keyTakeaways: [],
    dataCaveat: "分析基于 Steam 商店简介与标签；实机机制以游戏为准。",
  };
}

function parseNarrative(raw: BattleAnalysisRaw, game: Game): AnalysisNarrative {
  const base = defaultNarrative(game);
  const n = raw.narrative;
  if (!n) return base;

  const keyTakeaways = Array.isArray(n.keyTakeaways)
    ? n.keyTakeaways.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    verdict: (n.verdict && n.verdict.trim()) || base.verdict,
    summary: (n.summary && n.summary.trim()) || base.summary,
    battleInsight: (n.battleInsight && n.battleInsight.trim()) || base.battleInsight,
    strategyInsight: (n.strategyInsight && n.strategyInsight.trim()) || base.strategyInsight,
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : base.keyTakeaways,
    dataCaveat: (n.dataCaveat && n.dataCaveat.trim()) || base.dataCaveat,
  };
}

function parseAnalysis(raw: BattleAnalysisRaw, game: Game): BattleAnalysis {
  const gameId = game.id;
  return {
    id: `analysis-${gameId}-${Date.now()}`,
    gameId,
    narrative: parseNarrative(raw, game),
    battleMechanics: {
      turnSystem: normalizeTurnSystem(raw.battleMechanics.turnSystem),
      actionSystem: normalizeActionSystem(raw.battleMechanics.actionSystem),
      targetSystem: normalizeTargetSystem(raw.battleMechanics.targetSystem),
      damageFormula: raw.battleMechanics.damageFormula || "未知",
      critSystem: normalizeCritSystem(raw.battleMechanics.critSystem),
      elements: {
        hasElements: raw.battleMechanics.elements?.hasElements ?? false,
        elements: raw.battleMechanics.elements?.elements ?? [],
        interactions: raw.battleMechanics.elements?.interactions ?? [],
      },
      statusEffects: (raw.battleMechanics.statusEffects || []).map((e) => ({
        name: e.name,
        type: normalizeStatusType(e.type),
        duration: normalizeDuration(e.duration),
        stacks: e.stacks ?? false,
      })),
      ultimateSkills: raw.battleMechanics.ultimateSkills ?? false,
      comboSystem: raw.battleMechanics.comboSystem ?? false,
      breakGauge: raw.battleMechanics.breakGauge || undefined,
      specialMechanics: raw.battleMechanics.specialMechanics || [],
    },
    strategicDepth: {
      positioning: {
        hasPositioning: raw.strategicDepth?.positioning?.hasPositioning ?? false,
        gridSize: raw.strategicDepth?.positioning?.gridSize || undefined,
        facing: raw.strategicDepth?.positioning?.facing ?? false,
        height: raw.strategicDepth?.positioning?.height ?? false,
        terrain: raw.strategicDepth?.positioning?.terrain ?? false,
      },
      synergies: {
        hasSynergies: raw.strategicDepth?.synergies?.hasSynergies ?? false,
        types: normalizeSynergyTypes(raw.strategicDepth?.synergies?.types || []),
        examples: (raw.strategicDepth?.synergies?.examples || []).map((ex) => ({
          name: ex.name,
          description: ex.description,
          powerLevel: normalizePowerLevel(ex.powerLevel),
        })),
      },
      counterStrategies: (raw.strategicDepth?.counterStrategies || []).map((cs) => ({
        name: cs.name,
        description: cs.description,
        difficulty: normalizeDifficulty(cs.difficulty),
      })),
      difficultySettings: {
        hasSettings: raw.strategicDepth?.difficultySettings?.hasSettings ?? false,
        options: raw.strategicDepth?.difficultySettings?.options || [],
      },
      tacticalOptions: (raw.strategicDepth?.tacticalOptions || []).map((to) => ({
        category: to.category,
        options: to.options || [],
        importanceScore: Math.min(100, Math.max(0, to.importanceScore || 0)),
      })),
      replayabilityScore: Math.min(100, Math.max(0, raw.strategicDepth?.replayabilityScore || 0)),
    },
    innovationElements: (raw.innovationElements || []).map((ie) => ({
      name: ie.name,
      description: ie.description,
      impact: normalizeImpact(ie.impact),
      category: normalizeInnovationCategory(ie.category),
      detail: ie.detail || ie.description,
    })),
    overallScore: Math.min(100, Math.max(0, raw.overallScore || 0)),
    generatedAt: new Date(),
  };
}

function normalizeTurnSystem(v: string): BattleAnalysis["battleMechanics"]["turnSystem"] {
  const m: Record<string, BattleAnalysis["battleMechanics"]["turnSystem"]> = {
    ATB: "ATB",
    Traditional: "Traditional",
    Side: "Side",
    RealTime: "RealTime",
    Hybrid: "Hybrid",
    传统: "Traditional",
    即时: "RealTime",
  };
  return m[v] || "Unknown";
}

function normalizeActionSystem(v: string): BattleAnalysis["battleMechanics"]["actionSystem"] {
  const m: Record<string, BattleAnalysis["battleMechanics"]["actionSystem"]> = {
    Menu: "Menu",
    Card: "Card",
    Timed: "Timed",
    Position: "Position",
    Combo: "Combo",
    Mixed: "Mixed",
  };
  return m[v] || "Mixed";
}

function normalizeTargetSystem(v: string): BattleAnalysis["battleMechanics"]["targetSystem"] {
  const m: Record<string, BattleAnalysis["battleMechanics"]["targetSystem"]> = {
    Single: "Single",
    Multi: "Multi",
    All: "All",
    Row: "Row",
    Column: "Column",
    Custom: "Custom",
  };
  return m[v] || "Multi";
}

function normalizeCritSystem(v: string): BattleAnalysis["battleMechanics"]["critSystem"] {
  const m: Record<string, BattleAnalysis["battleMechanics"]["critSystem"]> = {
    Fixed: "Fixed",
    Rate: "Rate",
    Stack: "Stack",
    Skill: "Skill",
    None: "None",
  };
  return m[v] || "None";
}

function normalizeStatusType(v: string): "Buff" | "Debuff" | "Special" {
  const m: Record<string, "Buff" | "Debuff" | "Special"> = {
    Buff: "Buff",
    Debuff: "Debuff",
    Special: "Special",
  };
  return m[v] || "Special";
}

function normalizeDuration(v: string): "Permanent" | "Timed" | "Stack" {
  const m: Record<string, "Permanent" | "Timed" | "Stack"> = {
    Permanent: "Permanent",
    Timed: "Timed",
    Stack: "Stack",
    永久: "Permanent",
  };
  return m[v] || "Timed";
}

function normalizeSynergyTypes(types: string[]): BattleAnalysis["strategicDepth"]["synergies"]["types"] {
  const valid = new Set(["Element", "Class", "Position", "Timing", "Equipment", "Status"]);
  return types.filter((t) => valid.has(t)) as BattleAnalysis["strategicDepth"]["synergies"]["types"];
}

function normalizePowerLevel(v: string): "Low" | "Medium" | "High" {
  const m: Record<string, "Low" | "Medium" | "High"> = {
    Low: "Low",
    Medium: "Medium",
    High: "High",
  };
  return m[v] || "Medium";
}

function normalizeDifficulty(v: string): "Easy" | "Medium" | "Hard" {
  const m: Record<string, "Easy" | "Medium" | "Hard"> = {
    Easy: "Easy",
    Medium: "Medium",
    Hard: "Hard",
  };
  return m[v] || "Medium";
}

function normalizeImpact(v: string): "Low" | "Medium" | "High" {
  const m: Record<string, "Low" | "Medium" | "High"> = {
    Low: "Low",
    Medium: "Medium",
    High: "High",
    高: "High",
    中: "Medium",
    低: "Low",
  };
  return m[v] || "Medium";
}

function normalizeInnovationCategory(v: string): "Mechanic" | "Visual" | "System" | "Narrative" {
  const m: Record<string, "Mechanic" | "Visual" | "System" | "Narrative"> = {
    Mechanic: "Mechanic",
    Visual: "Visual",
    System: "System",
    Narrative: "Narrative",
    机制: "Mechanic",
    系统: "System",
  };
  return m[v] || "Mechanic";
}
