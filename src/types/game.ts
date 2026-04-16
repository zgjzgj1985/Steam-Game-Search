/**
 * 游戏基础数据类型
 */
export interface Game {
  id: string;
  name: string;
  steamAppId: string;
  description: string;
  shortDescription?: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  categories?: string[];
  releaseDate: string | null;
  price: number;
  metacriticScore: number | null;
  steamReviews: SteamReviews | null;
  headerImage: string | null;
  screenshots: string[];

  // 本地数据库扩展字段
  estimatedOwners?: number;
  estimatedOwnersMin?: number;
  estimatedOwnersMax?: number;
  peakCCU?: number;
  isFree?: boolean;
  steamUrl?: string;

  // 搜索/筛选相关
  searchMatchHints?: string[];

  // 测试版标记
  isTestVersion?: boolean;

  // 模式2扩展字段
  isPokemonLike?: boolean;
  pokemonLikeTags?: string[];
  wilsonScore?: number;
  pool?: "A" | "B" | "C" | null;
}

/**
 * Steam 评价数据
 */
export interface SteamReviews {
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;
  reviewScoreDescription: string;
}

// ============================================================================
// 宝可梦Like游戏专项分析类型（按需加载版）
// ============================================================================

/**
 * 分析模块类型
 */
export type AnalysisModuleType =
  | "verdict"        // 一句话总结
  | "coreGameplay"   // 核心玩法
  | "battleSystem"   // 战斗系统
  | "differentiation" // 差异化创新
  | "negativeFeedback" // 差评分析
  | "designSuggestions"; // 设计建议

/**
 * 分析模块状态
 */
export interface AnalysisModuleState {
  isAnalyzed: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

/**
 * 单个模块的分析结果
 */
export interface VerdictResult {
  type: "verdict";
  verdict: string;
}

export interface CoreGameplayResult {
  type: "coreGameplay";
  description: string;
  creatureCollection: boolean;
  creatureCount: string;
  captureSystem: string;
  evolutionSystem: string;
  teamBuilding: string;
  playerExperience: string;
}

export interface BattleSystemResult {
  type: "battleSystem";
  turnMechanism: string;
  typeAdvantages: string;
  moveSystem: string;
  uniqueMechanics: string[];
  battlePace: string;
}

export interface DifferentiationResult {
  type: "differentiation";
  coreTag: string;
  innovationDescription: string;
  combinedMechanics: string[];
  whySuccessful: string;
  marketPosition: string;
}

export interface NegativeFeedbackResult {
  type: "negativeFeedback";
  summary: string;
  topComplaints: string[];
  complaintKeywords: string[];
  designPitfalls: string[];
  playerExpectations: string;
}

export interface DesignSuggestionsResult {
  type: "designSuggestions";
  strengthsToLearn: string[];
  pitfallsToAvoid: string[];
  difficultyBalance: string;
  grindAnalysis: string;
  recommendation: string;
}

/**
 * 单个分析模块结果（联合类型）
 */
export type AnalysisModuleResult =
  | VerdictResult
  | CoreGameplayResult
  | BattleSystemResult
  | DifferentiationResult
  | NegativeFeedbackResult
  | DesignSuggestionsResult;

/**
 * 游戏分析状态（按模块存储）
 */
export interface GameAnalysis {
  id: string;
  gameId: string;
  gameName: string;
  pool: "A" | "B" | "C" | null;
  generatedAt: string | null;

  // 各模块状态
  verdict?: AnalysisModuleResult & AnalysisModuleState;
  coreGameplay?: AnalysisModuleResult & AnalysisModuleState;
  battleSystem?: AnalysisModuleResult & AnalysisModuleState;
  differentiation?: AnalysisModuleResult & AnalysisModuleState;
  negativeFeedback?: AnalysisModuleResult & AnalysisModuleState;
  designSuggestions?: AnalysisModuleResult & AnalysisModuleState;

  // 已分析模块列表
  analyzedModules: AnalysisModuleType[];

  // 参考价值评分（由LLM计算）
  referenceValue?: {
    forPoolA: number;
    forPoolB: number;
    forPoolC: number;
    overallScore: number;
  };
}

/**
 * 模块配置
 */
export interface ModuleConfig {
  type: AnalysisModuleType;
  title: string;
  subtitle: string;
  icon: string;
  poolRecommendation?: ("A" | "B" | "C")[];
  estimatedTokens?: number;
}

export const ANALYSIS_MODULES: ModuleConfig[] = [
  {
    type: "verdict",
    title: "一句话总结",
    subtitle: "快速了解游戏定位",
    icon: "🎯",
    poolRecommendation: ["A", "B", "C"],
    estimatedTokens: 200,
  },
  {
    type: "coreGameplay",
    title: "核心玩法",
    subtitle: "生物收集、捕捉、进化、队伍构建",
    icon: "🎮",
    poolRecommendation: ["A", "B", "C"],
    estimatedTokens: 600,
  },
  {
    type: "battleSystem",
    title: "战斗系统",
    subtitle: "回合制机制、属性克制、技能设计",
    icon: "⚔️",
    poolRecommendation: ["A", "B"],
    estimatedTokens: 500,
  },
  {
    type: "differentiation",
    title: "差异化创新",
    subtitle: "融合玩法、成功原因、市场定位",
    icon: "✨",
    poolRecommendation: ["B"],
    estimatedTokens: 500,
  },
  {
    type: "negativeFeedback",
    title: "差评分析",
    subtitle: "玩家抱怨点、设计缺陷警示",
    icon: "⚠️",
    poolRecommendation: ["C"],
    estimatedTokens: 600,
  },
  {
    type: "designSuggestions",
    title: "设计建议",
    subtitle: "值得学习的优点、避开的坑",
    icon: "💡",
    poolRecommendation: ["A", "B", "C"],
    estimatedTokens: 700,
  },
];

// ============================================================================
// 兼容旧版类型（用于迁移）
// ============================================================================

/**
 * 宝可梦Like游戏专项分析（旧版完整分析，保留兼容）
 */
export interface PokemonLikeAnalysis {
  id: string;
  gameId: string;
  gameName: string;
  generatedAt: string;

  // 池子归属
  pool: "A" | "B" | "C" | null;

  // 一句话总结
  verdict: string;

  // 核心玩法描述
  coreGameplay: CoreGameplayResult;

  // 战斗系统评估
  battleSystem: BattleSystemResult;

  // 差异化创新点
  differentiation: DifferentiationResult;

  // 差评分析（C池重点）
  negativeFeedback: NegativeFeedbackResult;

  // 设计建议
  designSuggestions: DesignSuggestionsResult;

  // 参考价值评分
  referenceValue: ReferenceValue;
}

export interface ReferenceValue {
  forPoolA: number;
  forPoolB: number;
  forPoolC: number;
  overallScore: number;
}

// ============================================================================
// 搜索筛选相关类型
// ============================================================================

export interface SearchFilters {
  query?: string;
  minRating?: number;
  minReviews?: number;
  genres?: string[];
  tags?: string[];
  sortBy?: "rating" | "reviews" | "date" | "name";
  sortOrder?: "asc" | "desc";
  minReleaseDate?: string;
  maxReleaseDate?: string;
  excludeTestVersions?: boolean;
}

// ============================================================================
// 游戏对比相关类型
// ============================================================================

export interface ComparisonData {
  games: Game[];
  analyses: PokemonLikeAnalysis[];
  metrics: ComparisonMetric[];
}

export interface ComparisonMetric {
  name: string;
  values: number[];
  labels: string[];
  maxValue: number;
  minValue: number;
}
