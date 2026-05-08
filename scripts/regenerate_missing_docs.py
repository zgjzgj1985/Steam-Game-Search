# -*- coding: utf-8 -*-
"""
重新生成缺失的文档
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
DATA_DIR = PROJECT_ROOT / "public" / "data"
DOCS_DIR = PROJECT_ROOT / "docs" / "LLM详细分析宝可梦like案例"
ANALYSES_FILE = DATA_DIR / "analyses.json"

# 文件名映射（doc名 -> 实际游戏名）
FILENAME_MAPPING = {
    "Atrio_ The Dark Wild": "Atrio: The Dark Wild",
    "Bloomtown_ A Different Story": "Bloomtown: A Different Story",
    "Forgotten Realms_ The Archives - Collection One": "Forgotten Realms: The Archives - Collection One",
    "FurryFury_ Smash & Roll": "FurryFury: Smash & Roll",
    "moon_ Remix RPG Adventure": "moon: Remix RPG Adventure",
}

def clean_text(text):
    """清理文本"""
    if not text:
        return ""
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())

def get_safe_filename(name):
    """生成安全的文件名"""
    unsafe = r'<>:"/\|?*'
    for char in unsafe:
        name = name.replace(char, "_")
    if len(name) > 100:
        name = name[:100]
    return name

def generate_markdown(game_id, analysis, game_data):
    """生成markdown文档"""
    parts = []
    
    # 元数据头部
    devs = game_data.get("developers", [])
    dev_str = devs[0] if devs else ""
    genres = "RPG"
    
    parts.append("{}，{}".format(genres, dev_str))
    
    # 发售日期和价格
    release = game_data.get("release_date", "")
    price = game_data.get("price", 0)
    if release:
        parts.append("{}，{}".format(release, price))
    
    # 好评率和评价数
    positive = game_data.get("positive", 0)
    negative = game_data.get("negative", 0)
    total = positive + negative
    if total > 0:
        rating = round((positive / total) * 100)
        parts.append("{}%好评率，{} 条评价".format(rating, total))
    
    parts.append("")
    
    # 一句话总结
    verdict = analysis.get("verdict", {})
    if verdict.get("verdict"):
        parts.append(verdict["verdict"])
    parts.append("")
    
    # 核心玩法
    core = analysis.get("coreGameplay", {})
    if core:
        parts.append("### 核心玩法")
        parts.append("来源：Steam Store PageSteam ReviewsCommunity Wiki/Guides")
        parts.append("")
        if core.get("description"):
            parts.append(core["description"])
        parts.append("")
        parts.append("#### 生物收集")
        cc = core.get("creatureCollection")
        parts.append(str(cc).lower() if cc is not None else "false")
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
    
    # 战斗系统
    battle = analysis.get("battleSystem", {})
    if battle:
        parts.append("")
        parts.append("### 战斗系统")
        parts.append("来源：Steam Store Data & Reviews")
        parts.append("")
        if battle.get("turnMechanism"):
            parts.append("#### 回合机制")
            parts.append(battle["turnMechanism"])
        if battle.get("typeAdvantages"):
            parts.append("")
            parts.append("#### 属性克制")
            parts.append(battle["typeAdvantages"])
        if battle.get("moveSystem"):
            parts.append("")
            parts.append("#### 技能设计")
            parts.append(battle["moveSystem"])
        if battle.get("battlePace"):
            parts.append("")
            parts.append("#### 战斗节奏")
            parts.append(battle["battlePace"])
        unique = battle.get("uniqueMechanics", [])
        if unique:
            parts.append("")
            parts.append("#### 独特机制")
            for i, mech in enumerate(unique, 1):
                parts.append(str(i))
                parts.append(mech)
    
    # 差异化创新
    diff = analysis.get("differentiation", {})
    if diff:
        parts.append("")
        parts.append("### 差异化创新")
        parts.append("来源：Steam Store Page & User Reviews")
        parts.append("")
        if diff.get("coreTag"):
            parts.append("#### 核心定位")
            parts.append(diff["coreTag"])
        combined = diff.get("combinedMechanics", [])
        if combined:
            parts.append("")
            parts.append("#### 融合玩法")
            for i, mech in enumerate(combined, 1):
                parts.append(str(i))
                parts.append(mech)
        if diff.get("whySuccessful"):
            parts.append("")
            parts.append("#### 成功原因")
            parts.append(diff["whySuccessful"])
        if diff.get("marketPosition"):
            parts.append("")
            parts.append("#### 市场定位")
            parts.append(diff["marketPosition"])
    
    # 差评分析
    neg = analysis.get("negativeFeedback", {})
    if neg:
        parts.append("")
        parts.append("### 差评分析")
        parts.append("来源：Steam Review Database")
        parts.append("")
        if neg.get("summary"):
            parts.append("#### 差评概述")
            parts.append(neg["summary"])
        complaints = neg.get("topComplaints", [])
        if complaints:
            parts.append("")
            parts.append("#### 玩家主要抱怨")
            for i, complaint in enumerate(complaints, 1):
                parts.append(str(i))
                parts.append(complaint)
        pitfalls = neg.get("designPitfalls", [])
        if pitfalls:
            parts.append("")
            parts.append("#### 设计缺陷警示")
            for i, pitfall in enumerate(pitfalls, 1):
                parts.append("")
                parts.append("设计缺陷{}：".format(i))
                parts.append(pitfall)
    
    # 设计建议
    sug = analysis.get("designSuggestions", {})
    if sug:
        parts.append("")
        parts.append("### 设计建议")
        parts.append("来源：Steam Player Reviews & Community Hub")
        parts.append("")
        strengths = sug.get("strengthsToLearn", [])
        if strengths:
            parts.append("#### 值得学习")
            for i, strength in enumerate(strengths, 1):
                parts.append(str(i))
                parts.append(strength)
        pitfalls = sug.get("pitfallsToAvoid", [])
        if pitfalls:
            parts.append("")
            parts.append("#### 避坑提示")
            for i, pitfall in enumerate(pitfalls, 1):
                parts.append(str(i))
                parts.append(pitfall)
        if sug.get("difficultyBalance"):
            parts.append("")
            parts.append("#### 难度")
            parts.append(sug["difficultyBalance"])
        if sug.get("grindAnalysis"):
            parts.append("")
            parts.append("#### 肝度")
            parts.append(sug["grindAnalysis"])
        if sug.get("recommendation"):
            parts.append("")
            parts.append("#### 综合建议")
            parts.append(sug["recommendation"])
    
    return clean_text("\n\n".join(parts))

def main():
    print("=" * 60)
    print("重新生成缺失的文档")
    print("=" * 60)
    
    # 加载分析数据
    print("\n加载分析数据...")
    with open(ANALYSES_FILE, "r", encoding="utf-8") as f:
        analyses = json.load(f)
    print("加载了 {} 条分析".format(len(analyses)))
    
    # 加载游戏数据
    games_index = PROJECT_ROOT / "public" / "data" / "games-index.json"
    with open(games_index, "r", encoding="utf-8") as f:
        games_data = json.load(f)
    print("加载了 {} 个游戏".format(len(games_data)))
    
    # 构建appId -> gameName映射
    appid_to_name = {v.get("gameId"): k for k, v in analyses.items()}
    
    # 遍历需要生成的游戏
    for doc_name, game_name in FILENAME_MAPPING.items():
        # 查找对应的分析数据
        target_appid = None
        for appid, data in analyses.items():
            if data.get("gameName") == game_name:
                target_appid = appid
                break
        
        if not target_appid:
            print("未找到分析数据: {}".format(game_name))
            continue
        
        analysis = analyses[target_appid]
        game_data = games_data.get(target_appid, {})
        
        # 生成markdown
        md_content = generate_markdown(target_appid, analysis, game_data)
        
        # 写入文件
        safe_filename = get_safe_filename(game_name)
        filepath = DOCS_DIR / "{}.md".format(safe_filename)
        
        # 如果旧文件存在，先删除
        old_filepath = DOCS_DIR / "{}.md".format(doc_name)
        if old_filepath.exists():
            old_filepath.unlink()
            print("删除旧文件: {}".format(doc_name))
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(md_content)
        print("生成: {} -> {}".format(game_name, safe_filename))
    
    # 统计
    remaining = list(DOCS_DIR.glob("*.md"))
    print("\n目录下剩余文档: {} 个".format(len(remaining)))

if __name__ == "__main__":
    main()
