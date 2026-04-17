# -*- coding: utf-8 -*-
"""
Steam区域评价数据采集脚本 - 优化版
从Steam API获取游戏的国内(chinese)和海外(overseas)评价数据。

性能优化：
- 异步并发请求（100并发）
- 智能限流处理（指数退避）
- 支持断点续传
- 批量处理减少API调用

使用方法:
    python scripts/fetch_regional_reviews.py              # 采集所有游戏
    python scripts/fetch_regional_reviews.py --limit 100  # 仅采集前100个有评价游戏
    python scripts/fetch_regional_reviews.py --continue  # 从断点继续采集
    python scripts/fetch_regional_reviews.py --stats     # 查看采集统计
"""

import json
import asyncio
import aiohttp
import time
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.config import DATA_DIR, REQUEST_TIMEOUT
from scripts.logging_utils import info, warn, error

# ============ 常量定义 ============

STEAM_API_BASE = "https://store.steampowered.com"
BATCH_SIZE = 100
MAX_CONCURRENT = 100
MAX_RETRIES = 3
INITIAL_DELAY = 0.05
MAX_DELAY = 60

DATA_FILE = DATA_DIR / "games-index.json"
OUTPUT_FILE = DATA_DIR / "regional-reviews.json"
CHECKPOINT_FILE = DATA_DIR / "regional-reviews-checkpoint.json"
STATE_FILE = DATA_DIR / "regional-reviews-state.json"

# ============ 异步HTTP客户端 ============

class SteamReviewFetcher:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.stats = {"success": 0, "failed": 0, "rate_limited": 0, "total_requests": 0}
        self.current_delay = INITIAL_DELAY

    async def fetch_reviews(self, appid: int, region: str) -> dict:
        # schinese = 国内评价, all = 总评价
        # 海外评价 = all - schinese
        language = "schinese" if region == "cn" else "all"
        url = f"{STEAM_API_BASE}/appreviews/{appid}"
        params = {"json": 1, "language": language, "purchase_type": "all", "filter": "all"}

        for attempt in range(MAX_RETRIES):
            try:
                async with self.session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)) as response:
                    self.stats["total_requests"] += 1

                    if response.status == 429:
                        self.stats["rate_limited"] += 1
                        self.current_delay = min(self.current_delay * 2, MAX_DELAY)
                        wait_time = self.current_delay + (attempt * 5)
                        info(f"429限流，等待 {wait_time:.1f}s: appid={appid}")
                        await asyncio.sleep(wait_time)
                        continue

                    if response.status != 200:
                        self.stats["failed"] += 1
                        return {"positive": 0, "negative": 0, "total": 0, "review_score": 0}

                    data = await response.json()

                    if data.get("success") != 1:
                        self.stats["failed"] += 1
                        return {"positive": 0, "negative": 0, "total": 0, "review_score": 0}

                    summary = data.get("query_summary", {})
                    self.stats["success"] += 1
                    self.current_delay = INITIAL_DELAY
                    return {
                        "positive": summary.get("total_positive", 0),
                        "negative": summary.get("total_negative", 0),
                        "total": summary.get("total_reviews", 0),
                        "review_score": summary.get("review_score", 0),
                        "review_score_desc": summary.get("review_score_desc", "")
                    }

            except asyncio.TimeoutError:
                self.stats["failed"] += 1
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(1)
                    continue
            except Exception as e:
                self.stats["failed"] += 1
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(1)
                    continue

        return {"positive": 0, "negative": 0, "total": 0, "review_score": 0}

    async def fetch_game_regions(self, appid: int) -> dict:
        # 并行获取国内和全部评价
        tasks = [self.fetch_reviews(appid, "cn"), self.fetch_reviews(appid, "all")]
        cn_result, all_result = await asyncio.gather(*tasks, return_exceptions=True)

        cn = cn_result if isinstance(cn_result, dict) else {"positive": 0, "negative": 0, "total": 0}
        all_data = all_result if isinstance(all_result, dict) else {"positive": 0, "negative": 0, "total": 0}

        # 海外评价 = 全部 - 国内
        overseas = {
            "positive": max(0, all_data.get("positive", 0) - cn.get("positive", 0)),
            "negative": max(0, all_data.get("negative", 0) - cn.get("negative", 0)),
            "total": max(0, all_data.get("total", 0) - cn.get("total", 0)),
            "review_score": all_data.get("review_score", 0),
            "review_score_desc": all_data.get("review_score_desc", "")
        }

        return {"cn": cn, "overseas": overseas}

# ============ 数据处理 ============

def load_games_data() -> dict:
    if not DATA_FILE.exists():
        error(f"数据文件不存在: {DATA_FILE}")
        return {}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def load_existing_reviews() -> dict:
    if not OUTPUT_FILE.exists():
        return {}
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_reviews(reviews: dict):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)
    info(f"已保存 {len(reviews)} 条区域评价数据")

def save_checkpoint(data: dict, processed_ids: set):
    checkpoint = {"timestamp": datetime.now().isoformat(), "data": data, "processed_ids": list(processed_ids)}
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False)
    info(f"检查点已保存: {len(data)} 条数据")

def load_checkpoint() -> tuple:
    if not CHECKPOINT_FILE.exists():
        return {}, set()
    with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
        checkpoint = json.load(f)
    return checkpoint.get("data", {}), set(checkpoint.get("processed_ids", []))

def save_state(state: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"last_update": None, "total_collected": 0, "stats": {}}
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# ============ 主采集逻辑 ============

async def collect_reviews_batch(fetcher: SteamReviewFetcher, appids: list) -> dict:
    tasks = [fetcher.fetch_game_regions(int(appid)) for appid in appids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    batch_results = {}
    for appid, result in zip(appids, results):
        if isinstance(result, Exception):
            batch_results[str(appid)] = {"cn": {"positive": 0, "negative": 0, "total": 0}, "overseas": {"positive": 0, "negative": 0, "total": 0}}
        else:
            batch_results[str(appid)] = result
    return batch_results

async def run_collect(limit: Optional[int], resume: bool, max_concurrent: int):
    connector = aiohttp.TCPConnector(limit=max_concurrent, force_close=True)

    existing_data = {}
    if resume:
        existing_data, processed_ids = load_checkpoint()
        info(f"从断点继续，已加载 {len(existing_data)} 条数据，已处理 {len(processed_ids)} 个")
    else:
        existing_data = load_existing_reviews()
        if existing_data:
            info(f"加载已有数据 {len(existing_data)} 条")
        processed_ids = set(existing_data.keys())

    games_data = load_games_data()
    info(f"加载游戏数据 {len(games_data)} 个")

    games_to_collect = []
    for appid, game in games_data.items():
        positive = game.get("positive", 0)
        negative = game.get("negative", 0)
        total = positive + negative
        if total < 10:
            continue
        if appid in processed_ids:
            continue
        games_to_collect.append(appid)

    info(f"需要采集 {len(games_to_collect)} 个游戏")

    if limit:
        games_to_collect = games_to_collect[:limit]
        info(f"测试模式，仅采集前 {limit} 个")

    if not games_to_collect:
        info("没有需要采集的游戏，退出")
        return existing_data

    async with aiohttp.ClientSession(connector=connector) as session:
        fetcher = SteamReviewFetcher(session)

        all_results = {**existing_data}
        collected = 0
        total_count = len(games_to_collect)
        start_time = time.time()

        for i in range(0, len(games_to_collect), BATCH_SIZE):
            batch = games_to_collect[i:i + BATCH_SIZE]

            batch_results = await collect_reviews_batch(fetcher, batch)

            for appid, result in batch_results.items():
                all_results[appid] = result
                processed_ids.add(appid)

            collected += len(batch)

            elapsed = time.time() - start_time
            rate = collected / elapsed if elapsed > 0 else 0
            remaining = (total_count - collected) / rate if rate > 0 else 0

            info(f"进度: {collected}/{total_count} ({collected/total_count*100:.1f}%) | 速率: {rate:.1f}/s | 预计剩余: {remaining/60:.1f}分钟")

            if (i // BATCH_SIZE) % 10 == 0 and collected < total_count:
                save_checkpoint(all_results, processed_ids)

        save_reviews(all_results)

        state = {
            "last_update": datetime.now().isoformat(),
            "total_collected": len(all_results),
            "stats": fetcher.stats
        }
        save_state(state)

        elapsed = time.time() - start_time
        info(f"采集完成！共 {len(all_results)} 条数据，耗时 {elapsed/60:.1f} 分钟")
        info(f"成功: {fetcher.stats['success']} | 失败: {fetcher.stats['failed']} | 限流: {fetcher.stats['rate_limited']}")

        return all_results

def merge_to_games_index():
    info("开始合并区域评价数据到 games-index.json...")

    games_data = load_games_data()
    regional_reviews = load_existing_reviews()

    merged_count = 0
    for appid, reviews in regional_reviews.items():
        if appid in games_data:
            games_data[appid]["cn_reviews"] = reviews.get("cn", {})
            games_data[appid]["overseas_reviews"] = reviews.get("overseas", {})
            merged_count += 1

    info(f"合并完成，{merged_count} 个游戏已更新区域评价数据")

    backup_file = DATA_FILE.with_suffix(".json.regional_backup")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(games_data, f, ensure_ascii=False, indent=2)
    info(f"已创建备份: {backup_file}")

    return merged_count

def print_stats():
    state = load_state()
    print("\n=== 区域评价采集统计 ===")
    print(f"最后更新: {state.get('last_update', '从未更新')}")
    print(f"已采集游戏数: {state.get('total_collected', 0)}")

    stats = state.get("stats", {})
    if stats:
        print(f"成功请求: {stats.get('success', 0)}")
        print(f"失败请求: {stats.get('failed', 0)}")
        print(f"限流次数: {stats.get('rate_limited', 0)}")

# ============ 主程序 ============

def main():
    parser = argparse.ArgumentParser(description="Steam区域评价数据采集（优化版）")
    parser.add_argument("--limit", type=int, default=None, help="限制采集数量")
    parser.add_argument("--continue", dest="continue_mode", action="store_true", help="从断点继续")
    parser.add_argument("--merge", action="store_true", help="合并到games-index.json")
    parser.add_argument("--stats", action="store_true", help="显示采集统计")
    parser.add_argument("--workers", type=int, default=MAX_CONCURRENT, help=f"并发数 (默认{MAX_CONCURRENT})")

    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if args.merge:
        merge_to_games_index()
        return

    workers = args.workers if args.workers else MAX_CONCURRENT
    info(f"使用 {workers} 并发采集")

    asyncio.run(run_collect(args.limit, args.continue_mode, workers))

if __name__ == "__main__":
    main()
