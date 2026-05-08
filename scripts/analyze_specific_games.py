# -*- coding: utf-8 -*-
"""
为指定游戏生成6模块分析
"""
import sys
import json
import asyncio
import aiohttp
import os
import time
from pathlib import Path
from datetime import datetime

# 添加脚本目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from batch_mode2_analysis import (
    load_analyses, save_analyses, get_analyzed_modules,
    ANALYSIS_MODULES, SYSTEM_PROMPTS, USER_TEMPLATES, POOL_HINTS,
    log, call_llm_async, parse_json_response, build_game_info,
    analyze_single_module,  # 添加这行
    PROJECT_ROOT, ANALYSES_FILE, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
    REQUEST_TIMEOUT, MAX_RETRIES, RETRY_DELAY
)

# 指定要分析的游戏
TARGET_APP_IDS = ['600480', '3213850']  # Megaquarium, gogh


async def analyze_game_by_id(session: aiohttp.ClientSession, game_id: str, game_data: dict):
    """分析单个游戏"""
    game_name = game_data['name']
    pool = 'B'  # 默认B池
    raw = game_data.get('raw', {})
    existing_modules = get_analyzed_modules(game_id)
    
    # 确定需要分析的模块
    missing = [m for m in ANALYSIS_MODULES if m not in existing_modules]
    if not missing:
        log(f"跳过已完成: {game_name}", "INFO")
        return {"game_id": game_id, "success": True, "skipped": True}
    
    log(f"开始分析: {game_name} ({game_id}) - 需分析 {len(missing)} 个模块", "PROG")
    
    # 并发分析所有缺失模块
    tasks = [
        analyze_single_module(session, game_id, game_name, pool, mod, build_game_info(raw))
        for mod in missing
    ]
    results = await asyncio.gather(*tasks)
    
    # 收集结果
    analysis_result = {}
    for module, result in results:
        if result:
            log(f"  OK {module}", "OK")
            analysis_result[module] = {**result, "isAnalyzed": True, "isAnalyzing": False, "error": None}
        else:
            log(f"  FAIL {module}", "FAIL")
    
    if analysis_result:
        # 更新 analyses.json
        analyses = load_analyses()
        if game_id not in analyses:
            analyses[game_id] = {
                "id": f"analysis-{game_id}-{int(time.time() * 1000)}",
                "gameId": game_id,
                "gameName": game_name,
                "pool": pool,
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat(),
                "analyzedModules": [],
            }
        
        analyses[game_id].update(analysis_result)
        analyses[game_id]["updatedAt"] = datetime.now().isoformat()
        analyses[game_id]["analyzedModules"] = list(set(
            analyses[game_id].get("analyzedModules", []) + list(analysis_result.keys())
        ))
        
        save_analyses(analyses)
        log(f"已保存: {game_name}", "OK")
        return {"game_id": game_id, "success": True, "modules": list(analysis_result.keys())}
    
    return {"game_id": game_id, "success": False}


async def main():
    print("=" * 60)
    print("为指定游戏生成6模块分析")
    print("=" * 60)
    
    # 加载B池数据
    b_pool_file = PROJECT_ROOT / "temp" / "b_pool_75pct_200reviews.json"
    with open(b_pool_file, "r", encoding="utf-8") as f:
        b_pool_games = json.load(f)
    
    # 查找目标游戏
    target_games = []
    for g in b_pool_games:
        if g['appId'] in TARGET_APP_IDS:
            target_games.append({
                'id': g['appId'],
                'name': g['name'],
                'pool': 'B',
                'raw': g
            })
    
    if not target_games:
        log("未找到目标游戏!", "FAIL")
        return
    
    log(f"找到 {len(target_games)} 个目标游戏", "INFO")
    
    async with aiohttp.ClientSession() as session:
        for game in target_games:
            await analyze_game_by_id(session, game['id'], game)
            await asyncio.sleep(2)  # 避免请求过快


if __name__ == "__main__":
    asyncio.run(main())
