# -*- coding: utf-8 -*-
"""
删除不满足条件的分析文档（精确匹配版）

条件：好评率>=75% 且 评论数>=200
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
GAMES_INDEX = PROJECT_ROOT / "public" / "data" / "games-index.json"
ANALYSES = PROJECT_ROOT / "public" / "data" / "analyses.json"

# 筛选条件
MIN_RATING = 75
MIN_REVIEWS = 200

def main():
    print("=" * 60)
    print("删除不满足条件的分析文档")
    print("条件：好评率>={}% 且 评论数>={}".format(MIN_RATING, MIN_REVIEWS))
    print("=" * 60)

    # 加载游戏数据
    print("\n加载游戏数据...")
    with open(GAMES_INDEX, "r", encoding="utf-8") as f:
        games_data = json.load(f)
    print("加载了 {} 个游戏".format(len(games_data)))

    # 加载分析数据，获取所有已分析游戏的appId
    print("加载分析数据...")
    with open(ANALYSES, "r", encoding="utf-8") as f:
        analyses_data = json.load(f)
    
    # 构建 appId -> 分析数据的映射
    # 只需要分析数据中的gameId
    analyzed_app_ids = set(analyses_data.keys())
    print("已分析游戏数: {}".format(len(analyzed_app_ids)))

    # 获取所有已生成的文档
    existing_docs = list(DOCS_DIR.glob("*.md"))
    print("已有文档总数: {}".format(len(existing_docs)))

    # 检查每个文档 - 使用分析数据中的gameId精确匹配
    delete_list = []
    keep_list = []

    for doc in existing_docs:
        doc_name = doc.stem
        
        # 尝试在analyses中找到对应的游戏
        matched_game = None
        matched_app_id = None
        
        for app_id, analysis in analyses_data.items():
            game_name = analysis.get("gameName", "")
            # 标准化比较
            if doc_name.lower().replace("_", " ").replace("&amp;", "&") == game_name.lower().replace("_", " ").replace("&amp;", "&"):
                matched_app_id = app_id
                matched_game = games_data.get(app_id, {})
                break
            # 更宽松的匹配
            if doc_name.lower().replace("_", " ").replace("  ", " ") in game_name.lower().replace("_", " ").replace("  ", " "):
                matched_app_id = app_id
                matched_game = games_data.get(app_id, {})
                break
        
        if matched_game and matched_app_id:
            # 获取评价数据
            positive = matched_game.get("positive", 0)
            negative = matched_game.get("negative", 0)
            total = positive + negative
            
            if total > 0:
                rating = round((positive / total) * 100)
            else:
                rating = 0
            
            if rating < MIN_RATING or total < MIN_REVIEWS:
                delete_list.append({
                    "doc": doc,
                    "name": matched_game.get("name", doc_name),
                    "app_id": matched_app_id,
                    "rating": rating,
                    "reviews": total
                })
            else:
                keep_list.append({
                    "doc": doc,
                    "name": matched_game.get("name", doc_name),
                    "app_id": matched_app_id,
                    "rating": rating,
                    "reviews": total
                })
        else:
            # 可能是原生文档（如Rune Factory）
            if "Rune Factory" in doc_name:
                print("  保留(原生): {}".format(doc_name))
                keep_list.append({"doc": doc, "name": doc_name, "rating": "N/A", "reviews": "N/A"})
            else:
                print("  警告(未匹配): {}".format(doc_name))
                # 保留未匹配的文档
                keep_list.append({"doc": doc, "name": doc_name, "rating": "?", "reviews": "?"})

    print("\n需要删除的文档: {} 个".format(len(delete_list)))
    print("需要保留的文档: {} 个".format(len(keep_list)))

    # 显示删除列表
    if delete_list:
        print("\n=== 将删除的文档 ===")
        for item in sorted(delete_list, key=lambda x: (x["rating"] if isinstance(x["rating"], int) else 0, x["reviews"] if isinstance(x["reviews"], int) else 0)):
            print("  [删除] {} (好评率{}%, 评论数{})".format(item["name"], item["rating"], item["reviews"]))

    # 执行删除
    print("\n执行删除...")
    deleted_count = 0
    for item in delete_list:
        try:
            item["doc"].unlink()
            print("  已删除: {}".format(item["name"]))
            deleted_count += 1
        except Exception as e:
            print("  删除失败: {} - {}".format(item["name"], e))

    print("\n删除完成! 共删除 {} 个文档".format(deleted_count))

    # 统计保留的文档
    print("保留 {} 个文档".format(len(keep_list)))

    # 重新统计
    remaining = list(DOCS_DIR.glob("*.md"))
    print("目录下剩余文档: {} 个".format(len(remaining)))

if __name__ == "__main__":
    main()
