# -*- coding: utf-8 -*-
"""
从 analyses.json 生成宝可梦Like游戏详细分析文档

使用方法：
  python scripts/generate_analysis_docs.py                    # 生成所有B池游戏文档
  python scripts/generate_analysis_docs.py --limit 3         # 测试3款
  python scripts/generate_analysis_docs.py --dry-run         # 仅列出待生成的游戏
"""

import json
import os
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(r"D:\Steam全域游戏搜索")
DATA_DIR = PROJECT_ROOT / "public" / "data"
DOCS_DIR = PROJECT_ROOT / "docs" / "LLM详细分析宝可梦like案例"
ANALYSES_FILE = DATA_DIR / "analyses.json"
B_POOL_FILE = PROJECT_ROOT / "temp" / "b_pool_75pct_200reviews.json"

# ==================== 日志 ====================
def log(msg: str, level: str = "INFO"):
    prefixes = {"INFO": "  ", "OK": "[OK]", "WARN": "[!]", "FAIL": "[X]", "PROG": "[>]"}
    prefix = prefixes.get(level, "  ")
    try:
        safe_msg = msg.encode('gbk', errors='replace').decode('gbk')
    except Exception:
        safe_msg = msg
    print(f"{prefix} {safe_msg}", flush=True)


# ==================== 加载数据 ====================
def load_analyses() -> dict:
    if not ANALYSES_FILE.exists():
        log(f"错误: analyses.json 不存在", "FAIL")
        return {}
    with open(ANALYSES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_b_pool_games() -> list:
    if not B_POOL_FILE.exists():
        log(f"警告: B池游戏列表不存在，将跳过池子信息", "WARN")
        return []
    with open(B_POOL_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


# ==================== 工具函数 ====================
def clean_text(text: str) -> str:
    """清理文本中的特殊字符"""
    if not text:
        return ""
    # 移除多余的空白
    text = "\n".join(line.strip() for line in text.split("\n") if line.strip())
    return text


def get_game_info(analyses: dict, game_id: str, b_pool_games: list) -> dict:
    """获取游戏的额外信息（好评率、评价数等）"""
    info = analyses.get(game_id, {})
    
    # 从B池数据获取评价信息
    b_pool_data = next((g for g in b_pool_games if g["appId"] == game_id), None)
    
    result = {
        "rating": 0,
        "total_reviews": 0,
        "price": 0,
        "release_date": "",
        "developers": [],
        "genres": "",  # 新增：genres标签
    }
    
    if b_pool_data:
        result["rating"] = b_pool_data.get("reviewScore", 0)
        result["total_reviews"] = b_pool_data.get("totalReviews", 0)
        result["release_date"] = b_pool_data.get("releaseDate", "")
        result["developers"] = b_pool_data.get("developers", [])
        result["price"] = b_pool_data.get("price", 0)
        # 从tags中提取genres（取前3个非通用标签）
        tags = b_pool_data.get("tags", [])
        if tags:
            # 过滤掉通用标签，保留有意义的类型标签
            generic_tags = {"RPG", "Indie", "Adventure", "Casual", "Simulation", "Action", "Strategy"}
            meaningful_tags = [t for t in tags if t not in generic_tags][:3]
            if meaningful_tags:
                result["genres"] = ",".join(meaningful_tags)
            else:
                # 如果没有有意义的标签，使用前3个标签
                result["genres"] = ",".join(tags[:3])
    
    return result


def format_verdict(verdict_data: dict, meta: dict) -> str:
    """格式化一句话总结"""
    verdict = verdict_data.get("verdict", "")
    metadata = verdict_data.get("metadata", {})
    game_name = metadata.get("gameName", "")
    confidence = metadata.get("confidence", "")
    based_on = metadata.get("basedOnReviews", 0)
    
    # 提取genres
    core_gameplay = meta.get("coreGameplay", {})
    desc = core_gameplay.get("description", "")
    
    # 从描述中提取genres（简化处理）
    genres = ""
    if desc:
        # 尝试从分析文本中提取类型信息
        pass
    
    return clean_text(verdict)


def format_core_gameplay(core: dict) -> str:
    """格式化核心玩法模块"""
    parts = []
    
    # description
    if core.get("description"):
        parts.append(core["description"])
    
    # 分割线
    parts.append("")
    parts.append("#### 生物收集")
    cc = core.get("creatureCollection")
    parts.append(str(cc).lower() if cc is not None else "false")
    
    # 各个子系统
    if core.get("captureSystem"):
        parts.append("")
        parts.append("#### 获得方式")
        parts.append(core["captureSystem"])
    
    if core.get("evolutionSystem"):
        parts.append("")
        parts.append("#### 进化系统")
        parts.append(core["evolutionSystem"])
    
    if core.get("teamBuilding"):
        parts.append("")
        parts.append("#### 队伍构建")
        parts.append(core["teamBuilding"])
    
    if core.get("playerExperience"):
        parts.append("")
        parts.append("### 玩家体验")
        parts.append(core["playerExperience"])
    
    return clean_text("\n\n".join(parts))


def format_battle_system(battle: dict) -> str:
    """格式化战斗系统模块"""
    parts = []
    
    # 回合机制
    if battle.get("turnMechanism"):
        parts.append("")
        parts.append("#### 回合机制")
        parts.append(battle["turnMechanism"])
    
    # 属性克制
    if battle.get("typeAdvantages"):
        parts.append("")
        parts.append("#### 属性克制")
        parts.append(battle["typeAdvantages"])
    
    # 技能设计
    if battle.get("moveSystem"):
        parts.append("")
        parts.append("#### 技能设计")
        parts.append(battle["moveSystem"])
    
    # 战斗节奏
    if battle.get("battlePace"):
        parts.append("")
        parts.append("#### 战斗节奏")
        parts.append(battle["battlePace"])
    
    # 独特机制
    unique_mechanics = battle.get("uniqueMechanics", [])
    if unique_mechanics:
        parts.append("")
        parts.append("#### 独特机制")
        for i, mech in enumerate(unique_mechanics, 1):
            parts.append(str(i))
            parts.append(mech)
    
    return clean_text("\n\n".join(parts))


def format_differentiation(diff: dict) -> str:
    """格式化差异化创新模块"""
    parts = []
    
    # 核心定位
    if diff.get("coreTag"):
        parts.append("")
        parts.append("#### 核心定位")
        parts.append(diff["coreTag"])
    
    # 融合玩法
    combined = diff.get("combinedMechanics", [])
    if combined:
        parts.append("")
        parts.append("#### 融合玩法")
        for i, mech in enumerate(combined, 1):
            parts.append(str(i))
            parts.append(mech)
    
    # 成功原因
    if diff.get("whySuccessful"):
        parts.append("")
        parts.append("#### 成功原因")
        parts.append(diff["whySuccessful"])
    
    # 市场定位
    if diff.get("marketPosition"):
        parts.append("")
        parts.append("#### 市场定位")
        parts.append(diff["marketPosition"])
    
    return clean_text("\n\n".join(parts))


def format_negative_feedback(neg: dict) -> str:
    """格式化差评分析模块"""
    parts = []
    
    # 差评概述
    if neg.get("summary"):
        parts.append("")
        parts.append("#### 差评概述")
        parts.append(neg["summary"])
    
    # 主要抱怨点
    complaints = neg.get("topComplaints", [])
    if complaints:
        parts.append("")
        parts.append("#### 玩家主要抱怨")
        for i, complaint in enumerate(complaints, 1):
            parts.append(str(i))
            parts.append(complaint)
    
    # 设计缺陷
    pitfalls = neg.get("designPitfalls", [])
    if pitfalls:
        parts.append("")
        parts.append("#### 设计缺陷警示")
        for i, pitfall in enumerate(pitfalls, 1):
            parts.append("")
            parts.append(f"设计缺陷{i}：")
            parts.append(pitfall)
    
    return clean_text("\n\n".join(parts))


def format_design_suggestions(suggestions: dict) -> str:
    """格式化设计建议模块"""
    parts = []
    
    # 值得学习
    strengths = suggestions.get("strengthsToLearn", [])
    if strengths:
        parts.append("")
        parts.append("#### 值得学习")
        for i, strength in enumerate(strengths, 1):
            parts.append(str(i))
            parts.append(strength)
    
    # 避坑提示
    pitfalls = suggestions.get("pitfallsToAvoid", [])
    if pitfalls:
        parts.append("")
        parts.append("#### 避坑提示")
        for i, pitfall in enumerate(pitfalls, 1):
            parts.append(str(i))
            parts.append(pitfall)
    
    # 难度与肝度
    if suggestions.get("difficultyBalance"):
        parts.append("")
        parts.append("#### 难度")
        parts.append(suggestions["difficultyBalance"])
    
    if suggestions.get("grindAnalysis"):
        parts.append("")
        parts.append("#### 肝度")
        parts.append(suggestions["grindAnalysis"])
    
    # 综合建议
    if suggestions.get("recommendation"):
        parts.append("")
        parts.append("#### 综合建议")
        parts.append(suggestions["recommendation"])
    
    return clean_text("\n\n".join(parts))


def generate_markdown(game_id: str, analysis: dict, game_info: dict) -> str:
    """生成完整的markdown文档"""
    parts = []
    
    # ========== 元数据头部 ==========
    # 第一行：genres（开发商）
    devs = game_info.get("developers", [])
    dev_str = devs[0] if devs else ""
    genres = game_info.get("genres", "RPG")
    parts.append(f"{genres}，{dev_str}")
    
    # 第二行：发售日期和价格（格式：YYYY年MM月，¥价格）
    release = game_info.get("release_date", "")
    if release:
        # 转换日期格式为中文
        try:
            from datetime import datetime
            dt = datetime.strptime(release, "%Y-%m-%d")
            release_cn = f"{dt.year}年{dt.month}月"
        except:
            release_cn = release
    else:
        release_cn = ""
    
    price = game_info.get("price", 0)
    if price > 0:
        price_str = f"¥{price}"
    else:
        price_str = "免费"
    
    if release_cn or price_str:
        parts.append(f"{release_cn}，{price_str}")
    
    # 第三行：好评率和评价数
    rating = game_info.get("rating", 0)
    reviews = game_info.get("total_reviews", 0)
    if rating and reviews:
        parts.append(f"{rating}%好评率，{reviews} 条评价")
    
    parts.append("")  # 空行
    
    # ========== 一句话总结 ==========
    verdict = analysis.get("verdict", {})
    verdict_text = verdict.get("verdict", "")
    if verdict_text:
        parts.append(verdict_text)
    
    # ========== 核心玩法 ==========
    core = analysis.get("coreGameplay", {})
    if core:
        parts.append("### 核心玩法")
        parts.append("来源：Steam Store PageSteam ReviewsCommunity Wiki/Guides")
        
        # 从coreGameplay.metadata.keyInsights提取关键词作为第9行
        core_meta = core.get("metadata", {})
        key_insights = core_meta.get("keyInsights", [])
        if key_insights:
            parts.append("，".join(key_insights))
        
        parts.append("")
        
        desc = core.get("description", "")
        if desc:
            parts.append(desc)
        
        # 生物收集
        parts.append("")
        parts.append("#### 生物收集")
        cc = core.get("creatureCollection")
        parts.append(str(cc).lower() if cc is not None else "false")
        
        # 获得方式
        cs = core.get("captureSystem")
        if cs:
            parts.append("")
            parts.append("#### 获得方式")
            parts.append(cs)
        
        # 进化系统
        es = core.get("evolutionSystem")
        if es:
            parts.append("")
            parts.append("#### 进化系统")
            parts.append(es)
        
        # 队伍构建
        tb = core.get("teamBuilding")
        if tb:
            parts.append("")
            parts.append("#### 队伍构建")
            parts.append(tb)
        
        # 玩家体验
        pe = core.get("playerExperience")
        if pe:
            parts.append("")
            parts.append("### 玩家体验")
            parts.append(pe)
    
    # ========== 战斗系统 ==========
    battle = analysis.get("battleSystem", {})
    if battle:
        parts.append("")
        parts.append("### 战斗系统")
        
        # 来源
        battle_meta = battle.get("metadata", {})
        sources = battle_meta.get("sourceOfTruth", [])
        if sources:
            parts.append("来源：" + "".join(sources))
        
        # 关键词
        battle_keys = battle_meta.get("keyInsights", [])
        if battle_keys:
            parts.append("，".join(battle_keys))
        
        parts.append("")
        
        # 回合机制
        tm = battle.get("turnMechanism")
        if tm:
            parts.append("#### 回合机制")
            parts.append(tm)
        
        # 属性克制
        ta = battle.get("typeAdvantages")
        if ta:
            parts.append("")
            parts.append("#### 属性克制")
            parts.append(ta)
        
        # 技能设计
        ms = battle.get("moveSystem")
        if ms:
            parts.append("")
            parts.append("#### 技能设计")
            parts.append(ms)
        
        # 战斗节奏
        bp = battle.get("battlePace")
        if bp:
            parts.append("")
            parts.append("#### 战斗节奏")
            parts.append(bp)
        
        # 独特机制
        um = battle.get("uniqueMechanics", [])
        if um:
            parts.append("")
            parts.append("#### 独特机制")
            for i, mech in enumerate(um, 1):
                parts.append(str(i))
                parts.append(mech)
    
    # ========== 差异化创新 ==========
    diff = analysis.get("differentiation", {})
    if diff:
        parts.append("")
        parts.append("### 差异化创新")
        
        # 来源
        diff_meta = diff.get("metadata", {})
        sources = diff_meta.get("sourceOfTruth", [])
        if sources:
            parts.append("来源：" + "".join(sources))
        
        # 关键词
        diff_keys = diff_meta.get("keyInsights", [])
        if diff_keys:
            parts.append("，".join(diff_keys))
        
        parts.append("")
        
        # 核心定位
        ct = diff.get("coreTag")
        if ct:
            parts.append("#### 核心定位")
            parts.append(ct)
        
        # 融合玩法
        cm = diff.get("combinedMechanics", [])
        if cm:
            parts.append("")
            parts.append("#### 融合玩法")
            for i, mech in enumerate(cm, 1):
                parts.append(str(i))
                parts.append(mech)
        
        # 成功原因
        ws = diff.get("whySuccessful")
        if ws:
            parts.append("")
            parts.append("#### 成功原因")
            parts.append(ws)
        
        # 市场定位
        mp = diff.get("marketPosition")
        if mp:
            parts.append("")
            parts.append("#### 市场定位")
            parts.append(mp)
    
    # ========== 差评分析 ==========
    neg = analysis.get("negativeFeedback", {})
    if neg:
        parts.append("")
        parts.append("### 差评分析")
        
        # 来源
        neg_meta = neg.get("metadata", {})
        sources = neg_meta.get("sourceOfTruth", [])
        if sources:
            parts.append("来源：" + "".join(sources))
        
        # 关键词
        neg_keys = neg_meta.get("keyInsights", [])
        if neg_keys:
            parts.append("，".join(neg_keys))
        
        parts.append("")
        
        # 差评概述
        summary = neg.get("summary")
        if summary:
            parts.append("#### 差评概述")
            parts.append(summary)
        
        # 主要抱怨
        tc = neg.get("topComplaints", [])
        if tc:
            parts.append("")
            parts.append("#### 玩家主要抱怨")
            for i, complaint in enumerate(tc, 1):
                parts.append(str(i))
                parts.append(complaint)
        
        # 设计缺陷
        dp = neg.get("designPitfalls", [])
        if dp:
            parts.append("")
            parts.append("#### 设计缺陷警示")
            for i, pitfall in enumerate(dp, 1):
                parts.append("")
                parts.append(f"设计缺陷{i}：")
                parts.append(pitfall)
    
    # ========== 设计建议 ==========
    sug = analysis.get("designSuggestions", {})
    if sug:
        parts.append("")
        parts.append("### 设计建议")
        
        # 来源
        sug_meta = sug.get("metadata", {})
        sources = sug_meta.get("sourceOfTruth", [])
        if sources:
            parts.append("来源：" + "".join(sources))
        
        # 关键词
        sug_keys = sug_meta.get("keyInsights", [])
        if sug_keys:
            parts.append("，".join(sug_keys))
        
        parts.append("")
        
        # 值得学习
        sl = sug.get("strengthsToLearn", [])
        if sl:
            parts.append("#### 值得学习")
            for i, strength in enumerate(sl, 1):
                parts.append(str(i))
                parts.append(strength)
        
        # 避坑提示
        pa = sug.get("pitfallsToAvoid", [])
        if pa:
            parts.append("")
            parts.append("#### 避坑提示")
            for i, pitfall in enumerate(pa, 1):
                parts.append(str(i))
                parts.append(pitfall)
        
        # 难度
        db = sug.get("difficultyBalance")
        if db:
            parts.append("")
            parts.append("#### 难度")
            parts.append(db)
        
        # 肝度
        ga = sug.get("grindAnalysis")
        if ga:
            parts.append("")
            parts.append("#### 肝度")
            parts.append(ga)
        
        # 综合建议
        rec = sug.get("recommendation")
        if rec:
            parts.append("")
            parts.append("#### 综合建议")
            parts.append(rec)
    
    # ========== 清理并返回 ==========
    return clean_text("\n\n".join(parts))


def get_safe_filename(name: str) -> str:
    """生成安全的文件名"""
    # 移除不安全字符
    unsafe = r'<>:"/\|?*'
    for char in unsafe:
        name = name.replace(char, "_")
    # 限制长度
    if len(name) > 100:
        name = name[:100]
    return name


def generate_all_docs(dry_run: bool = False, limit: int = None):
    """生成所有游戏的文档"""
    log("开始加载数据...")
    
    analyses = load_analyses()
    log(f"加载了 {len(analyses)} 条分析数据")
    
    b_pool_games = load_b_pool_games()
    b_pool_ids = {g["appId"] for g in b_pool_games}
    log(f"B池游戏数量: {len(b_pool_ids)}")
    
    # 找出已完成6模块分析的游戏
    COMPLETE_MODULES = {"verdict", "coreGameplay", "battleSystem", "differentiation", "negativeFeedback", "designSuggestions"}
    
    complete_games = []
    for game_id, data in analyses.items():
        analyzed = set(data.get("analyzedModules", []))
        if COMPLETE_MODULES.issubset(analyzed):
            complete_games.append((game_id, data))
    
    log(f"完成6模块分析的游戏: {len(complete_games)} 款")
    
    # 过滤出B池中的游戏
    b_pool_complete = [(gid, data) for gid, data in complete_games if gid in b_pool_ids]
    log(f"B池中完成分析的游戏: {len(b_pool_complete)} 款")
    
    # 确保目录存在
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 生成文档
    generated = 0
    skipped = 0
    
    for game_id, data in b_pool_complete:
        if limit and generated >= limit:
            break
        
        # 获取游戏名称作为文件名
        game_name = data.get("gameName", game_id)
        filename = f"{get_safe_filename(game_name)}.md"
        filepath = DOCS_DIR / filename
        
        # 检查文件是否已存在
        if filepath.exists() and not dry_run:
            # 检查内容是否完整
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            if len(content) > 1000:  # 已有内容
                log(f"跳过(已存在): {game_name}", "INFO")
                skipped += 1
                continue
        
        # 获取额外信息
        game_info = get_game_info(analyses, game_id, b_pool_games)
        
        if dry_run:
            log(f"将生成: {game_name} ({game_id})", "PROG")
            generated += 1
            continue
        
        # 生成markdown
        md_content = generate_markdown(game_id, data, game_info)
        
        # 写入文件
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(md_content)
        
        log(f"生成: {game_name} -> {filename}", "OK")
        generated += 1
    
    log("")
    log(f"完成! 生成: {generated}, 跳过: {skipped}", "OK")
    
    # 列出未生成的游戏
    if not dry_run:
        existing = set()
        for f in DOCS_DIR.glob("*.md"):
            existing.add(f.stem)
        
        b_pool_complete_names = {gid for gid, _ in b_pool_complete}
        missing = b_pool_complete_names - existing
        
        if missing:
            log(f"\n以下B池游戏已完成分析但未生成文档:", "WARN")
            for gid in sorted(missing):
                name = analyses.get(gid, {}).get("gameName", gid)
                log(f"  - {name} ({gid})", "WARN")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="生成宝可梦Like游戏分析文档")
    parser.add_argument("--dry-run", "-d", action="store_true", help="仅列出待生成的游戏")
    parser.add_argument("--limit", "-l", type=int, default=None, help="限制生成数量")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("生成宝可梦Like游戏分析文档")
    print("=" * 60)
    
    generate_all_docs(dry_run=args.dry_run, limit=args.limit)
