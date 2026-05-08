# -*- coding: utf-8 -*-
"""
重命名文档以正确匹配游戏名
"""

import json
import os
import sys
from pathlib import Path

# 设置输出编码
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(r"D:\Steam全域游戏搜索")
DOCS_DIR = PROJECT_ROOT / "docs" / "LLM详细分析宝可梦like案例"
ANALYSES_FILE = PROJECT_ROOT / "public" / "data" / "analyses.json"

def main():
    print("=" * 60)
    print("重命名文档以正确匹配")
    print("=" * 60)
    
    # 加载分析数据
    with open(ANALYSES_FILE, "r", encoding="utf-8") as f:
        analyses = json.load(f)
    
    # 文件名映射
    rename_map = {
        "Atrio_ The Dark Wild": "Atrio: The Dark Wild",
        "Bloomtown_ A Different Story": "Bloomtown: A Different Story",
        "Forgotten Realms_ The Archives - Collection One": "Forgotten Realms: The Archives - Collection One",
        "FurryFury_ Smash & Roll": "FurryFury: Smash & Roll",
        "moon_ Remix RPG Adventure": "moon: Remix RPG Adventure",
    }
    
    # 获取目录下的文档
    files = list(DOCS_DIR.glob("*.md"))
    print("当前文档数: {}".format(len(files)))
    
    renamed_count = 0
    for doc in files:
        old_name = doc.stem
        if old_name in rename_map:
            new_name = rename_map[old_name]
            new_path = DOCS_DIR / "{}.md".format(new_name)
            
            # 重命名
            doc.rename(new_path)
            print("重命名: {} -> {}".format(old_name, new_name))
            renamed_count += 1
    
    print("\n共重命名 {} 个文档".format(renamed_count))
    
    # 统计
    remaining = list(DOCS_DIR.glob("*.md"))
    print("目录下剩余文档: {} 个".format(len(remaining)))

if __name__ == "__main__":
    main()
