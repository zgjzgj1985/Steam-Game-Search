import { Game } from "@/types/game";

export function buildAnalysisPrompt(game: Game): string {
  const tags = game.tags.join("、") || "未知";
  const genres = game.genres.join("、") || "未知";
  const devs = game.developers.join("、") || "未知";

  return `你是一个专业的回合制游戏战斗系统分析师。请根据以下游戏信息，深入分析其战斗策略与创新点。

## 游戏基本信息
- 名称: ${game.name}
- 开发商: ${devs}
- 发行商: ${game.publishers.join("、") || "未知"}
- 类型: ${genres}
- 标签: ${tags}
- Steam App ID: ${game.steamAppId || "未知"}
- 发售日期: ${game.releaseDate || "未知"}
- Steam 好评率: ${game.steamReviews ? `${game.steamReviews.reviewScoreDescription} (${game.steamReviews.reviewScore}%)` : "暂无数据"}
- Metacritic 评分: ${game.metacriticScore || "暂无"}

## 游戏简介
${game.description || "暂无简介"}

## 分析要求
请从以下两个核心维度进行分析：

### 一、战斗策略分析
分析该游戏的战斗机制深度，包括：
1. **回合系统**: 采用什么回合机制（ATB、传统回合、站位式等），有何特点
2. **行动选择**: 玩家在每回合可以做出哪些战术决策
3. **目标与伤害**: 目标选择机制、伤害公式特点
4. **暴击与状态**: 暴击机制、状态效果体系
5. **特殊系统**: 是否有终结技、连击系统、槽/气系统等特殊机制
6. **元素系统**: 是否有元素克制，其策略深度如何
7. **站位系统**: 是否有空间/站位概念，对战术有何影响
8. **协同与反制**: 队友/系统间的协同配合，以及玩家的反制手段
9. **难度设计**: 难度选择和平衡性

### 二、创新亮点分析
找出该游戏在战斗系统上的原创设计或优秀实现：
1. **机制创新**: 是否有独特的战斗机制设计
2. **系统创新**: 角色、装备、技能等周边系统如何与战斗联动
3. **设计亮点**: 在同类游戏中做得特别好的地方

请用中文回答，分析要具体、有深度，结合该游戏的实际设计特点，不要泛泛而谈。`;
}

export function buildJSONPrompt(game: Game): string {
  return `${buildAnalysisPrompt(game)}

## 输出格式要求

**极其重要**：下面 narrative 对象是用户真正会阅读的内容，必须写得具体、有判断、有依据（结合游戏简介与标签），禁止输出空洞套话。battleMechanics / strategicDepth 等结构化字段是对叙事的补充摘要，不得只有分类词而没有解释。

**字数要求（中文）**：
- narrative.verdict：约 40–120 字。
- narrative.summary：至少 280 字，分 2–4 段，每段讲清一个维度（如核心循环、策略空间、适合谁）。
- narrative.battleInsight：至少 200 字，说明玩家每回合/每轮在做什么、关键资源与胜负手、与常见同类作品的差异。
- narrative.strategyInsight：至少 200 字，说明构筑/成长/难度如何影响决策，以及重玩价值来自哪里。
- narrative.keyTakeaways：恰好 4 条，每条 25–80 字。
- narrative.dataCaveat：说明本分析主要依据商店简介与标签推断，哪些结论需在实机中验证。

请严格按以下 JSON 格式返回，字段必须完整，不得省略任何字段：

{
  "narrative": {
    "verdict": "一句话结论",
    "summary": "多段总述，用 \\n\\n 分段",
    "battleInsight": "战斗系统深度解读",
    "strategyInsight": "策略与深度解读",
    "keyTakeaways": ["要点1", "要点2", "要点3", "要点4"],
    "dataCaveat": "数据来源与局限性"
  },
  "battleMechanics": {
    "turnSystem": "Traditional | ATB | Side | RealTime | Hybrid | Unknown",
    "actionSystem": "Menu | Card | Timed | Position | Combo | Mixed",
    "targetSystem": "Single | Multi | All | Row | Column | Custom",
    "damageFormula": "结合简介：简述伤害/护甲/能量/牌费等如何影响决策；仅当完全无法推断时可写「未知」",
    "critSystem": "Fixed | Rate | Stack | Skill | None",
    "elements": {
      "hasElements": true/false,
      "elements": ["火", "水", ...],
      "interactions": [
        {"attacker": "火", "defender": "冰", "multiplier": 1.5},
        ...
      ]
    },
    "statusEffects": [
      {"name": "效果名", "type": "Buff|Debuff|Special", "duration": "Permanent|Timed|Stack", "stacks": true/false},
      ...
    ],
    "ultimateSkills": true/false,
    "comboSystem": true/false,
    "breakGauge": {"name": "槽名称", "max": 数值, "gainMethod": "获取方式", "usage": "用途"} | null,
    "specialMechanics": ["特殊机制1", "特殊机制2", ...]
  },
  "strategicDepth": {
    "positioning": {
      "hasPositioning": true/false,
      "gridSize": {"width": 数值, "height": 数值} | null,
      "facing": true/false,
      "height": true/false,
      "terrain": true/false
    },
    "synergies": {
      "hasSynergies": true/false,
      "types": ["Element", "Class", "Position", "Timing", "Equipment", "Status"],
      "examples": [
        {"name": "协同名", "description": "描述", "powerLevel": "Low|Medium|High"},
        ...
      ]
    },
    "counterStrategies": [
      {"name": "反制名", "description": "描述", "difficulty": "Easy|Medium|Hard"},
      ...
    ],
    "difficultySettings": {
      "hasSettings": true/false,
      "options": [
        {"name": "难度名", "description": "描述", "effect": "效果"},
        ...
      ]
    },
    "tacticalOptions": [
      {"category": "类别", "options": ["选项1", "选项2", ...], "importanceScore": 0-100},
      ...
    ],
    "replayabilityScore": 0-100
  },
  "innovationElements": [
    {
      "name": "创新点名称",
      "description": "简要描述",
      "impact": "Low | Medium | High",
      "category": "Mechanic | Visual | System | Narrative",
      "detail": "至少 80 字：写清原理、对决策的影响、与同类差异；禁止空话"
    },
    ...
  ],
  "overallScore": 0-100
}

请只返回 JSON，不要有任何其他文字。JSON 数组和对象都要完整输出，不要用 ... 省略。`;
}
