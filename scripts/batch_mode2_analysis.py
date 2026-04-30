# -*- coding: utf-8 -*-
"""
模式2批量LLM分析脚本 v2（高效并发版）

改进点：
1. 直接调用LLM API，跳过Next.js中间层
2. 多款游戏并发分析（并发数可配置）
3. 每款游戏6个模块并发执行

使用方法：
  python scripts/batch_mode2_analysis.py                    # 全量并发分析
  python scripts/batch_mode2_analysis.py --limit 3         # 测试3款
  python scripts/batch_mode2_analysis.py --resume           # 从上次中断继续
  python scripts/batch_mode2_analysis.py --dry-run          # 仅列出待分析游戏
  python scripts/batch_mode2_analysis.py --workers 5        # 并发5款游戏（默认3）
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
from typing import Optional

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(r"D:\Steam全域游戏搜索")
DATA_DIR = PROJECT_ROOT / "public" / "data"
CACHE_FILE = DATA_DIR / "games-index.json"
ANALYSES_FILE = DATA_DIR / "analyses.json"
PROGRESS_FILE = PROJECT_ROOT / "temp" / "batch_analysis_progress.json"

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
CONCURRENT_GAMES = 3         # 同时分析的游戏数
CONCURRENT_MODULES = 2       # 每个游戏同时分析的模块数
REQUEST_TIMEOUT = 180        # 请求超时（秒）
MAX_RETRIES = 2              # 最大重试次数
RETRY_DELAY = 15             # 重试间隔（秒）

# ==================== 分析模块列表 ====================
ANALYSIS_MODULES = [
    "verdict",
    "coreGameplay",
    "battleSystem",
    "differentiation",
    "negativeFeedback",
    "designSuggestions",
]

# ==================== 提示词模板（与 llm.ts 保持一致）================
POOL_HINTS = {
    "A": "【池子提示】这是A池游戏（神作参考池），重点分析优秀UI和战斗机制表现力",
    "B": "【池子提示】这是B池游戏（核心竞品池），重点分析成功原因和差异化创新点",
    "C": "【池子提示】这是C池游戏（避坑指南池），重点分析差评原因和设计缺陷",
}

POOL_HINT_TEMPLATE = "【池子提示】这是{pool}池游戏（{desc}），重点分析{focus}"

POOL_CONFIG = {
    "A": POOL_HINT_TEMPLATE.format(pool="A", desc="神作参考池", focus="优秀UI和战斗机制表现力"),
    "B": POOL_HINT_TEMPLATE.format(pool="B", desc="核心竞品池", focus="成功原因和差异化创新点"),
    "C": POOL_HINT_TEMPLATE.format(pool="C", desc="避坑指南池", focus="差评原因和设计缺陷"),
}

POOL_HINTS = POOL_CONFIG

SYSTEM_PROMPTS = {
    "verdict": """你是宝可梦Like游戏专项分析师。请根据游戏数据生成一句话总结和元数据。

【要求】
- 一句话概括游戏的定位和核心特点
- 30-80字，简洁有力
- 重点说明游戏适合什么类型的开发者参考

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

- 输出必须是合法JSON: {"verdict": "你的总结", "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 45, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}}""",

    "coreGameplay": """你是宝可梦Like游戏专项分析师。请对游戏的核心玩法系统进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 整体玩法循环：详细描述游戏的主要游戏循环，包括日常任务、核心目标、长线追求等
2. 生物收集系统：是否有生物收集系统、具体约多少种、设计密度如何
3. 捕捉/获得方式：详细描述玩家如何获得生物，不同稀有度的获取难度
4. 进化系统：进化机制的具体设计，是否有特殊进化条件
5. 队伍构建与策略：队伍构建的策略深度，词条/性格/技能搭配等
6. 玩家体验曲线：前期、中期、后期体验差异，肝度和氪金点

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "description": "整体玩法循环详细描述（300-500字）",
  "creatureCollection": true/false,
  "creatureCount": "生物种类及收集密度分析（200-300字）",
  "captureSystem": "捕捉/获得方式详细描述（300-400字）",
  "evolutionSystem": "进化系统设计分析（300-400字）",
  "teamBuilding": "队伍构建策略深度分析（300-400字）",
  "playerExperience": "玩家体验曲线与节奏分析（300-400字）",
  "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 2100, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}
}

【重要提示】
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 描述要具体、可操作，举例说明
- 不要使用泛化的形容词，要基于数据说话""",

    "battleSystem": """你是宝可梦Like游戏专项分析师。请对游戏的战斗系统进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 回合制机制：具体是哪种回合制设计（传统回合、加速回合、即时回合等），先手机制设计
2. 属性克制系统：是否有属性系统、克制关系复杂度、是否有反克制机制
3. 技能/招式设计：技能池大小、技能学习方式、是否有特殊技能机制
4. 独特战斗机制：是否有创新战斗玩法（如天气、场地、连锁等）
5. 战斗节奏与时长：快节奏/慢节奏定位，一场战斗平均时长
6. PVP与PVE差异：两者在战斗设计上有什么区别

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "turnMechanism": "回合制机制详细分析（300-400字）",
  "typeAdvantages": "属性克制系统深度分析（300-400字）",
  "moveSystem": "技能/招式系统设计分析（300-400字）",
  "uniqueMechanics": ["独特战斗机制1详细描述（200字以上）", "独特战斗机制2详细描述（200字以上）"],
  "battlePace": "战斗节奏与时长分析（300-400字）",
  "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 1800, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}
}

【重要提示】
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 重点分析宝可梦Like特有的战斗机制设计
- 描述要具体，结合游戏实际设计举例说明""",

    "differentiation": """你是宝可梦Like游戏专项分析师。请对游戏的差异化创新点进行深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 核心差异化定位：游戏最核心的差异化卖点是什么，与其他宝可梦Like游戏有何不同
2. 创新点详细描述：具体有哪些创新设计，这些创新是否成功
3. 融合玩法分析：融合了哪些其他类型游戏的玩法（如RPG、卡牌、Roguelike等）
4. 成功原因剖析：游戏受欢迎的根本原因是什么，核心玩家群体是谁
5. 市场定位分析：在同类游戏中处于什么位置，目标用户画像
6. 可复制的要素：哪些差异化设计可以被其他开发者学习借鉴

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "coreTag": "核心差异化定位详细分析（300-400字）",
  "innovationDescription": "创新点详细描述与分析（400-500字）",
  "combinedMechanics": ["融合的玩法1详细分析（300字以上）", "融合的玩法2详细分析（300字以上）"],
  "whySuccessful": "游戏成功原因深度剖析（400-500字）",
  "marketPosition": "市场定位与目标用户分析（300-400字）",
  "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 2200, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}
}

【重要提示】
- 这是B池游戏重点分析模块，要深入分析成功要素
- 每个字段描述必须达到规定字数，禁止简短敷衍
- 要深入分析游戏的独特价值，找出可学习的设计要素""",

    "negativeFeedback": """你是宝可梦Like游戏专项分析师。请深入分析游戏的差评，给开发者提供避坑参考。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 差评整体概述：玩家整体在抱怨什么，负面情绪主要集中在哪些方面
2. 主要抱怨点详细分析：具体有哪些抱怨（3-5条），每条要深入分析原因
3. 差评关键词与高频词：高频出现的负面关键词，反映了玩家的核心痛点
4. 设计缺陷深度剖析：具体的设计问题是什么，为什么会导致玩家不满
5. 玩家预期与实际落差：玩家期望什么但实际体验如何，这种落差如何产生
6. 问题严重程度评估：这些问题对游戏口碑和留存的影响程度

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "summary": "差评整体概述与情绪分析（300-400字）",
  "topComplaints": ["抱怨1详细分析（300字以上）", "抱怨2详细分析（300字以上）", "抱怨3详细分析（300字以上）"],
  "complaintKeywords": ["关键词1出现场景与原因分析", "关键词2出现场景与原因分析", "关键词3出现场景与原因分析"],
  "designPitfalls": ["设计缺陷1详细剖析（300字以上）", "设计缺陷2详细剖析（300字以上）"],
  "playerExpectations": "玩家预期与实际体验落差分析（400-500字）",
  "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 2400, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}
}

【重要提示】
- 这是C池游戏重点分析模块，必须真实反映玩家反馈，不要美化
- 差评分析要具体、可操作，每个字段要达到规定字数
- 要站在开发者角度分析问题，找出避坑要点""",

    "designSuggestions": """你是宝可梦Like游戏专项分析师。请对开发者给出详细的设计建议，每个建议都要有深度分析。

【分析要点 - 每个要点必须展开详细描述，至少300字以上】
1. 值得学习的优点：游戏中哪些设计值得其他开发者借鉴，具体好在哪里
2. 需要避开的坑：哪些设计是失败的教训，为什么会失败，其他开发者应该如何避免
3. 难度与肝度平衡：游戏的难度曲线和肝度设计是否合理，有什么可以改进的地方
4. 肝度深度分析：游戏是否肝、怎么肝、肝的内容是否有价值，玩家接受度如何
5. 氪金点分析：游戏的付费设计是否合理，有哪些可以学习或避免的地方
6. 综合设计建议：对宝可梦Like游戏开发者的全面建议

【元数据要求 - 必须输出】
- sourceOfTruth: 列出本次分析主要依据的数据源（最多3个）
- confidence: high/medium/low，基于数据充足程度判断
- basedOnReviews: 精确数字，估算基于多少条评价
- keyInsights: 3-5个关键词，用逗号分隔
- dataQuality: excellent/good/limited，数据是否充足

【输出格式 - 每个描述字段不得少于300字】
必须输出合法JSON:
{
  "strengthsToLearn": ["优点1详细分析（300字以上）", "优点2详细分析（300字以上）", "优点3详细分析（300字以上）"],
  "pitfallsToAvoid": ["需要避开的坑1详细分析（300字以上）", "需要避开的坑2详细分析（300字以上）", "需要避开的坑3详细分析（300字以上）"],
  "difficultyBalance": "难度与肝度平衡详细分析（400-500字）",
  "grindAnalysis": "肝度深度分析（400-500字）",
  "recommendation": "对开发者的综合设计建议（500-600字）",
  "metadata": {"sourceOfTruth": ["数据源1", "数据源2"], "confidence": "high", "basedOnReviews": 2847, "analysisDate": "YYYY-MM-DD", "wordCount": 3000, "keyInsights": ["洞察1", "洞察2"], "dataQuality": "good"}
}

【重要提示】
- 建议要具体、可操作，每个字段要达到规定字数
- 要基于游戏实际表现和数据给出建议，不要空泛
- 重点帮助开发者理解如何做出好的宝可梦Like游戏""",
}

USER_TEMPLATES = {
    "verdict": """请为以下游戏生成一句话总结：

游戏信息：
{gameInfo}

{poolHint}""",

    "coreGameplay": """请详细分析以下游戏的核心玩法系统：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。""",

    "battleSystem": """请详细分析以下游戏的战斗系统：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。""",

    "differentiation": """请详细分析以下游戏的差异化创新点：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。""",

    "negativeFeedback": """请深入分析以下游戏的差评：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。""",

    "designSuggestions": """请给出对以下游戏的设计建议：

游戏信息：
{gameInfo}

{poolHint}

【输出要求】每个分析字段不得少于300字，要深入展开、具体分析。""",
}

# ==================== 日志 ====================
g_log_lock = None

def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    prefixes = {"INFO": "  ", "OK": "[OK]", "WARN": "[!]", "FAIL": "[X]", "PROG": "[>]"}
    prefix = prefixes.get(level, "  ")
    try:
        safe_msg = msg.encode('gbk', errors='replace').decode('gbk')
    except Exception:
        safe_msg = msg
    print(f"[{ts}] {prefix} {safe_msg}", flush=True)


def log_step(msg: str):
    log(msg, "PROG")


# ==================== 进度管理 ====================
def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"completed_games": [], "failed_games": {}, "last_game_id": None,
            "total_success": 0, "total_failed": 0, "start_time": datetime.now().isoformat()}


def save_progress(progress: dict):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


# ==================== 分析结果加载/保存 ====================
def load_analyses() -> dict:
    if not ANALYSES_FILE.exists():
        return {}
    try:
        with open(ANALYSES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}


def save_analyses(analyses: dict):
    with open(ANALYSES_FILE, "w", encoding="utf-8") as f:
        json.dump(analyses, f, ensure_ascii=False, indent=2)


def get_analyzed_modules(game_id: str) -> set:
    analyses = load_analyses()
    game = analyses.get(game_id, {})
    return set(game.get("analyzedModules", []))


# ==================== LLM API 调用 ====================
async def call_llm_async(session: aiohttp.ClientSession, messages: list, retries: int = MAX_RETRIES) -> Optional[dict]:
    """异步调用 LLM API"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_API_KEY}",
    }
    body = {
        "model": LLM_MODEL,
        "messages": messages,
        "max_tokens": 32768,
        "temperature": 0.7,
    }

    for attempt in range(retries + 1):
        try:
            async with session.post(
                f"{LLM_BASE_URL}/chat/completions",
                headers=headers,
                json=body,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                elif resp.status == 429:
                    wait = RETRY_DELAY * (attempt + 1)
                    log(f"API限流 (429)，等待 {wait} 秒...", "WARN")
                    await asyncio.sleep(wait)
                else:
                    text = await resp.text()
                    log(f"API错误 {resp.status}: {text[:200]}", "FAIL")
                    if attempt < retries:
                        await asyncio.sleep(RETRY_DELAY)
        except asyncio.TimeoutError:
            log(f"请求超时，重试中...", "WARN")
            if attempt < retries:
                await asyncio.sleep(RETRY_DELAY)
        except Exception as e:
            log(f"请求异常: {e}", "FAIL")
            if attempt < retries:
                await asyncio.sleep(RETRY_DELAY)
    return None


def parse_json_response(content: str) -> Optional[dict]:
    """解析 LLM 返回的 JSON"""
    if not content:
        return None
    cleaned = re.sub(r"```json\n?", "", content)
    cleaned = re.sub(r"```\n?$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


# ==================== 游戏数据加载 ====================
def load_default_filter_games() -> list:
    """加载默认筛选条件下的游戏列表"""
    log_step("加载游戏数据...")

    # 优先使用 games-cache.json（有完整筛选字段）
    cache_file = DATA_DIR / "games-cache.json"
    if not cache_file.exists():
        log(f"错误: {cache_file} 不存在", "FAIL")
        return []

    with open(cache_file, "r", encoding="utf-8") as f:
        cache = json.load(f)

    games_raw = cache.get("games", [])
    log(f"缓存中共有 {len(games_raw)} 款游戏")

    result = []
    for raw in games_raw:
        if raw.get("isTestVersion"):
            continue
        if not raw.get("isTurnBased"):
            continue

        reviews = raw.get("steamReviews", {}) or {}
        total_reviews = reviews.get("totalReviews", 0) or 0
        rating = reviews.get("reviewScore", 0) or 0

        release_date = raw.get("releaseDate", "")
        release_year = 0
        if release_date:
            try:
                release_year = int(release_date.split("-")[0])
            except:
                pass

        is_pokemon_like = raw.get("isPokemonLike", False)
        pool = None

        # A池: 非宝可梦Like + 好评率>=85 + 评论数>=1000 + 上线>=2024
        if not is_pokemon_like and rating >= 85 and total_reviews >= 1000 and release_year >= 2024:
            pool = "A"
        # B池: 宝可梦Like + 好评率>=75 + 评论数>=200
        if is_pokemon_like and rating >= 75 and total_reviews >= 200:
            pool = "B"
        # C池: 宝可梦Like + 好评率40%-74% + 评论数>=100
        if is_pokemon_like and 40 <= rating <= 74 and total_reviews >= 100:
            pool = "C"

        if pool:
            result.append({
                "id": str(raw["id"]),
                "name": raw.get("name", "未知"),
                "pool": pool,
                "rating": rating,
                "total_reviews": total_reviews,
                "raw": raw,
            })

    log(f"默认筛选条件下共有 {len(result)} 款游戏")
    return result


def build_game_info(raw: dict) -> str:
    """构建游戏信息字符串"""
    parts = []
    parts.append(f"游戏名称：{raw.get('name', '未知')}")
    devs = raw.get("developers", [])
    parts.append(f"开发商：{', '.join(devs) if devs else '未知'}")
    pubs = raw.get("publishers", [])
    parts.append(f"发行商：{', '.join(pubs) if pubs else '未知'}")
    if raw.get("releaseDate"):
        parts.append(f"发售日期：{raw['releaseDate']}")
    genres = raw.get("genres", [])
    parts.append(f"类型标签：{', '.join(genres) if genres else '未知'}")
    tags = raw.get("tags", [])
    parts.append(f"游戏标签：{', '.join(tags) if tags else '无'}")

    reviews = raw.get("steamReviews", {})
    if reviews:
        total = reviews.get("totalReviews", 0)
        score = reviews.get("reviewScore", 0)
        pos = reviews.get("totalPositive", 0)
        neg = reviews.get("totalNegative", 0)
        parts.append(f"Steam评价：{score}%（{pos}好评 / {neg}差评，总计{total}条）")
        if total >= 1000:
            parts.append(f"【数据质量提示】该游戏有 {total} 条评价，数据充足，分析置信度可设为 high")
        elif total >= 100:
            parts.append(f"【数据质量提示】该游戏有 {total} 条评价，数据量中等，分析置信度可设为 medium")
        else:
            parts.append(f"【数据质量提示】该游戏仅有 {total} 条评价，数据有限，分析置信度建议设为 low")

    price = raw.get("price", 0)
    if price == 0:
        parts.append("价格：免费")
    elif price:
        parts.append(f"价格：${price / 100:.2f}")

    short_desc = raw.get("shortDescription", "")
    if short_desc:
        desc = re.sub(r"<[^>]+>", "", short_desc)
        desc = desc.replace("&nbsp;", " ").replace("&amp;", "&")
        desc = re.sub(r"\s+", " ", desc).strip()
        parts.append(f"\n游戏简介：\n{desc[:1000]}")

    full_desc = raw.get("description", "")
    if full_desc:
        desc = re.sub(r"<[^>]+>", "", full_desc)
        desc = desc.replace("&nbsp;", " ").replace("&amp;", "&")
        desc = re.sub(r"\s+", " ", desc).strip()
        parts.append(f"\n完整描述：\n{desc[:3000]}")

    return "\n\n".join(parts)


# ==================== 单个模块分析 ====================
async def analyze_single_module(
    session: aiohttp.ClientSession,
    game_id: str,
    game_name: str,
    pool: str,
    module: str,
    game_info: str,
) -> tuple[str, Optional[dict]]:
    """分析单个模块"""
    system = SYSTEM_PROMPTS[module]
    user_tpl = USER_TEMPLATES[module]
    pool_hint = POOL_HINTS.get(pool, "") if pool else ""
    user_content = user_tpl.format(gameInfo=game_info, poolHint=pool_hint)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    content = await call_llm_async(session, messages)
    if not content:
        return module, None

    result = parse_json_response(content)
    return module, result


# ==================== 单个游戏分析 ====================
async def analyze_game(
    session: aiohttp.ClientSession,
    game: dict,
    progress: dict,
) -> dict:
    """并发分析游戏的所有模块"""
    game_id = game["id"]
    game_name = game["name"]
    pool = game.get("pool", "")
    raw = game.get("raw", {})
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
    all_success = True
    for module, result in results:
        if result:
            log(f"  OK {module}", "OK")
            analysis_result[module] = {**result, "isAnalyzed": True, "isAnalyzing": False, "error": None}
        else:
            log(f"  FAIL {module}", "FAIL")
            all_success = False

    if analysis_result:
        # 更新 analyses.json
        analyses = load_analyses()
        if game_id not in analyses:
            analyses[game_id] = {
                "id": f"analysis-{game_id}-{int(time.time() * 1000)}",
                "gameId": game_id,
                "gameName": game_name,
                "pool": pool,
                "generatedAt": datetime.now().isoformat(),
                "analyzedModules": [],
            }
        existing = analyses[game_id]
        existing["generatedAt"] = datetime.now().isoformat()
        for mod in analysis_result:
            if mod not in existing["analyzedModules"]:
                existing["analyzedModules"].append(mod)
            existing[mod] = analysis_result[mod]
        save_analyses(analyses)

    if all_success:
        if game_id not in progress["completed_games"]:
            progress["completed_games"].append(game_id)
        progress["total_success"] += len(missing)
    else:
        progress["failed_games"][game_id] = {"name": game_name, "timestamp": datetime.now().isoformat()}
        progress["total_failed"] += missing.__len__() - sum(1 for m, r in results if r)

    progress["last_game_id"] = game_id
    return {"game_id": game_id, "success": all_success, "skipped": False}


# ==================== 主批量逻辑 ====================
async def run_batch_async(games: list, resume: bool = False, dry_run: bool = False):
    """异步并发批量分析"""
    log_step("开始批量LLM分析（并发版）")
    log(f"目标: {len(games)} 款游戏 × {len(ANALYSIS_MODULES)} 模块")
    log(f"并发数: {CONCURRENT_GAMES} 款游戏 / {CONCURRENT_MODULES} 模块")

    # 加载进度（始终加载，resume时增量）
    progress = load_progress()
    if not resume:
        # 非resume模式：只保留还在池中的游戏
        # 注意：不要重置completed_games，因为里面都是已完成的游戏
        pass

    # 过滤待分析
    pending = []
    for game in games:
        gid = game["id"]
        if gid in progress["completed_games"]:
            log(f"跳过(completed): {game['name']} ({gid})", "INFO")
            continue
        if gid in progress["failed_games"]:
            log(f"跳过(failed): {game['name']} ({gid})", "INFO")
            continue
        analyzed = get_analyzed_modules(gid)
        missing = [m for m in ANALYSIS_MODULES if m not in analyzed]
        if not missing:
            log(f"跳过(无缺失): {game['name']} ({gid}) - 已分析{len(analyzed)}模块", "INFO")
            continue
        game["missing_modules"] = missing
        pending.append(game)

    log(f"待分析: {len(pending)} 款")
    if not pending:
        log("没有待分析的游戏", "OK")
        return

    if dry_run:
        for game in pending:
            log(f"  {game['name']} ({game['id']}) - {len(game.get('missing_modules', ANALYSIS_MODULES))} 模块", "PROG")
        return

    start_time = time.time()
    total = len(pending)

    connector = aiohttp.TCPConnector(limit=CONCURRENT_GAMES * 2, force_close=True)
    async with aiohttp.ClientSession(connector=connector) as session:
        for i, game in enumerate(pending):
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (total - i - 1) / rate if rate > 0 else 0
            log(f"[{i+1}/{total}] 预计剩余: {remaining/60:.1f} 分钟", "INFO")

            result = await analyze_game(session, game, progress)
            save_progress(progress)

    elapsed = time.time() - start_time
    log_step(f"完成！成功: {progress['total_success']}, 失败: {progress['total_failed']}, 耗时: {elapsed/60:.1f} 分钟")


# ==================== 入口 ====================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="模式2批量LLM分析脚本")
    parser.add_argument("--limit", "-l", type=int, default=None)
    parser.add_argument("--resume", "-r", action="store_true")
    parser.add_argument("--dry-run", "-d", action="store_true")
    parser.add_argument("--pool", "-p", choices=["A", "B", "C", "ALL"], default="ALL")
    parser.add_argument("--workers", "-w", type=int, default=CONCURRENT_GAMES)

    args = parser.parse_args()

    # 更新并发数
    if args.workers:
        CONCURRENT_GAMES = args.workers

    print("=" * 60)
    print("模式2批量LLM分析脚本 v2（高效并发版）")
    print("=" * 60)

    # 检查 API Key
    if not LLM_API_KEY:
        log("错误: 未配置 LLM_API_KEY", "FAIL")
        log("请在 .env 文件中配置 LLM_API_KEY", "FAIL")
        sys.exit(1)

    # 加载游戏
    all_games = load_default_filter_games()
    if args.pool != "ALL":
        all_games = [g for g in all_games if g["pool"] == args.pool]
    if args.limit:
        all_games = all_games[:args.limit]

    progress = load_progress()
    print(f"已完成: {len(progress.get('completed_games', []))} 款")
    print(f"失败: {len(progress.get('failed_games', {}))} 款")
    print(f"并发数: {CONCURRENT_GAMES}")
    print()

    asyncio.run(run_batch_async(all_games, resume=args.resume, dry_run=args.dry_run))
