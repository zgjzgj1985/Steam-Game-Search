/**
 * 更新数据并重新生成预计算缓存
 *
 * 用法: npm run update-data
 * 或:   npx ts-node scripts/update-data.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const SOURCE = path.join(process.cwd(), "public", "data", "games-index.json");
const CACHE = path.join(process.cwd(), "public", "data", "games-cache.json");

async function main() {
  // 1. 检查源文件是否存在
  if (!fs.existsSync(SOURCE)) {
    console.error("❌ 源文件不存在:", SOURCE);
    process.exit(1);
  }

  // 2. 获取源文件大小和修改时间
  const stat = fs.statSync(SOURCE);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
  console.log(`📂 源文件: ${sizeMB} MB | 修改于 ${stat.mtime.toLocaleString("zh-CN")}`);

  // 3. 检查现有缓存
  if (fs.existsSync(CACHE)) {
    const cacheStat = fs.statSync(CACHE);
    const cacheAge = Math.round((stat.mtimeMs - cacheStat.mtimeMs) / 1000);
    console.log(`💾 现有缓存: ${(cacheStat.size / 1024 / 1024).toFixed(2)} MB | 生成于 ${cacheStat.mtime.toLocaleString("zh-CN")}`);
    console.log(`   缓存比源文件${cacheAge > 0 ? "旧" : "新"} ${Math.abs(cacheAge)} 秒`);

    if (stat.mtimeMs <= cacheStat.mtimeMs) {
      console.log("\n✅ 源文件未更新，缓存已是最新，无需重新生成。");
      process.exit(0);
    }

    console.log("\n🔄 源文件已更新，重新生成缓存...\n");
  } else {
    console.log("💾 未找到缓存，开始生成...\n");
  }

  // 4. 运行预计算脚本
  console.log("⚙️  运行预计算脚本...");
  try {
    execSync("npx ts-node --esm scripts/precompute.ts", {
      stdio: "inherit",
      cwd: process.cwd(),
      timeout: 300_000,
    });
    console.log("\n✅ 数据更新完成！");
  } catch (e) {
    console.error("\n❌ 预计算失败:", e);
    process.exit(1);
  }
}

main();
