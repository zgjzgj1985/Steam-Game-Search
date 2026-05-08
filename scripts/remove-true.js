/**
 * 删除文档中生物收集标题下的 "true" 
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(projectRoot, 'docs', 'LLM详细分析宝可梦like案例');

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

function main() {
  const dirs = [
    path.join(DOCS_DIR, '500+评论'),
    path.join(DOCS_DIR, '200-500评论')
  ];

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    console.log(`\n处理目录: ${path.basename(dir)}`);
    console.log('='.repeat(50));
    
    const files = getMarkdownFiles(dir);
    
    for (const filePath of files) {
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // 匹配 "#### 生物收集\ntrue\n" 模式（换行符可能是 \r\n 或 \n）
        const pattern = /(#### 生物收集\r?\n)true(\r?\n)/;
        
        if (pattern.test(content)) {
          content = content.replace(pattern, '$1$2');
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`  [已删除] ${path.basename(filePath)}`);
          totalUpdated++;
        } else {
          console.log(`  [跳过] ${path.basename(filePath)} - 无需修改`);
          totalSkipped++;
        }
      } catch (e) {
        console.error(`  [错误] ${path.basename(filePath)}: ${e.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n完成！更新: ${totalUpdated}, 跳过: ${totalSkipped}`);
}

main();
