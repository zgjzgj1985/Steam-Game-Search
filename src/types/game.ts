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
}

export interface SteamReviews {
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
  reviewScore: number;
  reviewScoreDescription: string;
}

/** LLM 可读性输出：页面应以叙事为主、结构化为辅 */
export interface AnalysisNarrative {
  /** 一句话结论（约 40–120 字） */
  verdict: string;
  /** 总述，多段纯文本 */
  summary: string;
  /** 战斗系统深度解读：资源循环、决策点、与同类差异 */
  battleInsight: string;
  /** 策略与深度：构筑、难度、重玩动机、学习曲线 */
  strategyInsight: string;
  /** 3–5 条要点，每条完整句子 */
  keyTakeaways: string[];
  /** 信息来源与局限性说明 */
  dataCaveat: string;
}

export interface BattleAnalysis {
  id: string;
  gameId: string;
  /** 新版 LLM 长文；旧缓存可能缺失 */
  narrative?: AnalysisNarrative;
  battleMechanics: BattleMechanics;
  strategicDepth: StrategicDepth;
  innovationElements: InnovationElement[];
  overallScore: number;
  generatedAt: Date;
}

export interface BattleMechanics {
  turnSystem: TurnSystem;
  actionSystem: ActionSystem;
  targetSystem: TargetSystem;
  damageFormula: string;
  critSystem: CritSystem;
  elements: ElementSystem;
  statusEffects: StatusEffect[];
  ultimateSkills: boolean;
  comboSystem: boolean;
  breakGauge?: GaugeSystem;
  specialMechanics: string[];
}

export type TurnSystem = "ATB" | "Traditional" | "Side" | "RealTime" | "Hybrid" | "Unknown";
export type ActionSystem = "Menu" | "Card" | "Timed" | "Position" | "Combo" | "Mixed";
export type TargetSystem = "Single" | "Multi" | "All" | "Row" | "Column" | "Custom";
export type CritSystem = "Fixed" | "Rate" | "Stack" | "Skill" | "None";

export interface ElementSystem {
  hasElements: boolean;
  elements: string[];
  interactions: ElementInteraction[];
}

export interface ElementInteraction {
  attacker: string;
  defender: string;
  multiplier: number;
}

export interface StatusEffect {
  name: string;
  type: "Buff" | "Debuff" | "Special";
  duration: "Permanent" | "Timed" | "Stack";
  stacks: boolean;
}

export interface GaugeSystem {
  name: string;
  max: number;
  gainMethod: string;
  usage: string;
}

export interface StrategicDepth {
  positioning: PositioningSystem;
  synergies: SynergySystem;
  counterStrategies: CounterStrategy[];
  difficultySettings: DifficultySettings;
  tacticalOptions: TacticalOption[];
  replayabilityScore: number;
}

export interface PositioningSystem {
  hasPositioning: boolean;
  gridSize?: { width: number; height: number };
  facing?: boolean;
  height?: boolean;
  terrain?: boolean;
}

export interface SynergySystem {
  hasSynergies: boolean;
  types: SynergyType[];
  examples: SynergyExample[];
}

export type SynergyType = "Element" | "Class" | "Position" | "Timing" | "Equipment" | "Status";

export interface SynergyExample {
  name: string;
  description: string;
  powerLevel: "Low" | "Medium" | "High";
}

export interface CounterStrategy {
  name: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface DifficultySettings {
  hasSettings: boolean;
  options: DifficultyOption[];
}

export interface DifficultyOption {
  name: string;
  description: string;
  effect: string;
}

export interface TacticalOption {
  category: string;
  options: string[];
  importanceScore: number;
}

export interface InnovationElement {
  name: string;
  description: string;
  impact: ImpactLevel;
  category: InnovationCategory;
  detail: string;
}

export type ImpactLevel = "Low" | "Medium" | "High";
export type InnovationCategory = "Mechanic" | "Visual" | "System" | "Narrative";

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

export interface ComparisonData {
  games: Game[];
  analyses: BattleAnalysis[];
  metrics: ComparisonMetric[];
}

export interface ComparisonMetric {
  name: string;
  values: number[];
  labels: string[];
  maxValue: number;
  minValue: number;
}
