#!/usr/bin/env python3
"""
构建 games-meta.json 文件
========================
从 games.json 提取详情页需要的字段（description、about_the_game）
使用 Python 高效处理大 JSON 文件

用法: python scripts/build-games-meta.py
"""

import json
import os
import sys
import time
from pathlib import Path

def main():
    # 文件路径
    cwd = Path.cwd()
    games_file = cwd / "public" / "data" / "games.json"
    output_file = cwd / "public" / "data" / "games-meta.json"

    print("=== 构建 games-meta.json ===\n")

    if not games_file.exists():
        print(f"源文件不存在: {games_file}")
        sys.exit(1)

    file_size = games_file.stat().st_size / (1024 * 1024)
    print(f"源文件: {file_size:.1f} MB\n")

    print("读取 games.json...")
    start_time = time.time()

    # 使用 ijson 进行流式解析（如果可用）
    try:
        import ijson

        print("使用 ijson 流式解析...")
        meta = {}

        with open(games_file, "r", encoding="utf-8") as f:
            # ijson 会逐层解析
            parser = ijson.parse(f)
            current_app_id = None
            current_desc = ""
            current_about = ""
            last_key = None

            for prefix, event, value in parser:
                if prefix == "" and event == "map_key":
                    current_app_id = value
                    current_desc = ""
                    current_about = ""

                elif prefix == f"{current_app_id}.detailed_description" and event == "string":
                    current_desc = value

                elif prefix == f"{current_app_id}.about_the_game" and event == "string":
                    current_about = value

                elif prefix == current_app_id and event == "end_map":
                    if current_app_id:
                        meta[current_app_id] = {
                            "description": current_desc,
                            "aboutTheGame": current_about
                        }

        print(f"解析完成，耗时 {time.time() - start_time:.1f}s\n")

    except ImportError:
        print("ijson 未安装，使用标准 JSON（可能较慢）...")
        print("建议安装: pip install ijson\n")

        with open(games_file, "r", encoding="utf-8") as f:
            games = json.load(f)

        meta = {}
        for app_id, game in games.items():
            meta[app_id] = {
                "description": game.get("detailed_description", ""),
                "aboutTheGame": game.get("about_the_game", "")
            }

        print(f"加载完成，耗时 {time.time() - start_time:.1f}s\n")

    print("写入 games-meta.json...")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)

    output_size = output_file.stat().st_size / (1024 * 1024)
    total_games = len(meta)
    with_desc = sum(1 for m in meta.values() if m["description"])
    avg_len = sum(len(m["description"]) for m in meta.values()) / total_games if total_games > 0 else 0

    print("\n完成！")
    print("==========")
    print(f"  总游戏数: {total_games:,}")
    print(f"  有描述: {with_desc:,} ({with_desc / total_games * 100:.1f}%)")
    print(f"  平均描述长度: {avg_len:.0f} 字符")
    print(f"  文件大小: {output_size:.1f} MB")
    print(f"  压缩比: {file_size / output_size:.1f}x")

if __name__ == "__main__":
    main()
