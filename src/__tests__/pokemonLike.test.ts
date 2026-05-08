/**
 * 模式2宝可梦Like判断逻辑测试
 * ================================
 * 验证 matchWordBoundary 匹配函数的正确性
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

// ============ 测试用例 ============

interface TestCase {
  name: string;
  input: { text: string; keyword: string };
  expected: boolean;
}

const testCases: TestCase[] = [
  // 精确匹配测试
  {
    name: "精确匹配：Monster Catching 应该匹配 Monster Catching",
    input: { text: "Monster Catching", keyword: "Monster Catching" },
    expected: true,
  },
  {
    name: "精确匹配：monster catching（小写）应该匹配 Monster Catching",
    input: { text: "monster catching", keyword: "Monster Catching" },
    expected: true,
  },

  // 单词边界测试 - 避免误匹配
  {
    name: "单词边界：Monster Hunter 不应匹配 Monster Catching",
    input: { text: "Monster Hunter", keyword: "Monster Catching" },
    expected: false,
  },
  {
    name: "单词边界：Insectivores 不应匹配 Insect",
    input: { text: "Insectivores", keyword: "Insect" },
    expected: false,
  },
  {
    name: "单词边界：Fish Collection 应该匹配 Collection",
    input: { text: "Fish Collection", keyword: "Collection" },
    expected: true,
  },

  // 中文测试
  {
    name: "中文精确匹配：宠物养成 应该匹配 宠物养成",
    input: { text: "宠物养成", keyword: "宠物养成" },
    expected: true,
  },
  {
    name: "中文边界：怪物养成游戏 不应匹配 养成（无空格分隔，养成不是独立词）",
    input: { text: "怪物养成游戏", keyword: "养成" },
    expected: false, // 中文没有空格分隔，养成连在一起，不是独立单词
  },

  // 特殊场景测试
  {
    name: "空字符串不应匹配任何关键词",
    input: { text: "", keyword: "Monster Catching" },
    expected: false,
  },
  {
    name: "Pokemon 不应匹配 PokemonLike（无空格边界）",
    input: { text: "PokemonLike", keyword: "Pokemon" },
    expected: false,
  },

  // 新增标签测试 - Monster Breeder 系列
  {
    name: "Monster Breeder 应该匹配 Monster Breeder",
    input: { text: "Monster Breeder", keyword: "Monster Breeder" },
    expected: true,
  },
  {
    name: "Monster Raising 应该匹配 Monster Raising",
    input: { text: "Monster Raising", keyword: "Monster Raising" },
    expected: true,
  },
  {
    name: "Creature Raising 应该匹配 Creature Raising",
    input: { text: "Creature Raising", keyword: "Creature Raising" },
    expected: true,
  },
  {
    name: "Monster Ranching 应该匹配 Monster Ranching",
    input: { text: "Monster Ranching", keyword: "Monster Ranching" },
    expected: true,
  },
  {
    name: "Summoner 应该匹配 Summoner",
    input: { text: "Summoner", keyword: "Summoner" },
    expected: true,
  },
  {
    name: "Summoning 应该匹配 Summoning",
    input: { text: "Summoning", keyword: "Summoning" },
    expected: true,
  },

  // 误匹配测试 - 确保新标签不会误判
  {
    name: "Monster Hunter 不应匹配 Monster Breeder",
    input: { text: "Monster Hunter", keyword: "Monster Breeder" },
    expected: false,
  },
  {
    name: "Job Simulator 不应匹配 Creature Raising",
    input: { text: "Job Simulator", keyword: "Creature Raising" },
    expected: false,
  },
];

// ============ 运行测试 ============

function runTests(): void {
  console.log("=".repeat(60));
  console.log("模式2宝可梦Like判断逻辑测试");
  console.log("=".repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = matchWordBoundary(tc.input.text, tc.input.keyword);
    const success = result === tc.expected;

    if (success) {
      console.log(`[PASS] ${tc.name}`);
      passed++;
    } else {
      console.log(`[FAIL] ${tc.name}`);
      console.log(`       输入: text="${tc.input.text}", keyword="${tc.input.keyword}"`);
      console.log(`       期望: ${tc.expected}, 实际: ${result}`);
      failed++;
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests();
