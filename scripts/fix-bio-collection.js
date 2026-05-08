/**
 * 补全文档脚本
 * 从 analyses.json 提取 creatureCount（生物数量与密度介绍）内容
 * 追加到生物收集部分的 "true" 之后、"获得方式" 之前
 */

const fs = require('fs');
const path = require('path');

// 获取项目根目录
const projectRoot = path.resolve(__dirname, '..');

// 分析结果文件路径
const ANALYSES_FILE = path.join(projectRoot, 'public', 'data', 'analyses.json');

// 文档目录
const DOCS_DIR = path.join(projectRoot, 'docs', 'LLM详细分析宝可梦like案例');

// 加载分析数据
function loadAnalyses() {
  try {
    const raw = fs.readFileSync(ANALYSES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('加载分析文件失败:', e.message);
    return {};
  }
}

// 获取目录下的所有 .md 文件
function getMarkdownFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// 从文件名提取游戏名（去掉 .md 后缀，并标准化）
// 处理: Atrio_ The Dark Wild -> Atrio: The Dark Wild
// 处理: Bloomtown_ A Different Story -> Bloomtown: A Different Story
function extractGameName(filename) {
  let name = path.basename(filename, '.md');
  
  // 处理下划线替换：把 "_ " 替换为 ": " (下划线后面有空格的情况)
  // 例如 "Atrio_ The" -> "Atrio: The" (表示 _ 代替了 :)
  name = name.replace(/_(\S)/g, ': $1');
  
  // 处理剩余的下划线（连续的或普通空格后的）
  name = name.replace(/_/g, ' ');
  
  // 清理多余空格
  name = name.replace(/ +/g, ' ');
  
  // 还原一些常见的特殊字符
  name = name.replace(/"/g, '"');
  name = name.replace(/'/g, "'");
  
  return name.trim();
}

// 标准化游戏名称用于比较
function normalizeGameName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/：/g, ':')  // 中文冒号转英文
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .trim();
}

// 尝试在分析结果中查找对应的游戏
function findGameInAnalyses(analyses, targetName) {
  const normalizedTarget = normalizeGameName(targetName);
  
  // 首先尝试精确匹配
  for (const [gameId, analysis] of Object.entries(analyses)) {
    const gameName = analysis.gameName || '';
    const normalized = normalizeGameName(gameName);
    
    // 精确匹配（忽略大小写和多余空格）
    if (normalized === normalizedTarget) {
      return analysis;
    }
  }
  
  // 尝试包含匹配
  for (const [gameId, analysis] of Object.entries(analyses)) {
    const gameName = analysis.gameName || '';
    const normalized = normalizeGameName(gameName);
    
    if (normalized.includes(normalizedTarget) || normalizedTarget.includes(normalized)) {
      return analysis;
    }
  }
  
  // 尝试更宽松的匹配（至少匹配核心词汇）
  const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
  for (const [gameId, analysis] of Object.entries(analyses)) {
    const gameName = analysis.gameName || '';
    const normalized = normalizeGameName(gameName);
    
    // 计算匹配词汇数
    const matchCount = targetWords.filter(w => normalized.includes(w)).length;
    if (matchCount >= Math.ceil(targetWords.length * 0.7)) {
      return analysis;
    }
  }
  
  return null;
}

// 主函数
function main() {
  console.log('开始补全文档...\n');
  
  const analyses = loadAnalyses();
  console.log(`加载了 ${Object.keys(analyses).length} 个游戏的分析数据\n`);
  
  // 处理两个目录
  const dirs = [
    path.join(DOCS_DIR, '500+评论'),
    path.join(DOCS_DIR, '200-500评论')
  ];
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;
  let totalErrors = 0;
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`目录不存在: ${dir}`);
      continue;
    }
    
    console.log(`\n处理目录: ${path.basename(dir)}`);
    console.log('='.repeat(50));
    
    const files = getMarkdownFiles(dir);
    console.log(`找到 ${files.length} 个 markdown 文件\n`);
    
    for (const filePath of files) {
      const gameName = extractGameName(filePath);
      const analysis = findGameInAnalyses(analyses, gameName);
      
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // 如果未找到分析数据，跳过
        if (!analysis) {
          console.log(`  [未找到] ${path.basename(filePath)} (解析为: "${gameName}")`);
          totalNotFound++;
          continue;
        }
        
        // 检查是否有 coreGameplay 数据
        if (!analysis.coreGameplay) {
          console.log(`  [无数据] ${path.basename(filePath)} (${analysis.gameName}) - 无 coreGameplay`);
          totalSkipped++;
          continue;
        }
        
        const coreGameplay = analysis.coreGameplay;
        
        // 检查生物收集是否为 true
        if (coreGameplay.creatureCollection !== true) {
          // 生物收集为 false 或不存在
          if (content.includes('#### 生物收集\ntrue')) {
            content = content.replace(/#### 生物收集\ntrue\r?\n/g, '#### 生物收集\nfalse\n');
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`  [更新] ${path.basename(filePath)} - 设为 false（无生物收集）`);
            totalUpdated++;
          } else {
            console.log(`  [跳过] ${path.basename(filePath)} - 生物收集不是true`);
            totalSkipped++;
          }
          continue;
        }
        
        // 检查是否有 creatureCount 内容
        if (!coreGameplay.creatureCount) {
          console.log(`  [无creatureCount] ${path.basename(filePath)} (${analysis.gameName})`);
          totalSkipped++;
          continue;
        }
        
        // 检查文档中 "#### 生物收集\ntrue\n#### 获得方式" 模式
        const pattern = /#### 生物收集\r?\ntrue\r?\n#### 获得方式/;
        const match = content.match(pattern);
        
        if (match) {
          // 需要在 "true" 和 "获得方式" 之间插入 creatureCount
          const creatureCountContent = coreGameplay.creatureCount;
          const newPattern = /(#### 生物收集\r?\ntrue\r?\n)(#### 获得方式)/;
          const newContent = content.replace(
            newPattern,
            `$1${creatureCountContent}\n\n$2`
          );
          
          fs.writeFileSync(filePath, newContent, 'utf-8');
          console.log(`  [已更新] ${path.basename(filePath)} (${analysis.gameName})`);
          totalUpdated++;
        } else {
          // 检查是否已经添加过（内容已存在）
          const bioPattern = /#### 生物收集\r?\ntrue\r?\n([^#]+)/;
          const bioMatch = content.match(bioPattern);
          if (bioMatch && bioMatch[1].trim().length > 0) {
            console.log(`  [已完善] ${path.basename(filePath)} (${analysis.gameName})`);
            totalSkipped++;
          } else {
            console.log(`  [待处理] ${path.basename(filePath)} (${analysis.gameName})`);
            totalSkipped++;
          }
        }
      } catch (e) {
        console.error(`  [错误] ${path.basename(filePath)}: ${e.message}`);
        totalErrors++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`\n完成！更新: ${totalUpdated}, 跳过: ${totalSkipped}, 未找到数据: ${totalNotFound}, 错误: ${totalErrors}`);
}

// 运行
main();
