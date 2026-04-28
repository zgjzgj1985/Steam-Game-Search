# -*- coding: utf-8 -*-
"""
A 池游戏 LLM 标签批量生成脚本

功能：为 A 池中缺少 LLM 标签的游戏生成创新玩法标签
使用方法：python scripts/batch_generate_llm_tags.py [--limit N] [--pool A|B|C]

依赖：
  - requests (LLM API 调用)
  - json, time, os, sys (标准库)

配置：
  - 设置环境变量 LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
  - 或创建 .env 文件配置
"""
import json
import time
import sys
import os
import re
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

# ==================== 标签验证 ====================
# Prompt要求LLM翻译标签，Python只做验证不翻译
# 翻译风格：中英混合，保留英文缩写

def is_chinese(text: str) -> bool:
    """判断文本是否包含中文字符"""
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def is_valid_tag(text: str) -> bool:
    """验证标签是否符合要求：包含中文或英文缩写"""
    if not text:
        return False
    # 必须有中文，或者全部是英文缩写（大写为主）
    if is_chinese(text):
        return True
    # 纯英文缩写（如MMO、CRPG）
    words = re.findall(r'[a-zA-Z]+', text)
    return all(len(w) <= 5 and w.isupper() for w in words) and len(words) > 0

def ensure_chinese_tags(tags: list) -> list:
    """确保标签有效。Prompt已要求翻译，直接使用结果。"""
    result = []
    for t in tags:
        if t and is_valid_tag(t):
            result.append(t)
    return result

# ==================== 加载 .env 文件 ====================
ENV_FILE = Path(__file__).parent.parent / ".env"
if ENV_FILE.exists():
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

# ==================== 配置 ====================
DEFAULT_CONFIG = {
    # OpenRouter 配置
    "api_key": os.environ.get("LLM_API_KEY", ""),
    "base_url": os.environ.get("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
    "model": os.environ.get("LLM_MODEL", "google/gemini-2.5-pro-preview"),
    # 备选：通义千问配置
    # "api_key": os.environ.get("DASHSCOPE_API_KEY", ""),
    # "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    # "model": "qwen3.6-plus",
}

# 每次请求处理的游戏数量
BATCH_SIZE = 5

# 请求间隔（秒），避免 API 限流
REQUEST_DELAY = 2

# 最大重试次数
MAX_RETRIES = 3

# 连续失败后等待时间（秒）
FAILURE_COOLDOWN = 60

# 连续失败阈值，超过后暂停更久
CONSECUTIVE_FAILURES_THRESHOLD = 3
LONG_COOLDOWN = 180  # 3分钟

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(r"D:\Steam全域游戏搜索")
DATA_DIR = PROJECT_ROOT / "public" / "data"
CACHE_FILE = DATA_DIR / "games-cache.json"
COMBINED_FILE = DATA_DIR / "combinedMechanics.json"
BACKUP_FILE = DATA_DIR / "combinedMechanics.json.bak_batch"

# ==================== 日志 ====================
def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    prefixes = {"INFO": "  ", "OK": "[OK]", "WARN": "[!]", "FAIL": "[X]", "PROG": "[>]"}
    prefix = prefixes.get(level, "  ")
    # 移除可能导致编码问题的特殊字符
    safe_msg = msg.replace('\u2122', '(TM)').replace('\u00ae', '(R)').replace('\u00a9', '(C)')
    safe_msg = safe_msg.replace('✓', '[OK]').replace('✗', '[X]').replace('→', '->')
    safe_msg = safe_msg.replace('\u301c', '~').replace('\u2013', '-').replace('\u2014', '-')
    safe_msg = safe_msg.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
    safe_msg = safe_msg.replace('\u300c', '').replace('\u300d', '').replace('\u300e', '').replace('\u300f', '')
    safe_msg = safe_msg.replace('\uff01', '!').replace('\uff08', '(').replace('\uff09', ')').replace('\uff0c', ',')
    safe_msg = safe_msg.replace('\u3001', ',').replace('\u3002', '.').replace('\uff1a', ':').replace('\uff1b', ';')
    safe_msg = safe_msg.replace('\uff5e', '~').replace('\u223c', '~').replace('\uff5d', ']').replace('\uff5b', '[')
    # 通过编码过滤只保留 GBK 可表示的字符
    try:
        safe_msg.encode('gbk')
    except UnicodeEncodeError:
        safe_msg = safe_msg.encode('gbk', errors='replace').decode('gbk')
    print(f"[{ts}] {prefix} {safe_msg}", flush=True)


def log_step(msg: str):
    log(msg, "PROG")


# ==================== LLM API 调用 ====================
def call_llm(system_prompt: str, user_prompt: str, config: dict) -> Optional[str]:
    """调用 LLM API 返回 JSON 内容"""
    import requests

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config['api_key']}",
    }

    data = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(
                f"{config['base_url']}/chat/completions",
                headers=headers,
                json=data,
                timeout=120,
            )
            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]
            elif response.status_code == 429:
                log(f"API 限流，等待 30 秒后重试...", "WARN")
                time.sleep(30)
            else:
                log(f"API 错误 {response.status_code}: {response.text[:200]}", "FAIL")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(5)
        except Exception as e:
            log(f"请求异常: {e}", "FAIL")
            if attempt < MAX_RETRIES - 1:
                time.sleep(5)
    return None


# ==================== 标签生成 ====================
ANALYZE_PROMPT = """你是资深游戏设计师。请为每款游戏生成2-4个精准的创新玩法标签。

【核心原则】识别并表达这款游戏最独特、最值得学习的核心机制，而非翻译Steam标签。

【标签来源】结合开发商背景、游戏简介、Steam标签，综合判断游戏的真正卖点。
- 如果Steam标签能体现核心机制，可以基于它翻译，但要体现深度理解
- 如果Steam标签过于泛化（如"冒险"、"动作"），要自己提炼更深层的特色
- 特别关注：开发商的标志性设计（如Valve的"无声主角叙事"）、独特的系统设计

【标签风格】
- 中英混合：业界术语保留英文（MOBA、FPS、CRPG等）
- 避免泛化：不能是"冒险"、"动作"、"FPS"这类任何游戏都有的标签
- 突出机制：用动词+名词表达核心玩法（如"海量英雄构筑"而非"多英雄"）

【评分标准】
- 吸引力(1-5)：看到这个标签，玩家会不会想玩
- 可学习性(1-5)：能否提取为设计参考
- 清晰度(1-5)：是否一看就懂是什么机制

【示例对比】
| Steam标签 | 差标签（太泛化） | 好标签（核心机制） |
|-----------|-----------------|------------------|
| FPS, Sci-fi | 科幻射击 | 异星科技武器 |
| FPS, Story Rich | 剧情FPS | 无声主角沉浸叙事 |
| MOBA | MOBA竞技 | 海量英雄Build构筑 |
| RPG, Adventure | 冒险RPG | 开放世界探索 |

【输出格式】
{
  "tags": [
    {"name": "标签名", "attraction": 4, "learnability": 5, "clarity": 4}
  ],
  "summary": "一句话总结"
}

【警告】禁止输出泛化标签！"""

USER_PROMPT_TEMPLATE = """请分析以下游戏的创新玩法标签：

游戏名称：{name}
开发商：{developers}
发行商：{publishers}
类型标签：{genres}
Steam标签：{tags}
游戏简介：{description}

请只输出 JSON："""


# ==================== 批量标签生成 ====================
def generate_tags_batch(games_batch: list, config: dict) -> dict:
    """为一批游戏生成创新玩法标签（一次 API 调用）

    Args:
        games_batch: 游戏列表（每个游戏包含基本信息）
        config: API 配置

    Returns:
        dict: {game_id: {"tags": [...], "tagsWithScores": [...], "summary": "..."}}
    """
    if not games_batch:
        return {}

    # 构建批量 prompt
    games_text = []
    for i, game in enumerate(games_batch, 1):
        name = game.get("name", "未知游戏")
        developers = ", ".join(game.get("developers", []) or ["未知"])
        publishers = ", ".join(game.get("publishers", []) or ["未知"])
        genres = ", ".join(game.get("genres", []) or ["未知"])
        tags = ", ".join(game.get("tags", []) or ["无"])
        description = (game.get("shortDescription", "") or game.get("description", "") or "无")[:300]

        games_text.append(f"""【游戏 {i}】
游戏名称：{name}
开发商：{developers}
发行商：{publishers}
类型标签：{genres}
Steam标签：{tags}
游戏简介：{description}""")

    games_section = "\n\n".join(games_text)

    user_prompt = f"""请分析以下 {len(games_batch)} 款游戏的创新玩法标签。

【重要】识别每款游戏的独特核心机制，而非简单翻译Steam标签。

{games_section}

请为每款游戏分别生成 2-4 个精准的创新玩法标签。

【核心要求】
- 必须识别并表达这款游戏最独特、最值得学习的核心机制
- 特别关注开发商的标志性设计
- 避免泛化标签（如"冒险"、"动作"、"FPS"）

【标签风格】
- 中英混合：业界术语保留英文（MOBA、FPS、CRPG等）
- 突出机制：用动词+名词表达核心玩法

【示例对比】
| 差标签 | 好标签 |
|--------|--------|
| 科幻射击 | 异星科技武器 |
| 无声主角 | 无声主角沉浸叙事 |
| MOBA竞技 | 海量英雄Build构筑 |

【输出格式】
{{
  "results": [
    {{
      "game_index": 1,
      "tags": [
        {{"name": "标签名", "attraction": 4, "learnability": 5, "clarity": 4}}
      ],
      "summary": "一句话总结"
    }}
  ]
}}"""

    content = call_llm(ANALYZE_PROMPT, user_prompt, config)
    if not content:
        return {}

    # 解析 JSON
    try:
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        result = json.loads(content.strip())
        results = result.get("results", [])

        # 构建返回值
        output = {}
        for item in results:
            game_index = item.get("game_index", 0) - 1
            if 0 <= game_index < len(games_batch):
                game_id = games_batch[game_index]["id"]
                raw_tags = item.get("tags", [])
                if raw_tags and isinstance(raw_tags[0], dict):
                    tags_with_scores = raw_tags
                    tags = [t.get("name", "") for t in raw_tags]
                else:
                    tags_with_scores = [{"name": t, "attraction": 3, "learnability": 3, "clarity": 3} for t in raw_tags]
                    tags = raw_tags

                output[game_id] = {
                    "tags": tags,
                    "tagsWithScores": tags_with_scores,
                    "summary": item.get("summary", ""),
                }

        return output
    except json.JSONDecodeError as e:
        log(f"批量 JSON 解析失败: {e}", "WARN")
        log(f"原始内容: {content[:200]}...", "WARN")
        return {}


# ==================== 主流程 ====================
def load_games_without_llm(pool_id: str = "A", force_regenerate: bool = False) -> list:
    """加载指定池子中缺少 LLM 标签的游戏，或需要重新生成评分的游戏

    Args:
        pool_id: 目标池子（"A", "B", "C", "ALL"）
        force_regenerate: 是否强制重新生成
    """
    log_step(f"加载 {pool_id} 池游戏数据...")

    # 加载 cache
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cache = json.load(f)

    # 加载已有 LLM 标签（检查 mechanics 字段和 tagsWithScores 字段）
    if COMBINED_FILE.exists():
        with open(COMBINED_FILE, "r", encoding="utf-8") as f:
            combined = json.load(f)
        # 检查游戏是否已存在于 combined 中
        # 存在则跳过，不存在则需要采集
        games_in_combined = set(combined.get("games", {}).keys())

        # 检查需要重新生成评分的游戏
        games_needs_score = set()
        for gid, gdata in combined.get("games", {}).items():
            tags_with_scores = gdata.get("tagsWithScores", [])
            if not tags_with_scores or len(tags_with_scores) == 0:
                games_needs_score.add(gid)
    else:
        games_in_combined = set()
        games_needs_score = set()

    # 筛选目标池子且没有 LLM 标签的游戏，或需要重新生成评分的游戏
    result = []
    for game in cache.get("games", []):
        game_pool = game.get("pool")

        # 支持 "ALL" 采集所有池子，包括 pool=None 的游戏
        if pool_id != "ALL":
            # 原有逻辑：精确匹配池子
            if game_pool != pool_id:
                continue

        game_id = str(game.get("id"))

        if force_regenerate and game_id in games_needs_score:
            # 强制重新生成：已有标签但没有评分
            pass
        elif game_id in games_in_combined:
            # 已在 combined 中，跳过
            continue

        # 获取评论数据
        steam_reviews = game.get("steamReviews") or {}
        reviews = steam_reviews.get("totalReviews", 0) or 0
        rating = steam_reviews.get("reviewScore", 0) or 0

        result.append({
            "id": game_id,
            "name": game.get("name", ""),
            "developers": game.get("developers", []),
            "publishers": game.get("publishers", []),
            "genres": game.get("genres", []),
            "tags": game.get("tags", []),
            "shortDescription": game.get("shortDescription", ""),
            "description": game.get("description", ""),
            "reviews": reviews,
            "rating": rating,
            "releaseDate": game.get("releaseDate", ""),
            "pool": game_pool,  # 保存池子信息用于日志
        })

    if force_regenerate:
        log(f"找到 {len(result)} 款 {pool_id} 池游戏需要重新生成评分")
    else:
        log(f"找到 {len(result)} 款 {pool_id} 池游戏缺少 LLM 标签")
    return result


def save_result(game_id: str, result: dict, combined_data: dict, steam_tags: list = None):
    """保存生成结果到 combinedMechanics.json

    Args:
        game_id: 游戏ID
        result: LLM生成结果
        combined_data: 目标数据结构
        steam_tags: 原始Steam标签列表（从cache读取，用于标记数据来源）
    """
    # 原始标签来源：优先使用传入的steam_tags，否则尝试从cache读取
    original_tags = steam_tags or result.get("steamTags", [])

    # 标记数据来源
    # - 有原始英文标签：reliable
    # - 无原始标签或只有中文标签：inferred（推测）
    has_english = any(
        t.replace('_', ' ').isascii() and any(c.isalpha() for c in t)
        for t in original_tags
    ) if original_tags else False

    # 强制翻译：确保所有标签都是中文（简化方案核心）
    raw_tags = result.get("tags", [])
    translated_tags = ensure_chinese_tags(raw_tags)

    combined_data["games"][game_id] = {
        "name": result.get("name", ""),
        "mechanics": translated_tags,
        "rawMechanics": translated_tags,
        "summary": result.get("summary", ""),
        "status": "generated",
        # 保存原始Steam标签（用于数据溯源）
        "steamTags": original_tags,
        # 标记数据来源：reliable=可靠(有英文标签), inferred=推测(无原始数据)
        "tagSource": "reliable" if has_english else "inferred",
        "generatedAt": datetime.now().isoformat(),
        # 保留完整评分信息用于排序
        "tagsWithScores": result.get("tagsWithScores", []),
    }
    combined_data["processedGames"] += 1


def backup_combined():
    """备份现有的 combinedMechanics.json"""
    if COMBINED_FILE.exists():
        import shutil
        backup_path = BACKUP_FILE
        shutil.copy(COMBINED_FILE, backup_path)
        log(f"已备份到 {backup_path}", "OK")


def run(pool_id: str = "A", limit: Optional[int] = None, config: Optional[dict] = None, force_regenerate: bool = False):
    """运行批量生成"""
    if config is None:
        config = DEFAULT_CONFIG

    if not config.get("api_key"):
        log("错误: 请设置 LLM_API_KEY 环境变量", "FAIL")
        return

    log_step(f"开始批量生成 {pool_id} 池游戏 LLM 标签")
    if force_regenerate:
        log("模式: 强制重新生成评分数据", "INFO")
    log(f"API: {config['base_url']}")
    log(f"Model: {config['model']}")

    # 备份
    backup_combined()

    # 加载现有数据
    if COMBINED_FILE.exists():
        with open(COMBINED_FILE, "r", encoding="utf-8") as f:
            combined_data = json.load(f)
    else:
        combined_data = {
            "lastUpdated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "totalGames": 0,
            "processedGames": 0,
            "totalTokens": 0,
            "games": {},
        }

    # 获取待处理游戏
    games = load_games_without_llm(pool_id, force_regenerate)
    if limit:
        games = games[:limit]
        log(f"限制处理前 {limit} 款游戏")

    if not games:
        log("没有需要处理的游戏", "OK")
        return

    # 按评论数排序（高优先级的先处理）
    games = sorted(games, key=lambda x: x.get("reviews", 0), reverse=True)

    # 统计
    success = 0
    failed = 0
    consecutive_failures = 0
    start_time = time.time()

    # 分批处理
    total_batches = (len(games) + BATCH_SIZE - 1) // BATCH_SIZE

    try:
        for batch_start in range(0, len(games), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(games))
            games_batch = games[batch_start:batch_end]
            batch_num = batch_start // BATCH_SIZE + 1

            # 连续失败后进入冷却
            if consecutive_failures >= CONSECUTIVE_FAILURES_THRESHOLD:
                log(f"连续失败 {consecutive_failures} 次，进入冷却等待 {LONG_COOLDOWN} 秒...", "WARN")
                time.sleep(LONG_COOLDOWN)
                consecutive_failures = 0

            batch_names = [g["name"][:20] for g in games_batch]
            log(f"批次 [{batch_num}/{total_batches}] 处理 {len(games_batch)} 款: {', '.join(batch_names)}", "PROG")

            # 批量生成标签
            results = generate_tags_batch(games_batch, config)

            if results:
                # 保存成功的结果
                for game in games_batch:
                    game_id = game["id"]
                    if game_id in results:
                        result = results[game_id]
                        result["name"] = game["name"]
                        original_steam_tags = game.get("tags", [])
                        save_result(game_id, result, combined_data, steam_tags=original_steam_tags)
                        success += 1
                        tags_preview = ", ".join(result.get("tags", [])[:2])
                        log(f"  ✓ {game['name'][:25]}: {tags_preview}", "OK")
                    else:
                        failed += 1
                        consecutive_failures += 1
                        log(f"  ✗ {game['name'][:25]}: 未返回结果", "FAIL")
                # 重置连续失败
                consecutive_failures = 0
            else:
                # 整批失败
                for game in games_batch:
                    failed += 1
                    consecutive_failures += 1
                    log(f"  ✗ {game['name'][:25]}: 批次请求失败", "FAIL")
                log(f"批次 {batch_num} 全部失败 (连续失败: {consecutive_failures})", "FAIL")

            # 定期保存
            processed = batch_end
            if processed % 10 == 0 or processed == len(games):
                with open(COMBINED_FILE, "w", encoding="utf-8") as f:
                    json.dump(combined_data, f, ensure_ascii=False, indent=2)
                elapsed = time.time() - start_time
                avg_time = elapsed / processed
                remaining = (len(games) - processed) * avg_time
                log(f"进度: {processed}/{len(games)}, 成功: {success}, 失败: {failed}, 预计剩余: {remaining/60:.1f}分钟", "PROG")

            # 请求间隔
            if consecutive_failures == 0:
                time.sleep(REQUEST_DELAY)

    except KeyboardInterrupt:
        log("用户中断，保存当前进度...", "WARN")

    # 最终保存
    combined_data["lastUpdated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(COMBINED_FILE, "w", encoding="utf-8") as f:
        json.dump(combined_data, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    log_step(f"完成！成功: {success}, 失败: {failed}, 耗时: {elapsed/60:.1f}分钟")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="A 池游戏 LLM 标签批量生成")
    parser.add_argument("--pool", "-p", default="A", choices=["A", "B", "C", "ALL"], help="目标池子（ALL=所有池子包括pool=None）")
    parser.add_argument("--limit", "-l", type=int, default=None, help="限制处理数量")
    parser.add_argument("--api-key", help="LLM API Key（覆盖环境变量）")
    parser.add_argument("--base-url", help="API Base URL")
    parser.add_argument("--model", "-m", help="模型名称")
    parser.add_argument("--force", "-f", action="store_true", help="强制重新生成已有游戏的评分数据")

    args = parser.parse_args()

    config = DEFAULT_CONFIG.copy()
    if args.api_key:
        config["api_key"] = args.api_key
    if args.base_url:
        config["base_url"] = args.base_url
    if args.model:
        config["model"] = args.model

    run(pool_id=args.pool, limit=args.limit, config=config, force_regenerate=args.force)
