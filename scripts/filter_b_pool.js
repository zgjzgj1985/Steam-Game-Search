/**
 * B池筛选脚本
 * 条件：好评率>=40%, 评论数>=50, 过滤测试版
 */

const fs = require('fs');
const path = require('path');

// 威尔逊得分计算
function wilsonScore(positive, negative) {
  const n = positive + negative;
  if (n === 0) return 0;
  const p = positive / n;
  const z = 1.64485;
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, Math.min(1, (center - spread) / denominator));
}

// 宝可梦Like核心标签
const CORE_TAGS = [
  "Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection",
  "Pokemon", "Insect Catching", "Bug Catching", "Fish Collection",
  "养宠", "养成", "宠物养成", "怪物养成", "生物收集", "怪物收集",
  "精灵养成", "精灵捕捉", "宠物收集", "妖怪养成", "妖怪收集",
  "昆虫捕捉", "虫子养成", "鱼类收集", "Monster Breeder", "Monster Raising",
  "Creature Raising", "Monster Ranching", "Summoner", "Summoning",
];

// 回合制标签
const TURN_BASED_TAGS = [
  "Turn-Based", "Turn-Based Strategy", "Turn-Based Tactics", "Turn-Based Combat",
  "Turn-Based RPG", "Turn Based", "Tactical RPG", "回合制", "回合",
];

// 回合制类型genres
const TURN_BASED_GENRES = ["RPG", "JRPG", "策略", "Strategy", "Role-Playing"];

// 宝可梦Like描述关键词
const POKEMON_LIKE_DESC_KEYWORDS = [
  "catch monsters", "collect creatures", "monster collection", "creature collecting",
  "monster taming", "monster raising", "monster collecting", "pokemon-like",
  "pokemon like", "monster trainer", "捕捉怪物", "收集生物", "怪物养成",
  "精灵养成", "妖怪养成", "宠物养成", "养宠", "生物收集", "怪物收集",
];

// 测试版关键词
const TEST_VERSION_KEYWORDS = [
  "beta", "α", "alpha", "β", "betta", "demo", "trial", "demo version",
  "early access", "pre-release", "pre release", "prototype", "tech demo",
  "test build", "testing", "test version", "搪瓷",
  " (beta)", " [beta]", " (demo)", " [demo]", " (alpha)", " [alpha]",
  " (test)", " [test]", " (prototype)", " (early access)",
  " - beta", " - demo", " - test",
  " 测试版", " 试玩版", " 体验版", " 抢先体验",
];

// 黑名单
const BLACKLIST_TAGS = ["NSFW", "Hentai", "Sexual Content"];
const BLACKLIST_DESC_KEYWORDS = [
  "adult visual novel", "adult game", "adult rpg", "adult sim",
  "erotic", "erotica", "nsfw", "hentai", "porn", "xxx",
  "steamy visual", "erotic visual", "sexy visual", "spicy erotic",
  "hot girls", "sultry teacher", "intimate encounter",
];

function matchWordBoundary(text, keyword) {
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  if (lower === kw) return true;
  const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(text);
}

function isTurnBased(tags, genres, description) {
  const normalizedTags = tags.map(t => t.toLowerCase());
  const normalizedGenres = genres.map(g => g.toLowerCase());

  const hasTurnBasedTag = TURN_BASED_TAGS.some(tb => {
    return normalizedTags.some(t => t.includes(tb.toLowerCase()));
  });
  if (hasTurnBasedTag) return true;

  const hasGenreFallback = TURN_BASED_GENRES.some(g =>
    normalizedGenres.some(ng => ng.includes(g.toLowerCase()))
  );
  if (hasGenreFallback) return true;

  if (description) {
    const descLower = description.toLowerCase();
    if (['turn-based', '回合制', '回合策略', '回合战斗', 'tactical rpg', 'srpg', 'jrpg', '策略rpg', '战棋']
      .some(kw => descLower.includes(kw))) {
      return true;
    }
  }
  return false;
}

function checkPokemonLike(tags, genres, description) {
  const normalizedTags = tags.map(t => t.toLowerCase());
  let coreMatchCount = 0;

  for (const tag of CORE_TAGS) {
    if (normalizedTags.some(t => matchWordBoundary(t, tag))) {
      coreMatchCount++;
    }
  }

  let descMatchCount = 0;
  if (description) {
    const descLower = description.toLowerCase();
    for (const keyword of POKEMON_LIKE_DESC_KEYWORDS) {
      if (descLower.includes(keyword.toLowerCase())) {
        descMatchCount++;
      }
    }
  }

  return coreMatchCount > 0 || descMatchCount >= 2;
}

function isBlacklisted(tags, genres, description) {
  const normalizedTags = tags.map(t => t.toLowerCase());
  if (BLACKLIST_TAGS.some(bl => normalizedTags.some(t => t.includes(bl.toLowerCase())))) {
    return true;
  }
  if (description) {
    const descLower = description.toLowerCase();
    if (BLACKLIST_DESC_KEYWORDS.some(bl => descLower.includes(bl.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function isTestVersion(name, tags, categories) {
  const lowerName = name.toLowerCase();
  for (const keyword of TEST_VERSION_KEYWORDS) {
    if (lowerName.includes(keyword)) return true;
  }
  const allTags = [...tags.map(t => t.toLowerCase()), ...categories.map(c => c.toLowerCase())];
  if (allTags.some(t => t.includes("early access"))) return true;
  return false;
}

function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.keys(raw);
}

console.log('开始加载游戏数据...');
const dataPath = 'D:/Steam全域游戏搜索/public/data/games-index.json';
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
console.log(`加载完成，共 ${Object.keys(rawData).length} 个游戏`);

// B池条件：好评率>=40%, 评论数>=50
const B_POOL_MIN_RATING = 40;
const B_POOL_MIN_REVIEWS = 50;

let totalTurnBased = 0;
let blacklisted = 0;
let testVersions = 0;
let notPokemonLike = 0;
let belowRating = 0;
let belowReviews = 0;
const bPoolGames = [];

for (const [appId, game] of Object.entries(rawData)) {
  const tags = normalizeTags(game.tags);
  const genres = game.genres || [];
  const categories = (game.categories || []).map(c => String(c));
  const description = game.short_description || '';

  // 检查是否是回合制
  if (!isTurnBased(tags, genres, description)) continue;
  totalTurnBased++;

  // 黑名单过滤
  if (isBlacklisted(tags, genres, description)) {
    blacklisted++;
    continue;
  }

  // 测试版过滤
  if (isTestVersion(game.name || '', tags, categories)) {
    testVersions++;
    continue;
  }

  // 检查是否是宝可梦Like
  if (!checkPokemonLike(tags, genres, description)) {
    notPokemonLike++;
    continue;
  }

  // 获取评价数据
  const positive = game.positive || 0;
  const negative = game.negative || 0;
  const totalReviews = positive + negative;

  // 检查好评率
  if (totalReviews === 0) continue;
  const reviewScore = Math.round((positive / totalReviews) * 100);
  if (reviewScore < B_POOL_MIN_RATING) {
    belowRating++;
    continue;
  }

  // 检查评论数
  if (totalReviews < B_POOL_MIN_REVIEWS) {
    belowReviews++;
    continue;
  }

  // 符合B池条件
  const wilson = wilsonScore(positive, negative);
  
  // 排除测试版（Playtest等）
  const name = game.name || '';
  const isPlaytest = /playtest|测试版|试玩版/i.test(name);
  if (isPlaytest) {
    testVersions++;
    continue;
  }
  
  bPoolGames.push({
    appId,
    name: game.name,
    positive,
    negative,
    totalReviews,
    reviewScore,
    wilsonScore: wilson,
    releaseDate: game.release_date,
    developers: game.developers || [],
    price: game.price || 0,
  });
}

// 按威尔逊得分降序排序
bPoolGames.sort((a, b) => b.wilsonScore - a.wilsonScore);

console.log('\n=== 筛选统计 ===');
console.log(`回合制游戏总数: ${totalTurnBased}`);
console.log(`黑名单过滤: ${blacklisted}`);
console.log(`测试版过滤: ${testVersions}`);
console.log(`非宝可梦Like: ${notPokemonLike}`);
console.log(`好评率<${B_POOL_MIN_RATING}%过滤: ${belowRating}`);
console.log(`评论数<${B_POOL_MIN_REVIEWS}过滤: ${belowReviews}`);
console.log(`\nB池游戏数量: ${bPoolGames.length}`);

// 输出游戏列表
console.log('\n=== B池游戏列表 ===');
console.log('排名\tAppID\t游戏名称\t好评率\t评论数\t威尔逊得分\t发售日期\t开发商');
bPoolGames.forEach((game, index) => {
  console.log(
    `${index + 1}\t${game.appId}\t${game.name}\t${game.reviewScore}%\t${game.totalReviews}\t` +
    `${(game.wilsonScore * 100).toFixed(2)}%\t${game.releaseDate || 'N/A'}\t${game.developers[0] || 'N/A'}`
  );
});

// 保存到文件
const outputPath = path.join(__dirname, 'temp', 'b_pool_40pct_50reviews.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(bPoolGames, null, 2), 'utf-8');
console.log(`\n游戏列表已保存到: ${outputPath}`);
