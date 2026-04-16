# -*- coding: utf-8 -*-
"""
数据处理工具 - JSON加载保存、数据规范化、日期解析等
"""
import json
import time
import re
from pathlib import Path
from typing import Optional
from datetime import datetime

from config import (
    INDEX_FILE, BACKUP_FILE, TEMP_FILE,
    INCR_BACKUP_FILE, INCR_TEMP_FILE
)
from logging_utils import log

# ============ JSON 文件操作 ============

def load_games_index(index_path: Optional[Path] = None) -> dict:
    """
    加载 games-index.json 文件

    Args:
        index_path: JSON 文件路径，默认使用 INDEX_FILE

    Returns:
        dict: 游戏数据字典，key 为 appid 字符串，value 为游戏数据
    """
    path = index_path or INDEX_FILE
    log(f'加载 {path}...')
    t0 = time.time()

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    log(f'加载完成: {len(data):,} 个游戏，耗时 {time.time()-t0:.1f}s')
    return data


def safe_save_json(data: dict, path: Path, backup_path: Optional[Path] = None) -> bool:
    """
    安全保存 JSON 文件，先写入临时文件再替换

    Args:
        data: 要保存的数据
        path: 目标文件路径
        backup_path: 备份文件路径

    Returns:
        bool: 是否保存成功
    """
    path = Path(path)
    backup_path = Path(backup_path) if backup_path else None

    try:
        # 写入临时文件
        temp_path = path.with_suffix('.temp')
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 如果有备份，先备份原文件
        if backup_path:
            if path.exists():
                import shutil
                shutil.copy2(path, backup_path)

        # 替换原文件
        if path.exists():
            path.unlink()
        temp_path.rename(path)

        return True
    except Exception as e:
        log(f'保存失败: {e}')
        # 清理临时文件
        temp_path = path.with_suffix('.temp')
        if temp_path.exists():
            temp_path.unlink()
        return False


# ============ Steam 数据规范化 ============

# Steam genres ID 映射表（2025年末验证）
GENRE_ID_MAP = {
    "1": "Action",
    "2": "Strategy",
    "3": "RPG",
    "4": "Casual",
    "7": "Education",
    "8": "Utilities",
    "9": "Racing",
    "10": "Photo Editing",
    "13": "Sports",
    "17": "Documentary",
    "18": "Sports",
    "20": "Software Training",
    "23": "Indie",
    "24": "Video Production",
    "25": "Adventure",
    "26": "Violent",
    "27": "Nudity",
    "28": "Simulation",
    "29": "Massively Multiplayer",
    "30": "Farming Sim",
    "35": "Free To Play",
    "37": "Free To Play",
    "41": "Animation & Modeling",
    "42": "Audio Production",
    "44": "Design & Illustration",
    "47": "Tutorial",
    "51": "Game Development",
    "52": "Turn-Based Strategy",
    "55": "Software",
    "56": "Audio Production",
    "57": "Violent",
    "58": "Gore",
    "59": "Sexual Content",
    "60": "Animation & Modeling",
    "61": "Video Production",
    "62": "Design & Illustration",
    "63": "Education",
    "65": "Game Development",
    "66": "Education",
    "68": "Board Games",
    "69": "Puzzle",
    "70": "Tutorial",
    "71": "Education",
    "73": "Education",
    "74": "Education",
    "75": "Education",
    "77": "Education",
    "78": "Education",
    "79": "Education",
    "80": "Game Development",
    "81": "Sports",
    "82": "Tutorial",
    "83": "Utilities",
    "84": "Utilities",
    "85": "Utilities",
    "86": "Utilities",
    "87": "Utilities",
    "88": "Utilities",
    "89": "Utilities",
    "90": "Utilities",
    "91": "Utilities",
    "92": "Utilities",
    "93": "Utilities",
    "94": "Utilities",
    "95": "Utilities",
    "96": "Utilities",
    "97": "Utilities",
    "98": "Utilities",
    "99": "Utilities",
    "100": "Utilities",
    "101": "Utilities",
    "102": "Utilities",
    "103": "Utilities",
    "104": "Utilities",
    "105": "Utilities",
    "106": "Utilities",
    "107": "Utilities",
    "108": "Utilities",
    "109": "Utilities",
    "110": "Utilities",
}

# Steam categories ID 映射表
CATEGORY_ID_MAP = {
    "1": "Multi-player",
    "2": "Single-player",
    "3": "Online Multi-Player",
    "4": "Local Multi-Player",
    "5": "Co-op",
    "6": "Online Co-op",
    "7": "Local Co-op",
    "8": "Cross-Platform Multiplayer",
    "9": "MMO",
    "10": "Achievements",
    "11": "Steam Trading Cards",
    "13": "Steam Workshop",
    "15": "Valve Anti-Cheat enabled",
    "17": "Captions available",
    "18": "Includes Source SDK",
    "20": "Commentary available",
    "22": "Atomic",
    "23": "Level Editor",
    "24": "Support",
    "25": "Video",
    "26": "Documentation",
    "27": "Soundtracks",
    "28": "Statistics",
    "29": "SteamVR Home",
    "30": "Shared/Split Screen",
    "31": "Turn-based",
    "32": "Overlay",
    "35": "VR Support",
    "36": "VR Only",
    "37": "Valve Anti-Cheat",
    "38": "Multi-player",
    "39": "Single-player",
    "40": "Downloadable Content",
    "41": "Free To Play",
    "42": "Playspace",
    "43": "Includes level editor",
    "44": "Browser",
    "45": "Cloud Gaming",
}


def normalize_genres(genres):
    """
    标准化 genres 字段，处理新旧两种格式

    Args:
        genres: 原始 genres 数据（可能是列表或字典）

    Returns:
        list: 标准化后的 genres 列表
    """
    if not genres:
        return []

    result = []
    for g in genres:
        if isinstance(g, dict):
            # 新格式：{id: "1", description: "Action"}
            if 'description' in g:
                result.append(g['description'])
            elif 'id' in g:
                # 尝试通过 ID 映射
                gid = str(g.get('id', ''))
                if gid in GENRE_ID_MAP:
                    result.append(GENRE_ID_MAP[gid])
        elif isinstance(g, str):
            # 旧格式：已经是字符串
            if g:
                result.append(g)
        elif isinstance(g, (int, float)):
            # ID 格式：["1", "25", "4"] 或 [2,10,29]
            gid = str(int(g))
            if gid in GENRE_ID_MAP:
                result.append(GENRE_ID_MAP[gid])

    return result


def normalize_categories(categories):
    """
    标准化 categories 字段，处理新旧两种格式

    Args:
        categories: 原始 categories 数据

    Returns:
        list: 标准化后的 categories 列表
    """
    if not categories:
        return []

    result = []
    for c in categories:
        if isinstance(c, dict):
            if 'description' in c:
                result.append(c['description'])
            elif 'id' in c:
                cid = str(c.get('id', ''))
                if cid in CATEGORY_ID_MAP:
                    result.append(CATEGORY_ID_MAP[cid])
        elif isinstance(c, str):
            if c:
                result.append(c)
        elif isinstance(c, (int, float)):
            cid = str(int(c))
            if cid in CATEGORY_ID_MAP:
                result.append(CATEGORY_ID_MAP[cid])

    return result


def parse_release_date(release_date):
    """
    解析游戏发布日期，支持多种格式

    Args:
        release_date: 原始日期数据（字符串或字典）

    Returns:
        str: 标准化后的日期字符串，格式为 YYYY-MM-DD
              如果无法解析，返回空字符串
    """
    if not release_date:
        return ''

    # 字符串格式
    if isinstance(release_date, str):
        date_str = release_date.strip()

        # 尝试中文格式：2026年4月13日
        match = re.match(r'(\d{4})年(\d{1,2})月(\d{1,2})日', date_str)
        if match:
            year, month, day = match.groups()
            return f'{year}-{int(month):02d}-{int(day):02d}'

        # 尝试英文格式：Apr 13, 2026
        try:
            dt = datetime.strptime(date_str, '%b %d, %Y')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass

        # 尝试 ISO 格式：2026-04-13
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return date_str
        except ValueError:
            pass

        return date_str

    # 字典格式：{coming_soon: bool, date: str}
    if isinstance(release_date, dict):
        if 'date' in release_date:
            return parse_release_date(release_date['date'])
        if release_date.get('coming_soon'):
            return ''

    return ''


def normalize_tags(tags):
    """
    标准化 tags 字段

    Args:
        tags: 原始 tags 数据（字典或列表）

    Returns:
        dict: 标准化后的 tags 字典 {tag_name: count}
    """
    if not tags:
        return {}

    if isinstance(tags, dict):
        return tags

    if isinstance(tags, list):
        # 列表格式转换为字典
        result = {}
        for tag in tags:
            if isinstance(tag, str):
                result[tag] = 1
        return result

    return {}


# ============ 游戏数据准备 ============

def prepare_game_record(data: dict) -> tuple:
    """
    准备游戏主表记录

    Args:
        data: 游戏数据字典

    Returns:
        tuple: (appid, name, release_date, header_image, short_description,
                estimated_owners, price, positive, negative, peak_ccu,
                metacritic_score, _p0_fetched, _is_test_version,
                _is_suspicious_delisted, _last_updated)
    """
    return (
        int(data.get('appid', 0)),
        data.get('name', ''),
        parse_release_date(data.get('release_date')),
        data.get('header_image', ''),
        data.get('short_description', ''),
        data.get('estimated_owners', ''),
        float(data.get('price', 0) or 0),
        int(data.get('positive', 0) or 0),
        int(data.get('negative', 0) or 0),
        int(data.get('peak_ccu', 0) or 0),
        int(data.get('metacritic_score', 0) or 0),
        1 if data.get('_p0_fetched') else 0,
        1 if data.get('_is_test_version') else 0,
        1 if data.get('_is_suspicious_delisted') else 0,
        int(time.time())
    )


def prepare_json_record(data: dict) -> tuple:
    """
    准备游戏 JSON 字段记录

    Args:
        data: 游戏数据字典

    Returns:
        tuple: (appid, developers, publishers, genres, categories,
                screenshots, tags, detailed_description, about_the_game, website)
    """
    # 标准化 genres 和 categories
    genres = normalize_genres(data.get('genres', []))
    categories = normalize_categories(data.get('categories', []))

    # 标准化 tags
    tags = data.get('tags', {})
    if isinstance(tags, dict):
        tags_str = json.dumps(tags, ensure_ascii=False)
    else:
        tags_str = json.dumps({}, ensure_ascii=False)

    return (
        int(data.get('appid', 0)),
        json.dumps(data.get('developers', []), ensure_ascii=False),
        json.dumps(data.get('publishers', []), ensure_ascii=False),
        json.dumps(genres, ensure_ascii=False),
        json.dumps(categories, ensure_ascii=False),
        json.dumps(data.get('screenshots', []), ensure_ascii=False),
        tags_str,
        data.get('detailed_description', ''),
        data.get('about_the_game', ''),
        data.get('website', '')
    )
