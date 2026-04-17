"""
Steam区域评价数据采集脚本
===========================
从Steam API获取游戏的国内(chinese)和海外(overseas)评价数据。

Steam API 支持通过 language 参数区分评价来源：
- language=schinese 或 language=zh_cn -> 国内评价
- language=all - exclude_language=schinese -> 海外评价

采集后的数据用于模式2筛选系统，支持按国内/海外评价分别计算好评率和威尔逊得分。

使用方法:
    python scripts/fetch_regional_reviews.py              # 采集所有游戏
    python scripts/fetch_regional_reviews.py --limit 100  # 仅采集前100个有评价游戏（测试用）
    python scripts/fetch_regional_reviews.py --continue    # 从断点继续采集
"""

import json
import time
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
import threading

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.config import DATA_DIR, STEAM_API_BASE, REQUEST_DELAY, REQUEST_TIMEOUT
from scripts.logging_utils import get_logger

logger = get_logger("regional_reviews")

# ============ 常量定义 ============

# 区域评价类型
REGION_TYPES = {
    "cn": {
        "name": "国内评价",
        "language": "schinese",
        "file_key": "cn"
    },
    "overseas": {
        "name": "海外评价",
        "language": "all_exclude_schinese",
        "file_key": "overseas"
    }
}

# 数据文件路径
DATA_FILE = DATA_DIR / "games-index.json"
OUTPUT_FILE = DATA_DIR / "regional-reviews.json"
CHECKPOINT_FILE = DATA_DIR / "regional-reviews-checkpoint.json"

# 采集状态文件
STATE_FILE = DATA_DIR / "regional-reviews-state.json"

# 并发数
MAX_WORKERS = 8  # 8并发采集

# ============ API请求 ============

def fetch_regional_reviews(appid: int, region: str) -> Optional[dict]:
    """
    获取游戏指定区域的评价数据
    
    Args:
        appid: Steam游戏ID
        region: 区域类型 ("cn" 或 "overseas")
    
    Returns:
        评价数据字典，包含 positive, negative, total_reviews
        失败返回 None
    """
    region_config = REGION_TYPES.get(region)
    if not region_config:
        return None
    
    language = region_config["language"]
    url = f"{STEAM_API_BASE}/appreviews/{appid}"
    params = {
        "json": 1,
        "language": language,
        "purchase_type": "all",
        "filter": "all",
        "day_range": "365"  # 最近一年
    }
    
    try:
        import requests
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        
        if response.status_code == 429:
            logger.warning(f"API限流，等待后重试: appid={appid}")
            time.sleep(5)
            return fetch_regional_reviews(appid, region)  # 重试
        
        if response.status_code != 200:
            logger.warning(f"请求失败 [{response.status_code}]: appid={appid}")
            return None
        
        data = response.json()
        
        if data.get("success") != 1:
            return None
        
        summary = data.get("query_summary", {})
        
        return {
            "positive": summary.get("total_positive", 0),
            "negative": summary.get("total_negative", 0),
            "total": summary.get("total_reviews", 0),
            "review_score": summary.get("review_score", 0),
            "review_score_desc": summary.get("review_score_desc", "")
        }
        
    except Exception as e:
        logger.warning(f"获取评价失败: appid={appid}, error={e}")
        return None

# ============ 数据加载/保存 ============

def load_games_data() -> dict:
    """加载游戏数据"""
    if not DATA_FILE.exists():
        logger.error(f"数据文件不存在: {DATA_FILE}")
        return {}
    
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_regional_reviews(reviews: dict, filepath: Path):
    """保存区域评价数据"""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)
    logger.info(f"已保存 {len(reviews)} 条区域评价数据到 {filepath}")

def load_regional_reviews(filepath: Path) -> dict:
    """加载已有区域评价数据"""
    if not filepath.exists():
        return {}
    
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def save_checkpoint(data: dict):
    """保存检查点"""
    checkpoint = {
        "timestamp": datetime.now().isoformat(),
        "data": data
    }
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False)
    logger.debug(f"检查点已保存: {len(data)} 条数据")

def load_checkpoint() -> tuple[dict, set]:
    """加载检查点，返回(数据字典, 已处理appid集合)"""
    data = load_regional_reviews(CHECKPOINT_FILE)
    processed_ids = set(data.keys())
    return data, processed_ids

def save_state(state: dict):
    """保存采集状态"""
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def load_state() -> dict:
    """加载采集状态"""
    if not STATE_FILE.exists():
        return {"last_update": None, "total_collected": 0, "stats": {}}
    
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# ============ 采集逻辑 ============

def collect_game_reviews(appid: str, game_data: dict) -> tuple[str, dict]:
    """
    采集单个游戏的国内和海外评价数据
    
    Returns:
        (appid, {"cn": {...}, "overseas": {...}})
    """
    reviews = {}
    
    for region in REGION_TYPES.keys():
        result = fetch_regional_reviews(int(appid), region)
        if result:
            reviews[region] = result
        else:
            # 如果请求失败，记录空数据
            reviews[region] = {"positive": 0, "negative": 0, "total": 0}
        
        # API限流保护
        time.sleep(REQUEST_DELAY)
    
    return appid, reviews

def collect_all_reviews(
    limit: Optional[int] = None,
    skip_existing: bool = True,
    resume: bool = False
) -> dict:
    """
    批量采集所有游戏的区域评价数据
    
    Args:
        limit: 限制采集数量（用于测试）
        skip_existing: 跳过已有数据的游戏
        resume: 从断点继续
    """
    # 加载已有数据
    existing_data = {}
    if resume:
        existing_data, _ = load_checkpoint()
        logger.info(f"从断点继续，已加载 {len(existing_data)} 条数据")
    else:
        existing_data = load_regional_reviews(OUTPUT_FILE)
        if existing_data:
            logger.info(f"加载已有数据 {len(existing_data)} 条")
    
    # 加载游戏数据
    games_data = load_games_data()
    logger.info(f"加载游戏数据 {len(games_data)} 个")
    
    # 筛选需要采集的游戏（只采集有评价的游戏，避免浪费）
    games_to_collect = []
    for appid, game in games_data.items():
        positive = game.get("positive", 0)
        negative = game.get("negative", 0)
        total = positive + negative
        
        # 只采集有评价的游戏
        if total < 10:  # 至少10条评价
            continue
        
        # 跳过已有数据
        if skip_existing and appid in existing_data:
            continue
        
        games_to_collect.append((appid, game))
    
    logger.info(f"需要采集 {len(games_to_collect)} 个游戏")
    
    if limit:
        games_to_collect = games_to_collect[:limit]
        logger.info(f"测试模式，仅采集前 {limit} 个")
    
    if not games_to_collect:
        logger.info("没有需要采集的游戏，退出")
        return existing_data
    
    # 批量采集
    collected = 0
    total = len(games_to_collect)
    start_time = time.time()
    
    results = {}
    
    def process_game(appid: str, game: dict) -> tuple[str, dict]:
        """处理单个游戏"""
        return collect_game_reviews(appid, game)
    
    # 使用线程池并发采集
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_game, appid, game): appid 
            for appid, game in games_to_collect
        }
        
        for future in as_completed(futures):
            appid = futures[future]
            try:
                result_appid, reviews = future.result()
                results[result_appid] = reviews
                collected += 1
                
                # 进度报告
                if collected % 50 == 0 or collected == total:
                    elapsed = time.time() - start_time
                    rate = collected / elapsed if elapsed > 0 else 0
                    remaining = (total - collected) / rate if rate > 0 else 0
                    logger.info(
                        f"进度: {collected}/{total} ({collected/total*100:.1f}%) "
                        f"| 速率: {rate:.1f}/s | 预计剩余: {remaining/60:.1f}分钟"
                    )
                
                # 每100个游戏保存一次检查点
                if collected % 100 == 0:
                    # 合并已有数据和新增数据
                    checkpoint_data = {**existing_data, **results}
                    save_checkpoint(checkpoint_data)
                    results = {}  # 清空已保存的数据，释放内存
                
            except Exception as e:
                logger.error(f"处理游戏 {appid} 失败: {e}")
    
    # 保存最终结果
    final_data = {**existing_data, **results}
    save_regional_reviews(final_data, OUTPUT_FILE)
    
    # 更新状态
    state = {
        "last_update": datetime.now().isoformat(),
        "total_collected": len(final_data),
        "stats": {
            "total_games": len(games_data),
            "with_reviews": sum(1 for g in games_data.values() if g.get("positive", 0) + g.get("negative", 0) >= 10),
            "collected": len(final_data)
        }
    }
    save_state(state)
    
    elapsed = time.time() - start_time
    logger.info(f"采集完成！共 {len(final_data)} 条数据，耗时 {elapsed/60:.1f} 分钟")
    
    return final_data

def merge_to_games_index():
    """
    将区域评价数据合并到 games-index.json
    这会让数据在API中可用
    """
    logger.info("开始合并区域评价数据到 games-index.json...")
    
    # 加载数据
    games_data = load_games_data()
    regional_reviews = load_regional_reviews(OUTPUT_FILE)
    
    merged_count = 0
    
    for appid, reviews in regional_reviews.items():
        if appid in games_data:
            # 合并区域评价数据
            games_data[appid]["cn_reviews"] = reviews.get("cn", {})
            games_data[appid]["overseas_reviews"] = reviews.get("overseas", {})
            merged_count += 1
    
    logger.info(f"合并完成，{merged_count} 个游戏已更新区域评价数据")
    
    # 保存更新后的games-index.json
    backup_file = DATA_FILE.with_suffix(".json.regional_backup")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(games_data, f, ensure_ascii=False, indent=2)
    logger.info(f"已创建备份: {backup_file}")
    
    return merged_count

def print_stats():
    """打印采集统计"""
    state = load_state()
    print("\n=== 区域评价采集统计 ===")
    print(f"最后更新: {state.get('last_update', '从未更新')}")
    print(f"已采集游戏数: {state.get('total_collected', 0)}")
    
    stats = state.get("stats", {})
    print(f"总游戏数: {stats.get('total_games', 0)}")
    print(f"有评价游戏: {stats.get('with_reviews', 0)}")
    print(f"已采集: {stats.get('collected', 0)}")

# ============ 主程序 ============

def main():
    parser = argparse.ArgumentParser(description="Steam区域评价数据采集")
    parser.add_argument("--limit", type=int, default=None, help="限制采集数量（用于测试）")
    parser.add_argument("--continue", dest="continue_mode", action="store_true", 
                        help="从断点继续采集")
    parser.add_argument("--merge", action="store_true", 
                        help="合并到games-index.json")
    parser.add_argument("--stats", action="store_true", 
                        help="显示采集统计")
    
    args = parser.parse_args()
    
    if args.stats:
        print_stats()
        return
    
    if args.merge:
        merge_to_games_index()
        return
    
    # 执行采集
    collect_all_reviews(
        limit=args.limit,
        skip_existing=True,
        resume=args.continue_mode
    )

if __name__ == "__main__":
    main()
