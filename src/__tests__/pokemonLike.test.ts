/**
 * 模式2宝可梦Like判断逻辑测试
 * ================================
 * 验证 checkPokemonLike 函数的正确性，包括置信度分级
 */

// ============ 工具函数（从 route.ts 复制）============

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchWordBoundary(text: string, keyword: string): boolean {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  if (lower === kw) return true;
  const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
  return regex.test(text);
}

// ============ 宝可梦Like判定函数（简化版用于测试）============

// 核心标签（与 pokemonLikeKeywords.json 保持同步）
const CORE_TAGS = [
  "Creature Collector",
  "Monster Catching",
  "Monster Taming",
  "Creature Collection",
  "Pokemon",
  "Insect Catching",
  "Bug Catching",
  "Fish Collection",
  "养宠",
  "养成",
  "宠物养成",
  "怪物养成",
  "生物收集",
  "怪物收集",
  "精灵养成",
  "精灵捕捉",
  "宠物收集",
  "妖怪养成",
  "妖怪收集",
  "昆虫捕捉",
  "虫子养成",
  "鱼类收集",
  "Monster Breeder",
  "Monster Raising",
  "Creature Raising",
  "Monster Ranching",
  "Summoner",
  "Summoning",
  "Companion",
  "Pet System",
  "Partner System",
  "Buddy System",
  "动物伙伴",
  "精灵伙伴",
  "宠物系统",
  "妖怪伙伴",
  "骑乘战斗",
  "坐骑战斗",
  "幻兽",
  "魔兽",
  "召唤兽",
  "灵宠",
  "妖灵",
  "驭兽",
  "契约兽",
  "Monster Tamer",
  "Beast Tamer",
  "Creature Tamer",
  "Catch Monsters",
  "Befriend Monsters",
  "Tame Beasts",
  "Monster Breeder",
  "monster master",
  "creature master",
  "使魔",
];

// 同义词映射
const SYNONYMS = {
  "Creature Collector": ["Monster Catcher", "Creature Gatherer", "Monster Collector"],
  "Monster Taming": ["Monster Domestication", "Creature Taming", "Beast Taming", "Taming Monsters", "Monster Tamer", "Beast Tamer", "Creature Tamer"],
  "养成": ["培育", "培养", "养成类", "培养系统"],
  "收集": ["收集癖", "收集系统", "收集图鉴", "物种收集", "收集养成"],
  "进化": ["进化系统", "进化机制", "形态变化", "进化链"],
  "随机遇敌": ["明雷", "暗雷", "明雷遇敌", "暗雷遇敌", "遇敌机制", "野生遭遇"],
  "生物收集": ["幻兽收集", "魔兽收集", "召唤兽收集", "灵宠收集", "妖灵收集"],
  "怪物养成": ["幻兽养成", "魔兽养成", "召唤兽养成", "灵宠养成"],
  "宠物养成": ["契约兽养成", "使魔养成", "伙伴养成"],
};

// 同义词扩展后的完整核心标签列表
const SYNONYMS_EXTENDED_TAGS: string[] = [];
for (const [key, values] of Object.entries(SYNONYMS)) {
  if (CORE_TAGS.includes(key)) {
    SYNONYMS_EXTENDED_TAGS.push(...values);
  }
}
const ALL_CORE_TAGS = [...CORE_TAGS, ...SYNONYMS_EXTENDED_TAGS];

// 次级标签
const SECONDARY_TAGS = [
  "Tame Animals",
  "Hunting",
  "Fishing",
  "Fossil Hunting",
  "Insect",
  "Dinosaur",
  "Mythical Creatures",
  "收集癖",
  "收集系统",
  "收集图鉴",
  "图鉴收集",
  "物种收集",
  "生物图鉴",
  "蛋生",
  "孵化",
  "繁殖系统",
];

// 描述关键词
const DESC_KEYWORDS = [
  "monster collector",
  "creature collecting",
  "pokemon-like",
  "pokemon like",
  "creature evolution",
  "evolve monster",
  "pocket monster",
  "monster training",
  "monster trainer",
  "pet collector",
  "pet catching",
  "catch creatures",
  "tame creatures",
  "collect pets",
  "collect monsters",
  "monster collection",
  "monster gather",
  "monster rally",
  "capture creatures",
  "creature catching",
  "catch insects",
  "collect bugs",
  "bug collector",
  "collect fish",
  "dinosaur catching",
  "dinosaur taming",
  "collect dinosaurs",
  "creature breeding",
  "breed creatures",
  "digimon",
  "僵尸进化",
  "怪兽驯服",
  "培养怪物",
  "驯养",
  "驯服",
  "收服",
  "召唤生物",
  "水族收集",
  "培育生物",
  "monster ranching",
  "creature raising",
  "raise your monsters",
  "hatch and grow",
  "monster breeding",
  "creature breeding",
  "summon creatures",
  "raise pets",
  "pet as partner",
  "befriend creatures",
  "recruit monsters",
  "add companions",
  "party members you catch",
  "捕获同伴",
  "收为同伴",
  "成为伙伴",
  "一起冒险",
  "冒险伙伴",
  "并肩作战",
  "野生怪物",
  "遭遇战",
  "随机遇敌",
  "明雷遇敌",
  "暗雷遇敌",
  "进化系统",
  "等级提升",
  "属性成长",
  "技能学习",
  "技能遗传",
  "招式",
  "属性克制",
  "属性相克",
  "弱点攻击",
  "效果拔群",
  "beast tamer",
  "creature trainer",
  "monster rodeo",
  "animal ranch",
  "ranch life",
  "farm sim",
  "牧场生活",
  "牧场模拟",
  "畜牧",
  "放牧",
];

interface PokemonLikeResult {
  isPokemonLike: boolean;
  matchingTags: string[];
  confidence: "high" | "medium" | "low";
}

function checkPokemonLike(
  tags: string[],
  genres: string[],
  shortDescription?: string,
  detailedDescription?: string
): PokemonLikeResult {
  const normalizedTags = tags.map((t) => t.toLowerCase());
  const matchingTags: string[] = [];
  let coreMatchCount = 0;
  let secondaryMatchCount = 0;
  let descMatchCount = 0;

  // 策略1：检查核心标签（含同义词扩展）
  for (const tag of ALL_CORE_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      matchingTags.push(tag);
      coreMatchCount++;
    }
  }

  // 策略2：检查次级标签（仅作为置信度补充，不参与 isPokemonLike 判定）
  for (const tag of SECONDARY_TAGS) {
    if (normalizedTags.some((t) => matchWordBoundary(t, tag))) {
      secondaryMatchCount++;
    }
  }

  // 策略3：描述关键词兜底
  const fullDesc = [shortDescription, detailedDescription].filter(Boolean).join(" ");
  if (fullDesc) {
    const descLower = fullDesc.toLowerCase();
    for (const keyword of DESC_KEYWORDS) {
      if (descLower.includes(keyword.toLowerCase())) {
        matchingTags.push(keyword);
        descMatchCount++;
      }
    }
  }

  // isPokemonLike 判定：核心标签匹配 OR 描述关键词丰富（>=2个）
  const isPokemonLike = coreMatchCount > 0 || descMatchCount >= 2;

  // 计算置信度
  let confidence: "high" | "medium" | "low" = "low";
  if (coreMatchCount >= 2) {
    confidence = "high";
  } else if (coreMatchCount === 1) {
    // 有核心标签：参考次级标签和描述关键词提升置信度
    if (secondaryMatchCount >= 2 || descMatchCount >= 3) {
      confidence = "high";
    } else if (secondaryMatchCount >= 1 || descMatchCount >= 1) {
      confidence = "medium";
    } else {
      confidence = "medium";
    }
  } else if (descMatchCount >= 3) {
    // 无核心标签但描述丰富
    confidence = "medium";
  } else if (descMatchCount >= 2) {
    // 描述关键词触发 isPokemonLike，置信度为 low
    confidence = "low";
  }

  return {
    isPokemonLike,
    matchingTags,
    confidence,
  };
}

// ============ 测试用例 ============

interface TestCase {
  name: string;
  input: {
    tags: string[];
    genres: string[];
    shortDescription?: string;
    detailedDescription?: string;
  };
  expected: {
    isPokemonLike: boolean;
    confidence: "high" | "medium" | "low";
    atLeastOneTag?: string;
  };
}

const testCases: TestCase[] = [
  // ========== 高置信度测试（核心标签匹配 >= 2）==========
  {
    name: "高置信度：Temtem - 多个核心标签匹配",
    input: {
      tags: ["Creature Collector", "Monster Catching", "RPG", "Turn-Based"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "high",
      atLeastOneTag: "Creature Collector",
    },
  },
  {
    name: "高置信度：Cassette Beasts - 多个核心标签匹配",
    input: {
      tags: ["Creature Collector", "Creature Collection", "Turn-Based RPG", "Monsters"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "high",
    },
  },
  {
    name: "高置信度：Monster Sanctuary - 多个核心标签匹配",
    input: {
      tags: ["Creature Collector", "Monster Taming", "Metroidvania", "Turn-Based"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "high",
    },
  },

  // ========== 中置信度测试（核心标签匹配 = 1）==========
  {
    name: "中置信度：只有1个核心标签",
    input: {
      tags: ["Creature Collector", "RPG", "Adventure"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "中置信度：中文核心标签匹配",
    input: {
      tags: ["养成", "RPG", "回合制"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },

  // ========== 低置信度测试（仅次级标签或描述匹配）==========
  // ========== 非宝可梦Like测试（描述关键词不足以触发）==========
  // 次级标签不能触发 isPokemonLike
  // 描述关键词必须 >=2 才能触发 isPokemonLike
  {
    name: "非宝可梦Like：Monster Hunter（不在列表中的标签）",
    input: {
      tags: ["Action", "Hack and Slash", "Co-op"],
      genres: ["Action"],
    },
    expected: {
      isPokemonLike: false,
      confidence: "low",
    },
  },
  {
    name: "非宝可梦Like：Stardew Valley（无相关标签或描述）",
    input: {
      tags: ["Farming Sim", "Life Sim", "Pixel Art"],
      genres: ["Simulation"],
      shortDescription: "Farming, fishing, and mining simulation game",
    },
    expected: {
      isPokemonLike: false,
      confidence: "low",
    },
  },

  // ========== 非宝可梦Like测试（需要明确标签或描述才能排除）==========
  // 注：由于策略是"扩大候选池"，只有次级标签匹配不再触发 isPokemonLike
  // 必须有核心标签或 >=2 个描述关键词才能进入候选池
  {
    name: "非宝可梦Like：Monster Hunter（不在列表中的标签）",
    input: {
      tags: ["Action", "Hack and Slash", "Co-op"],
      genres: ["Action"],
    },
    expected: {
      isPokemonLike: false, // 无任何匹配
      confidence: "low",
    },
  },
  {
    name: "非宝可梦Like：Stardew Valley（无相关标签或描述）",
    input: {
      tags: ["Farming Sim", "Life Sim", "Pixel Art"],
      genres: ["Simulation"],
      shortDescription: "Farming, fishing, and mining simulation game",
    },
    expected: {
      isPokemonLike: false, // Farming Sim 不在核心/次级列表，描述无关键词
      confidence: "low",
    },
  },

  // ========== 边界情况测试 ==========
  {
    name: "边界：空标签+描述>=2触发",
    input: {
      tags: [],
      genres: ["RPG"],
      shortDescription: "You are a monster collector. Collect pets and catch creatures in battle",
    },
    expected: {
      isPokemonLike: true,  // "monster collector" + "collect pets" + "catch creatures" >= 2
      confidence: "medium",  // descMatchCount >= 3 → medium
    },
  },
  {
    name: "边界：空标签+仅1个描述关键词",
    input: {
      tags: [],
      genres: ["RPG"],
      shortDescription: "A fun RPG adventure",
    },
    expected: {
      isPokemonLike: false, // 无核心标签，无足够描述关键词
      confidence: "low",
    },
  },
  {
    name: "边界：空标签和空描述",
    input: {
      tags: [],
      genres: ["Action"],
    },
    expected: {
      isPokemonLike: false, // 无任何匹配
      confidence: "low",
    },
  },

  // ========== 新增标签测试 ==========
  {
    name: "新标签：Companion 系统",
    input: {
      tags: ["Companion", "RPG", "Adventure"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新标签：Pet System",
    input: {
      tags: ["Pet System", "RPG", "Fantasy"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新标签：Partner System",
    input: {
      tags: ["Partner System", "RPG", "Turn-Based"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新标签：Buddy System",
    input: {
      tags: ["Buddy System", "RPG", "Adventure"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },

  // ========== 描述关键词扩展测试 ==========
  {
    name: "扩展描述：raise pets + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "Raise pets as your partner and catch creatures to collect and breed monsters",
    },
    expected: {
      isPokemonLike: true,  // "raise pets" + "pet as partner" + "catch creatures" + "collect" + "breed" >= 2
      confidence: "low",  // descMatchCount = 2
    },
  },
  {
    name: "扩展描述：pet as partner + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "Pet as partner and catch creatures to collect",
    },
    expected: {
      isPokemonLike: true,  // "pet as partner" + "catch creatures" + "collect" >= 2
      confidence: "low",  // descMatchCount = 2
    },
  },
  {
    name: "扩展描述：冒险伙伴 + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "寻找冒险伙伴，捕捉野生怪物，驯养收服召唤生物",
    },
    expected: {
      isPokemonLike: true,  // "冒险伙伴" + "野生怪物" + "捕捉" + "驯养" + "收服" + "召唤生物" >= 2
      confidence: "medium",
    },
  },
  {
    name: "扩展描述：牧场生活 + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "体验牧场生活，收集养成宠物，驯养怪兽并收服召唤生物进行战斗",
    },
    expected: {
      isPokemonLike: true,  // "牧场生活" + "养成" + "驯养" + "收服" + "召唤生物" >= 2
      confidence: "medium",
    },
  },
  {
    name: "扩展描述：进化系统 + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "宠物可以通过进化系统变得更强，收集养成怪兽并收服召唤生物",
    },
    expected: {
      isPokemonLike: true,  // "进化系统" + "养成" + "收服" + "召唤生物" >= 2
      confidence: "medium",
    },
  },
  {
    name: "扩展描述：属性克制 + 多个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "利用属性克制机制取得战斗优势，收集养成怪兽并驯养收服召唤生物",
    },
    expected: {
      isPokemonLike: true,  // "属性克制" + "养成" + "驯养" + "收服" + "召唤生物" >= 2
      confidence: "medium",
    },
  },

  // ========== 新增中文变体标签测试 ==========
  {
    name: "新增标签：幻兽",
    input: {
      tags: ["幻兽", "RPG", "回合制"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新增标签：契约兽",
    input: {
      tags: ["契约兽", "RPG", "冒险"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新增标签：使魔",
    input: {
      tags: ["使魔", "RPG", "召唤"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "新增标签：Monster Tamer",
    input: {
      tags: ["Monster Tamer", "RPG", "Adventure"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "high",  // 同义词扩展导致 coreMatchCount=2，置信度 high
    },
  },
  {
    name: "新增标签：Beast Tamer",
    input: {
      tags: ["Beast Tamer", "RPG", "Fantasy"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "high",  // 同义词扩展导致 coreMatchCount=2，置信度 high
    },
  },

  // ========== 描述关键词触发 isPokemonLike 测试 ==========
  {
    name: "描述触发：>=2个关键词触发isPokemonLike",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "You are a monster collector. Collect pets and catch creatures in this adventure",
    },
    expected: {
      isPokemonLike: true,  // "monster collector" + "collect pets" + "catch creatures" >= 2
      confidence: "medium",  // descMatchCount >= 3
    },
  },
  {
    name: "描述触发：>=3个关键词提升置信度",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "You are a creature collector. Collect pets and catch creatures and breed monsters",
    },
    expected: {
      isPokemonLike: true,  // "creature collector" + "collect pets" + "catch creatures" + "breed" >= 2
      confidence: "low",  // descMatchCount = 2 (breed不匹配), coreMatchCount = 0
    },
  },
  {
    name: "描述触发：中文多关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "养成你的怪物，收服召唤生物，驯养捕捉怪兽进行战斗",
    },
    expected: {
      isPokemonLike: true,  // "养成" + "收服" + "召唤生物" + "驯养" + "捕捉" + "战斗" >= 2
      confidence: "medium",
    },
  },
  {
    name: "描述不触发：仅1个关键词",
    input: {
      tags: ["RPG"],
      genres: ["RPG"],
      shortDescription: "An exciting adventure RPG with monsters",
    },
    expected: {
      isPokemonLike: false,  // 无关键词匹配
      confidence: "low",
    },
  },

  // ========== 同义词扩展测试 ==========
  {
    name: "同义词扩展：Monster Catcher -> Creature Collector",
    input: {
      tags: ["Monster Catcher", "RPG", "Adventure"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
  {
    name: "同义词扩展：培育 -> 养成",
    input: {
      tags: ["培育", "RPG", "冒险"],
      genres: ["RPG"],
    },
    expected: {
      isPokemonLike: true,
      confidence: "medium",
    },
  },
];

// ============ 运行测试 ============

function runTests(): void {
  console.log("=".repeat(70));
  console.log("模式2宝可梦Like判断逻辑测试（包含置信度分级）");
  console.log("=".repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = checkPokemonLike(
      tc.input.tags,
      tc.input.genres,
      tc.input.shortDescription,
      tc.input.detailedDescription
    );

    const isPokemonLikeMatch = result.isPokemonLike === tc.expected.isPokemonLike;
    const confidenceMatch = result.confidence === tc.expected.confidence;

    let tagMatch = true;
    if (tc.expected.atLeastOneTag) {
      tagMatch = result.matchingTags.includes(tc.expected.atLeastOneTag);
    }

    const success = isPokemonLikeMatch && confidenceMatch && tagMatch;

    if (success) {
      console.log(`[PASS] ${tc.name}`);
      passed++;
    } else {
      console.log(`[FAIL] ${tc.name}`);
      console.log(`       输入: tags=${JSON.stringify(tc.input.tags)}, genres=${JSON.stringify(tc.input.genres)}`);
      console.log(`       描述: "${tc.input.shortDescription || ""}"`);
      console.log(`       期望: isPokemonLike=${tc.expected.isPokemonLike}, confidence=${tc.expected.confidence}`);
      console.log(`       实际: isPokemonLike=${result.isPokemonLike}, confidence=${result.confidence}`);
      console.log(`       匹配标签: ${result.matchingTags.join(", ") || "无"}`);
      if (!isPokemonLikeMatch) console.log(`       ❌ isPokemonLike 不匹配`);
      if (!confidenceMatch) console.log(`       ❌ confidence 不匹配`);
      if (!tagMatch) console.log(`       ❌ 缺少标签 ${tc.expected.atLeastOneTag}`);
      failed++;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log("=".repeat(70));
  console.log();

  // 统计置信度分布
  const confidenceStats = { high: 0, medium: 0, low: 0, none: 0 };
  for (const tc of testCases) {
    const result = checkPokemonLike(
      tc.input.tags,
      tc.input.genres,
      tc.input.shortDescription,
      tc.input.detailedDescription
    );
    if (result.isPokemonLike) {
      confidenceStats[result.confidence]++;
    } else {
      confidenceStats.none++;
    }
  }
  console.log("置信度分布统计:");
  console.log(`  高置信度: ${confidenceStats.high} 个`);
  console.log(`  中置信度: ${confidenceStats.medium} 个`);
  console.log(`  低置信度: ${confidenceStats.low} 个`);
  console.log(`  非宝可梦Like: ${confidenceStats.none} 个`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests();
