# -*- coding: utf-8 -*-
"""
模式2 宝可梦Like 轻量级批量判定脚本

功能：只判定游戏是否为宝可梦Like，不需要6个模块的完整分析

使用方法：
  python scripts/batch_pokemon_like_judge.py              # 批量判定
  python scripts/batch_pokemon_like_judge.py --limit 10  # 测试10款
  python scripts/batch_pokemon_like_judge.py --resume     # 断点续传
  python scripts/batch_pokemon_like_judge.py --dry-run    # 仅预览
  python scripts/batch_pokemon_like_judge.py --input <json文件>  # 从文件读取游戏列表
"""

import json
import time
import os
import sys
import re
import argparse
import asyncio
import aiohttp
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(r"D:\Steam全域游戏搜索")
DATA_DIR = PROJECT_ROOT / "public" / "data"
CACHE_FILE = DATA_DIR / "games-index.json"
JUDGE_CACHE_FILE = DATA_DIR / "pokemon-like-judge-cache.json"
PROGRESS_FILE = PROJECT_ROOT / "temp" / "pokemon_judge_progress.json"

# ==================== 加载 .env 文件 ====================
ENV_FILE = PROJECT_ROOT / ".env"
if ENV_FILE.exists():
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

# ==================== API配置 ====================
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://us.novaiapi.com/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "[次]gemini-3.1-pro-preview-thinking")

# ==================== 并发配置 ====================
CONCURRENT_GAMES = 5         # 同时判定的游戏数
REQUEST_TIMEOUT = 120        # 请求超时（秒）
MAX_RETRIES = 2             # 最大重试次数
RETRY_DELAY = 10            # 重试间隔（秒）

# ==================== 判定提示词模板 ====================
SYSTEM_PROMPT = """你是一个专业的游戏品类分析师，专门判断游戏是否是"宝可梦Like"游戏。

【宝可梦Like游戏定义】
宝可梦Like游戏是指那些核心玩法与《宝可梦》系列相似的游戏，具有以下关键特征：

1. 【收集系统】玩家可以收集、捕获野生或可捕捉的生物/怪物/宠物
2. 【养成系统】玩家可以培养、训练这些生物（进化、等阶、技能、性格等）
3. 【回合战斗】使用收集的生物进行回合制战斗
4. 【闭环循环】形成"收集→养成→战斗→进化→再收集"的玩法闭环

【判定标准】
- 高置信度(80-100): 具备完整的"收集+养成+回合战斗"闭环，且生物是核心交互对象
- 中置信度(50-79): 具备其中2-3个核心特征，但可能不完整
- 低置信度(20-49): 只有1个核心特征，或特征不够明显
- 非宝可梦Like(0-19): 不具备上述特征，或生物只是辅助元素

【重要区分】
- "Monster Hunter"不是宝可梦Like（玩家不是收集/养成怪物，怪物是敌人）
- "Palworld"是宝可梦Like（可以收集、养成、战斗）
- "Stardew Valley"的农场动物不是宝可梦Like（没有回合战斗）
- 带有"Creature Collector"标签的游戏通常是宝可梦Like

请根据提供的数据进行判断，不要猜测你没有看到的信息。"""

USER_TEMPLATE = """请分析以下游戏是否为宝可梦Like游戏：

【游戏基本信息】
- 游戏名: {name}
- 标签: {tags}
- 类型: {genres}
- 简短描述: {description}

请输出JSON格式的判定结果：
{{
  "isPokemonLike": true/false,
  "confidence": 0-100的数字,
  "confidenceLevel": "high"/"medium"/"low",
  "matchingFeatures": ["匹配到的特征列表"],
  "missingFeatures": ["缺失的特征列表"],
  "reasons": "详细的分析理由（50字以上）"
}}"""


def load_games_from_file(file_path: str) -> List[Dict[str, Any]]:
    """从文件加载目标游戏列表"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [>] 从文件加载游戏列表: {file_path}")

    file_path_obj = Path(file_path)
    if not file_path_obj.exists():
        print(f"[!] 文件不存在: {file_path}")
        return []

    try:
        with open(file_path_obj, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 支持多种格式
        if isinstance(data, dict) and "games" in data:
            games_list = data["games"]
        elif isinstance(data, dict) and "results" in data:
            games_list = data["results"]
        elif isinstance(data, dict):
            # 尝试提取游戏数组
            for key in ["data", "items", "list"]:
                if key in data and isinstance(data[key], list):
                    games_list = data[key]
                    break
            else:
                games_list = list(data.values()) if data else []
        elif isinstance(data, list):
            games_list = data
        else:
            games_list = []

        print(f"    加载了 {len(games_list)} 款游戏")
        return games_list

    except Exception as e:
        print(f"[!] 加载文件失败: {e}")
        return []


def load_games():
    """加载游戏数据（向后兼容，默认使用games-index.json）"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [>] 加载游戏数据...")

    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        games_data = json.load(f)

    # 获取游戏列表
    if isinstance(games_data, dict):
        games_list = list(games_data.values())
    elif isinstance(games_data, list):
        games_list = games_data
    else:
        print(f"[!] 未知的数据格式: {type(games_data)}")
        return []

    print(f"    总共 {len(games_list)} 款游戏")

    # 筛选宝可梦Like候选游戏（根据标签和类型）
    pokemon_like_candidates = []
    pokemon_like_keywords = [
        "Creature Collector", "Monster Catching", "Monster Taming",
        "宠物", "养成", "怪物", "精灵", "生物"
    ]

    for game in games_list:
        tags = game.get("tags", [])
        genres = game.get("genres", [])
        categories = game.get("categories", [])

        # 转换为字符串便于匹配
        all_text = " ".join(str(t) for t in tags) + " " + " ".join(str(g) for g in genres) + " " + " ".join(str(c) for c in categories)

        # 检查是否有关键词
        matched = False
        for keyword in pokemon_like_keywords:
            if keyword.lower() in all_text.lower():
                matched = True
                break

        if matched:
            pokemon_like_candidates.append(game)

    print(f"    宝可梦Like候选: {len(pokemon_like_candidates)} 款")

    return pokemon_like_candidates


def load_judge_cache():
    """加载判定缓存"""
    if not JUDGE_CACHE_FILE.exists():
        return {}

    try:
        with open(JUDGE_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[!] 加载缓存失败: {e}")
        return {}


def save_judge_cache(cache):
    """保存判定缓存"""
    with open(JUDGE_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def get_unjudged_games(candidates, cache):
    """获取未判定的游戏"""
    unjudged = []
    for game in candidates:
        app_id = str(game.get("app_id") or game.get("id") or game.get("steamAppId", ""))
        if app_id not in cache:
            unjudged.append(game)
    return unjudged


async def judge_single_game(session, game, semaphore, retry_count=0):
    """判定单个游戏"""
    async with semaphore:
        app_id = str(game.get("app_id") or game.get("id") or game.get("steamAppId", ""))
        name = game.get("name", "Unknown")
        tags = game.get("tags", [])[:20]
        genres = game.get("genres", [])
        description = game.get("short_description", game.get("description", ""))[:500]

        user_prompt = USER_TEMPLATE.format(
            name=name,
            tags=", ".join(tags) or "无",
            genres=", ".join(genres) or "无",
            description=description or "无"
        )

        payload = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1000
        }

        headers = {
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            async with session.post(
                f"{LLM_BASE_URL}/chat/completions",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise Exception(f"API错误 {resp.status}: {error_text[:200]}")

                result = await resp.json()
                content = result["choices"][0]["message"]["content"]

                # 解析JSON结果
                # 提取JSON部分
                json_match = re.search(r'\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}', content, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                    parsed = json.loads(json_str)
                    return {
                        "gameId": app_id,
                        "gameName": name,
                        "isPokemonLike": bool(parsed.get("isPokemonLike", False)),
                        "confidence": int(parsed.get("confidence", 0)),
                        "confidenceLevel": parsed.get("confidenceLevel", "low"),
                        "matchingFeatures": parsed.get("matchingFeatures", []),
                        "missingFeatures": parsed.get("missingFeatures", []),
                        "reasons": parsed.get("reasons", ""),
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    # 尝试直接解析整个content
                    parsed = json.loads(content)
                    return {
                        "gameId": app_id,
                        "gameName": name,
                        "isPokemonLike": bool(parsed.get("isPokemonLike", False)),
                        "confidence": int(parsed.get("confidence", 0)),
                        "confidenceLevel": parsed.get("confidenceLevel", "low"),
                        "matchingFeatures": parsed.get("matchingFeatures", []),
                        "missingFeatures": parsed.get("missingFeatures", []),
                        "reasons": parsed.get("reasons", ""),
                        "timestamp": datetime.now().isoformat()
                    }

        except Exception as e:
            if retry_count < MAX_RETRIES:
                print(f"    [!] {name} 判定失败，将重试 ({retry_count + 1}/{MAX_RETRIES})")
                await asyncio.sleep(RETRY_DELAY)
                return await judge_single_game(session, game, semaphore, retry_count + 1)
            else:
                print(f"    [X] {name} 判定失败: {e}")
                return {
                    "gameId": app_id,
                    "gameName": name,
                    "isPokemonLike": False,
                    "confidence": 0,
                    "confidenceLevel": "low",
                    "matchingFeatures": [],
                    "missingFeatures": [],
                    "reasons": f"判定失败: {str(e)[:200]}",
                    "timestamp": datetime.now().isoformat(),
                    "error": True
                }


async def batch_judge_games(games, limit=None, concurrent=CONCURRENT_GAMES):
    """批量判定游戏"""
    if limit:
        games = games[:limit]

    print(f"[{datetime.now().strftime('%H:%M:%S')}] [>] 开始LLM宝可梦Like判定...")
    print(f"    目标: {len(games)} 款游戏")
    print(f"    并发: {concurrent} 款")

    # 加载缓存
    cache = load_judge_cache()

    # 过滤已判定的
    unjudged = get_unjudged_games(games, cache)
    already_done = len(games) - len(unjudged)
    print(f"    已判定: {already_done} 款")
    print(f"    待判定: {len(unjudged)} 款")

    if not unjudged:
        print("[*] 所有游戏已判定完成！")
        return cache

    semaphore = asyncio.Semaphore(concurrent)

    start_time = time.time()
    results = []

    async with aiohttp.ClientSession() as session:
        tasks = []
        for i, game in enumerate(unjudged):
            task = asyncio.create_task(judge_single_game(session, game, semaphore))
            tasks.append((i + 1, len(unjudged), task))

        for i, total, task in tasks:
            result = await task
            results.append(result)

            # 更新缓存
            cache[result["gameId"]] = result
            save_judge_cache(cache)

            # 输出进度
            elapsed = time.time() - start_time
            avg_time = elapsed / i
            remaining = avg_time * (total - i)
            status = "[OK]" if not result.get("error") else "[X]"

            print(f"    {status} [{i}/{total}] {result['gameName']} -> "
                  f"isPokemonLike={result['isPokemonLike']}, confidence={result['confidence']}")

    # 统计结果
    total_time = time.time() - start_time
    success_count = sum(1 for r in results if not r.get("error"))
    fail_count = len(results) - success_count
    pokemon_like_count = sum(1 for r in results if r.get("isPokemonLike"))

    print(f"\n{'='*60}")
    print(f"判定完成!")
    print(f"  成功: {success_count} 款")
    print(f"    - 宝可梦Like: {pokemon_like_count} 款")
    print(f"    - 非宝可梦Like: {success_count - pokemon_like_count} 款")
    print(f"  失败: {fail_count} 款")
    print(f"  总耗时: {total_time:.1f} 秒 ({total_time/60:.1f} 分钟)")
    print(f"  缓存已保存至: {JUDGE_CACHE_FILE}")
    print(f"{'='*60}")

    return cache


def print_summary(cache):
    """打印判定结果汇总"""
    total = len(cache)
    pokemon_like = sum(1 for r in cache.values() if r.get("isPokemonLike"))

    print(f"\n{'='*60}")
    print(f"判定结果汇总 (共 {total} 款)")
    print(f"  宝可梦Like: {pokemon_like} 款 ({pokemon_like/total*100:.1f}%)")
    print(f"  非宝可梦Like: {total - pokemon_like} 款 ({(total-pokemon_like)/total*100:.1f}%)")
    print(f"{'='*60}")

    # 按置信度分组
    high = sum(1 for r in cache.values() if r.get("confidenceLevel") == "high")
    medium = sum(1 for r in cache.values() if r.get("confidenceLevel") == "medium")
    low = sum(1 for r in cache.values() if r.get("confidenceLevel") == "low")

    print(f"\n置信度分布:")
    print(f"  高置信度: {high} 款")
    print(f"  中置信度: {medium} 款")
    print(f"  低置信度: {low} 款")

    # 显示高置信度的宝可梦Like游戏
    print(f"\n高置信度宝可梦Like游戏:")
    high_confidence = [(k, v) for k, v in cache.items()
                       if v.get("isPokemonLike") and v.get("confidenceLevel") == "high"]
    for app_id, result in sorted(high_confidence, key=lambda x: x[1].get("confidence", 0), reverse=True)[:20]:
        print(f"  [{result['confidence']}] {result['gameName']}")


def main():
    parser = argparse.ArgumentParser(description="模式2宝可梦Like轻量级判定脚本")
    parser.add_argument("--limit", "-l", type=int, default=None, help="限制分析数量")
    parser.add_argument("--resume", "-r", action="store_true", help="从缓存继续分析未判定的游戏")
    parser.add_argument("--dry-run", "-d", action="store_true", help="仅预览待判定游戏")
    parser.add_argument("--workers", "-w", type=int, default=CONCURRENT_GAMES, help=f"并发数 (默认{CONCURRENT_GAMES})")
    parser.add_argument("--summary", "-s", action="store_true", help="仅显示汇总信息")
    parser.add_argument("--input", "-i", type=str, default=None, help="从JSON文件读取目标游戏列表")
    parser.add_argument("--pool", "-p", type=str, choices=["A", "B", "C", "ALL"], default="ALL", help="筛选池子 (默认ALL)")
    args = parser.parse_args()

    # 确保temp目录存在
    PROJECT_ROOT.joinpath("temp").mkdir(exist_ok=True)

    # 加载游戏数据
    if args.input:
        # 从指定文件加载
        candidates = load_games_from_file(args.input)
    else:
        # 默认加载方式
        candidates = load_games()

    # 加载缓存
    cache = load_judge_cache()

    if args.summary:
        print_summary(cache)
        return

    if args.dry_run:
        unjudged = get_unjudged_games(candidates, cache)
        print(f"\n待判定游戏 ({len(unjudged)} 款):")
        for i, game in enumerate(unjudged[:50], 1):
            name = game.get("name", "Unknown")
            print(f"  [{i}] {name}")
        if len(unjudged) > 50:
            print(f"  ... 还有 {len(unjudged) - 50} 款")
        return

    # 确定要分析的游戏
    if args.resume:
        # 从缓存中获取未判定的
        unjudged = get_unjudged_games(candidates, cache)
        games_to_analyze = unjudged[:args.limit] if args.limit else unjudged
    else:
        # 只分析未判定的
        unjudged = get_unjudged_games(candidates, cache)
        games_to_analyze = unjudged[:args.limit] if args.limit else unjudged

    if not games_to_analyze:
        print("[*] 没有需要判定的游戏")
        print_summary(cache)
        return

    # 执行批量判定
    asyncio.run(batch_judge_games(games_to_analyze, args.limit, args.workers))

    # 打印汇总
    cache = load_judge_cache()
    print_summary(cache)


if __name__ == "__main__":
    main()
