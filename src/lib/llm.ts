const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openai") as Provider;
const LLM_API_KEY = process.env.LLM_API_KEY || "";

// 启动时验证 API Key，避免运行时才报模糊错误
if (!LLM_API_KEY) {
  console.warn(
    "[llm] 警告: 未配置 LLM API Key（LLM_API_KEY）。" +
    "分析生成功能将不可用。请参考 .env.example 配置。"
  );
}

function getBaseUrl(): string {
  switch (LLM_PROVIDER) {
    case "qianwen":
      return process.env.LLM_BASE_URL_QIANWEN || "https://dashscope.aliyuncs.com/compatible-mode/v1";
    case "openai":
      return process.env.LLM_BASE_URL_OPENAI || "https://api.openai.com/v1";
    case "ollama":
      return process.env.LLM_BASE_URL_OLLAMA || "http://localhost:11434/v1";
    case "openrouter":
      return process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
    case "novai":
      return process.env.LLM_BASE_URL || "https://us.novaiapi.com/v1";
    default:
      return process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  }
}

function getModel(): string {
  switch (LLM_PROVIDER) {
    case "qianwen":
      return process.env.LLM_MODEL_QIANWEN || "qwen3.6-plus";
    case "openai":
      return process.env.LLM_MODEL_OPENAI || "gpt-4o-mini";
    case "ollama":
      return process.env.LLM_MODEL_OLLAMA || "llama3";
    case "openrouter":
      return process.env.LLM_MODEL || "google/gemini-2.5-pro-preview";
    case "novai":
      return process.env.LLM_MODEL || "gemini-3-pro-preview-thinking";
    default:
      return process.env.LLM_MODEL || "gpt-4o-mini";
  }
}

type Provider = "openai" | "qianwen" | "ollama" | "openrouter" | "novai";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  reasoning?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${LLM_API_KEY}`,
  };
}

function buildBody(messages: LLMMessage[]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: getModel(),
    messages,
    max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "32768", 10),
    temperature: 0.7,
  };

  if (LLM_PROVIDER === "qianwen") {
    base.extra_body = {
      enable_thinking: false,
    };
  }

  return base;
}

export async function chat(messages: LLMMessage[]): Promise<LLMResponse> {
  if (!LLM_API_KEY || LLM_API_KEY === "your-api-key-here") {
    throw new Error(
      `LLM API 未配置。请确保 .env 中设置了 LLM_API_KEY（当前 Provider: ${LLM_PROVIDER}）`
    );
  }

  const url = `${getBaseUrl()}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(buildBody(messages)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 请求失败 [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error("LLM API 返回内容为空");
  }

  const msg = choice.message;

  return {
    content: msg.content || "",
    reasoning: msg.reasoning_content || undefined,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

/**
 * 单模块分析的提示词模板
 */
const MODULE_PROMPTS: Record<string, { system: string; userTemplate: string }> = {
  verdict: {
    system: `你是宝可梦Like游戏专项分析师。请根据游戏数据生成一句话总结。

【要求】
- 一句话概括游戏的定位和核心特点
- 30-80字，简洁有力
- 重点说明游戏适合什么类型的开发者参考
- 输出必须是合法JSON: {"verdict": "你的总结"}`,
    userTemplate: `请为以下游戏生成一句话总结：

游戏信息：
{gameInfo}

{poolHint}`,
  },

  coreGameplay: {
    system: `你是宝可梦Like游戏专项分析师。请对游戏的核心玩法系统进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 整体玩法循环：详细描述游戏的主要游戏循环，包括日常任务、核心目标、长线追求等
2. 生物收集系统：是否有生物收集系统、具体约多少种、设计密度如何
3. 捕捉/获得方式：详细描述玩家如何获得生物，不同稀有度的获取难度
4. 进化系统：进化机制的具体设计，是否有特殊进化条件
5. 队伍构建与策略：队伍构建的策略深度，词条/性格/技能搭配等
6. 玩家体验曲线：前期、中期、后期体验差异，肝度和氪金点

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "description": "整体玩法循环详细描述（300-500字）",
  "creatureCollection": true/false,
  "creatureCount": "生物种类及收集密度分析（200-300字）",
  "captureSystem": "捕捉/获得方式详细描述（300-400字）",
  "evolutionSystem": "进化系统设计分析（300-400字）",
  "teamBuilding": "队伍构建策略深度分析（300-400字）",
  "playerExperience": "玩家体验曲线与节奏分析（300-400字）"
}

【重要提示】
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 描述要具体、可操作，举例说明
- 不要使用泛化的形容词，要基于数据说话`,
    userTemplate: `请详细分析以下游戏的核心玩法系统：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。`,
  },

  battleSystem: {
    system: `你是宝可梦Like游戏专项分析师。请对游戏的战斗系统进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 回合制机制：具体是哪种回合制设计（传统回合、加速回合、即时回合等），先手机制设计
2. 属性克制系统：是否有属性系统、克制关系复杂度、是否有反克制机制
3. 技能/招式设计：技能池大小、技能学习方式、是否有特殊技能机制
4. 独特战斗机制：是否有创新战斗玩法（如天气、场地、连锁等）
5. 战斗节奏与时长：快节奏/慢节奏定位，一场战斗平均时长
6. PVP与PVE差异：两者在战斗设计上有什么区别

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "turnMechanism": "回合制机制详细分析（300-400字）",
  "typeAdvantages": "属性克制系统深度分析（300-400字）",
  "moveSystem": "技能/招式系统设计分析（300-400字）",
  "uniqueMechanics": ["独特战斗机制1详细描述（200字以上）", "独特战斗机制2详细描述（200字以上）"],
  "battlePace": "战斗节奏与时长分析（300-400字）",
  "pvpPveDifference": "PVP与PVE战斗差异分析（200-300字）"
}

【重要提示】
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 重点分析宝可梦Like特有的战斗机制设计
- 描述要具体，结合游戏实际设计举例说明`,
    userTemplate: `请详细分析以下游戏的战斗系统：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。`,
  },

  differentiation: {
    system: `你是宝可梦Like游戏专项分析师。请对游戏的差异化创新点进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 核心差异化定位：游戏最核心的差异化卖点是什么，与其他宝可梦Like游戏有何不同
2. 创新点详细描述：具体有哪些创新设计，这些创新是否成功
3. 融合玩法分析：融合了哪些其他类型游戏的玩法（如RPG、卡牌、Roguelike等）
4. 成功原因剖析：游戏受欢迎的根本原因是什么，核心玩家群体是谁
5. 市场定位分析：在同类游戏中处于什么位置，目标用户画像
6. 可复制的要素：哪些差异化设计可以被其他开发者学习借鉴

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "coreTag": "核心差异化定位详细分析（300-400字）",
  "innovationDescription": "创新点详细描述与分析（400-500字）",
  "combinedMechanics": ["融合的玩法1详细分析（300字以上）", "融合的玩法2详细分析（300字以上）"],
  "whySuccessful": "游戏成功原因深度剖析（400-500字）",
  "marketPosition": "市场定位与目标用户分析（300-400字）",
  "replicableElements": "可复制的差异化设计要素（300-400字）"
}

【重要提示】
- 这是B池游戏重点分析模块，要深入分析成功要素
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 要深入分析游戏的独特价值，找出可学习的设计要素`,
    userTemplate: `请详细分析以下游戏的差异化创新点：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。`,
  },

  negativeFeedback: {
    system: `你是宝可梦Like游戏专项分析师。请深入分析游戏的差评，给开发者提供避坑参考。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 差评整体概述：玩家整体在抱怨什么，负面情绪主要集中在哪些方面
2. 主要抱怨点详细分析：具体有哪些抱怨（3-5条），每条要深入分析原因
3. 差评关键词与高频词：高频出现的负面关键词，反映了玩家的核心痛点
4. 设计缺陷深度剖析：具体的设计问题是什么，为什么会导致玩家不满
5. 玩家预期与实际落差：玩家期望什么但实际体验如何，这种落差如何产生
6. 问题严重程度评估：这些问题对游戏口碑和留存的影响程度

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "summary": "差评整体概述与情绪分析（300-400字）",
  "topComplaints": ["抱怨1详细分析（300字以上）", "抱怨2详细分析（300字以上）", "抱怨3详细分析（300字以上）"],
  "complaintKeywords": ["关键词1出现场景与原因分析", "关键词2出现场景与原因分析", "关键词3出现场景与原因分析"],
  "designPitfalls": ["设计缺陷1详细剖析（300字以上）", "设计缺陷2详细剖析（300字以上）"],
  "playerExpectations": "玩家预期与实际体验落差分析（400-500字）",
  "severityAssessment": "问题严重程度与影响评估（300-400字）"
}

【重要提示】
- 这是C池游戏重点分析模块，必须真实反映玩家反馈，不要美化
- 差评分析要具体、可操作，每个字段要达到规定字数
- 要站在开发者角度分析问题，找出避坑要点`,
    userTemplate: `请深入分析以下游戏的差评：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。`,
  },

  designSuggestions: {
    system: `你是宝可梦Like游戏专项分析师。请对开发者给出详细的设计建议，每个建议都要有深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 值得学习的优点：游戏中哪些设计值得其他开发者借鉴，具体好在哪里
2. 需要避开的坑：哪些设计是失败的教训，为什么会失败，其他开发者应该如何避免
3. 难度与肝度平衡：游戏的难度曲线和肝度设计是否合理，有什么可以改进的地方
4. 肝度深度分析：游戏是否肝、怎么肝、肝的内容是否有价值，玩家接受度如何
5. 氪金点分析：游戏的付费设计是否合理，有哪些可以学习或避免的地方
6. 综合设计建议：对宝可梦Like游戏开发者的全面建议

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "strengthsToLearn": ["优点1详细分析（300字以上）", "优点2详细分析（300字以上）", "优点3详细分析（300字以上）"],
  "pitfallsToAvoid": ["需要避开的坑1详细分析（300字以上）", "需要避开的坑2详细分析（300字以上）", "需要避开的坑3详细分析（300字以上）"],
  "difficultyBalance": "难度与肝度平衡详细分析（400-500字）",
  "grindAnalysis": "肝度深度分析（400-500字）",
  "monetizationAnalysis": "氪金点与付费设计分析（300-400字）",
  "recommendation": "对开发者的综合设计建议（500-600字）"
}

【重要提示】
- 建议要具体、可操作，每个字段要达到规定字数
- 要基于游戏实际表现和数据给出建议，不要空泛
- 重点帮助开发者理解如何做出好的宝可梦Like游戏`,
    userTemplate: `请给出对以下游戏的设计建议：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。`,
  },
};

function buildPoolHint(pool?: "A" | "B" | "C" | null): string {
  if (!pool) return "";
  const hints: Record<string, string> = {
    A: "【池子提示】这是A池游戏（神作参考池），重点分析优秀UI和战斗机制表现力",
    B: "【池子提示】这是B池游戏（核心竞品池），重点分析成功原因和差异化创新点",
    C: "【池子提示】这是C池游戏（避坑指南池），重点分析差评原因和设计缺陷",
  };
  return hints[pool] || "";
}

/**
 * 单模块分析对话
 */
export async function chatModuleAnalysis(
  gameInfo: string,
  module: string,
  pool?: "A" | "B" | "C" | null
): Promise<string> {
  const promptConfig = MODULE_PROMPTS[module];

  if (!promptConfig) {
    throw new Error(`不支持的分析模块: ${module}`);
  }

  const userContent = promptConfig.userTemplate
    .replace("{gameInfo}", gameInfo)
    .replace("{poolHint}", buildPoolHint(pool));

  const result = await chat([
    { role: "system", content: promptConfig.system },
    { role: "user", content: userContent },
  ]);

  return result.content;
}

/**
 * 解析单模块分析结果
 */
export function parseModuleAnalysis(
  content: string,
  module: string
): Record<string, unknown> {
  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?$/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的不是有效 JSON:\n${cleaned.slice(0, 500)}`);
  }
}

// ============================================================================
// 保留旧版兼容函数（用于迁移）
// ============================================================================

const POKEMON_LIKE_SYSTEM_PROMPT = `你是宝可梦Like游戏专项分析师，专注于为"宝可梦Like游戏开发者"提供有价值的分析参考。

【你的分析对象】
从Steam筛选出的回合制游戏，根据评价分为三类：
- A池（神作参考池）：普通回合制游戏，优秀UI和战斗机制参考
- B池（核心竞品池）：宝可梦Like成功案例，学习成功要素
- C池（避坑指南池）：宝可梦Like争议/失败案例，读差评避大坑

【分析重点】
1. 核心玩法：生物收集/养成系统设计，捕捉方式，进化系统，队伍构建
2. 战斗系统：回合制机制与属性克制，独特战斗机制
3. 差异化创新：融合了哪些其他玩法，为什么受欢迎
4. 差评分析（重点！）：玩家最集中的抱怨点，设计缺陷
5. 设计建议：对其他开发者的实用参考

【输出格式】
必须输出合法JSON，字段说明如下：
- verdict: 一句话总结（30-80字）
- coreGameplay: 核心玩法描述
- battleSystem: 战斗系统评估
- differentiation: 差异化创新
- negativeFeedback: 差评分析
- designSuggestions: 设计建议

【重要提示】
- 不要在JSON外输出任何文字
- 所有描述字段要具体、有深度、可操作`;

export async function chatPokemonLikeAnalysis(
  gameInfo: string,
  pool?: "A" | "B" | "C" | null
): Promise<string> {
  const userMessage: LLMMessage = {
    role: "user",
    content: `请分析以下游戏数据：

游戏信息：
${gameInfo}

${pool ? `该游戏属于${pool}池，请针对${pool}池的特点调整分析侧重点` : ""}`,
  };

  const result = await chat([
    { role: "system", content: POKEMON_LIKE_SYSTEM_PROMPT },
    userMessage,
  ]);

  return result.content;
}

export function parsePokemonLikeAnalysis(content: string): Record<string, unknown> {
  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?$/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回的不是有效 JSON:\n${cleaned.slice(0, 500)}`);
  }
}
