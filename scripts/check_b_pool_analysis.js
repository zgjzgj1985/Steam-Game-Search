/**
 * 检查B池153款游戏中哪些已完成LLM 6大模块分析
 */

const fs = require('fs');

// 加载B池153款游戏数据
const bPoolData = JSON.parse(fs.readFileSync('D:/Steam全域游戏搜索/scripts/temp/b_pool_40pct_50reviews.json', 'utf-8'));
const bPoolAppIds = new Set(bPoolData.map(g => g.appId));

console.log(`B池游戏数量: ${bPoolData.length}`);

// 加载combinedMechanics.json
const mechanicsData = JSON.parse(fs.readFileSync('D:/Steam全域游戏搜索/public/data/combinedMechanics.json', 'utf-8'));

console.log(`\ncombinedMechanics.json 总游戏数: ${Object.keys(mechanicsData.games).length}`);
console.log(`processedGames: ${mechanicsData.processedGames}`);

// 检查B池游戏中有多少已完成分析
let completedCount = 0;
const completedGames = [];
const missingGames = [];

for (const appId of bPoolAppIds) {
  const gameData = mechanicsData.games[appId];
  if (gameData && gameData.status === 'generated') {
    completedCount++;
    completedGames.push({
      appId,
      name: bPoolData.find(g => g.appId === appId)?.name || gameData.name,
      mechanicsCount: gameData.mechanics?.length || 0
    });
  } else {
    const gameInfo = bPoolData.find(g => g.appId === appId);
    if (gameInfo) {
      missingGames.push({
        appId,
        name: gameInfo.name,
        reviewScore: gameInfo.reviewScore,
        totalReviews: gameInfo.totalReviews
      });
    }
  }
}

console.log(`\n=== B池游戏分析状态 ===`);
console.log(`已完成分析: ${completedCount} 款`);
console.log(`未完成分析: ${missingGames.length} 款`);

console.log(`\n=== 已完成分析的游戏 ===`);
for (const game of completedGames) {
  console.log(`- ${game.appId}: ${game.name} (${game.mechanicsCount}个玩法标签)`);
}

console.log(`\n=== 未完成分析的游戏 (前20个) ===`);
for (const game of missingGames.slice(0, 20)) {
  console.log(`- ${game.appId}: ${game.name} (${game.reviewScore}%, ${game.totalReviews}条评价)`);
}
if (missingGames.length > 20) {
  console.log(`... 还有 ${missingGames.length - 20} 个`);
}
