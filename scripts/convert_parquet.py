# -*- coding: utf-8 -*-
"""
将 HuggingFace parquet 数据集转换为 games-index.json 格式
"""
import json
import pandas as pd
import re
from pathlib import Path
from datetime import datetime

PARQUET_FILE = Path(r'D:\vibe codeing\steam游戏全域搜素\public\data\train-00000-of-00001.parquet')
OUTPUT_FILE = Path(r'D:\vibe codeing\steam游戏全域搜素\public\data\games-index.json')

# Steam genres ID 映射表
GENRE_ID_MAP = {
    "1": "Action", "2": "Strategy", "3": "RPG", "4": "Casual",
    "7": "Education", "8": "Utilities", "9": "Racing", "10": "Photo Editing",
    "13": "Sports", "17": "Documentary", "18": "Sports", "20": "Software Training",
    "23": "Indie", "24": "Video Production", "25": "Adventure", "26": "Violent",
    "27": "Nudity", "28": "Simulation", "29": "Massively Multiplayer",
    "30": "Farming Sim", "35": "Free To Play", "37": "Free To Play",
    "51": "Animation & Modeling", "52": "Audio Production",
    "53": "Design & Illustration", "54": "Education", "55": "Photo Editing",
    "56": "Software Training", "57": "Utilities", "58": "Video Production",
    "59": "Web Publishing", "60": "Game Development", "70": "Early Access",
}

CATEGORY_ID_MAP = {
    1: "Multi-player", 2: "PvP", 8: "Anti-Cheat", 9: "Steam Cloud",
    10: "Steam Leaderboards", 13: "Single-player", 14: "Full controller support",
    15: "Steam Trading Cards", 17: "Steam Workshop", 18: "In-App Product",
    20: "Valve Anti-Cheat", 21: "Captions available", 22: "Includes Source SDK",
    23: "Includes Source Filmmaker", 24: "Commentary available",
    25: "Dynamic Renaming", 27: "Clan Chat", 28: "Chat", 29: "Voice Chat",
    30: "Broadcast", 32: "User Generated Content", 35: "Mods",
    36: "Online PvP", 37: "Shared/Split Screen PvP",
    38: "Cross-Platform Multiplayer", 39: "Online Co-op", 41: "Co-op",
    42: "Local Co-op", 43: "Shared/Split Screen Co-op",
    44: "Shared/Split Screen", 47: "MMO", 48: "Open World", 49: "PvE",
    50: "Partial Controller Support", 52: "Local Multi-player",
    53: "Asynchronous Multiplayer", 54: "Turn-based", 61: "Online Game",
    62: "Virtual Reality", 63: "SteamVR Teleportation", 64: "3D Vision",
    65: "Tracked Motion Controllers", 66: "Room Scale", 67: "Seated",
    68: "Standing", 69: "Native Vive", 70: "Native Rift", 71: "Native WMR",
    72: "GPU Access", 73: "HDR", 74: "Steam Input API", 75: "Reflex",
    76: "DualSense", 77: "DualShock", 78: "Xbox", 79: "Sega",
}


def normalize_genres(raw):
    if not raw or not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    if isinstance(first, dict) and 'description' in first:
        return [g.get('description', '') for g in raw if g.get('description')]
    if isinstance(first, (str, int)):
        result = []
        for item in raw:
            key = str(int(item)) if isinstance(item, (int, str)) and str(item).isdigit() else None
            if key and key in GENRE_ID_MAP:
                result.append(GENRE_ID_MAP[key])
        return result
    if isinstance(first, str):
        return raw
    return []


def normalize_categories(raw):
    if not raw or not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    if isinstance(first, dict) and 'description' in first:
        return [c.get('description', '') for c in raw if c.get('description')]
    if isinstance(first, (int, str)):
        result = []
        for item in raw:
            try:
                key = int(item) if isinstance(item, str) else item
                if key in CATEGORY_ID_MAP:
                    result.append(CATEGORY_ID_MAP[key])
            except (ValueError, TypeError):
                continue
        return result
    return []


def parse_release_date(release_data):
    if pd.isna(release_data) or release_data is None:
        return ''
    if isinstance(release_data, dict):
        date_str = release_data.get('date', '')
    else:
        date_str = str(release_data)
    date_str = ' '.join(date_str.split())
    if '年' in date_str and '月' in date_str:
        normalized = date_str.replace(' ', '').replace('  ', '')
        for fmt in ['%Y年%m月%d日', '%Y年%m月']:
            try:
                dt = datetime.strptime(normalized, fmt)
                return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
            except:
                continue
    for fmt in ['%Y-%m-%d', '%b %d, %Y', '%b, %Y']:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
        except ValueError:
            continue
    return date_str


def safe_json_loads(s):
    try:
        if pd.isna(s) or s is None:
            return []
        if isinstance(s, list):
            return s
        return json.loads(s)
    except:
        return []


def safe_json_loads_dict(s):
    try:
        if pd.isna(s) or s is None:
            return {}
        if isinstance(s, dict):
            return s
        return json.loads(s)
    except:
        return {}


def safe_str(s):
    if pd.isna(s) or s is None:
        return ''
    return str(s)


def convert_row(row):
    """将一行数据转换为 games-index.json 格式"""
    appid = str(int(row['appID']))
    tags_data = row['tags']
    if isinstance(tags_data, dict):
        tags = tags_data
    elif isinstance(tags_data, list):
        tags = {t: 1 for t in tags_data if isinstance(t, str)}
    else:
        tags = safe_json_loads_dict(tags_data)

    screenshots_data = row['screenshots']
    if isinstance(screenshots_data, list):
        screenshots = screenshots_data
    else:
        screenshots = safe_json_loads(screenshots_data)

    return appid, {
        'appid': appid,
        'name': safe_str(row['name']),
        'release_date': parse_release_date(row['release_date']),
        'estimated_owners': safe_str(row['estimated_owners']),
        'peak_ccu': int(row['peak_ccu']) if not pd.isna(row['peak_ccu']) else 0,
        'price': float(row['price']) if not pd.isna(row['price']) else 0,
        'positive': int(row['positive']) if not pd.isna(row['positive']) else 0,
        'negative': int(row['negative']) if not pd.isna(row['negative']) else 0,
        'metacritic_score': int(row['metacritic_score']) if not pd.isna(row['metacritic_score']) else 0,
        'header_image': safe_str(row['header_image']),
        'short_description': safe_str(row['short_description'])[:1000],
        'detailed_description': safe_str(row['detailed_description'])[:50000],
        'developers': safe_json_loads(row['developers']),
        'publishers': safe_json_loads(row['publishers']),
        'genres': normalize_genres(safe_json_loads(row['genres'])),
        'categories': normalize_categories(safe_json_loads(row['categories'])),
        'screenshots': screenshots[:10],
        'tags': tags,
        'website': safe_str(row['website']),
        '_p0_fetched': (int(row['positive']) > 0) if not pd.isna(row['positive']) else False,
    }


def main():
    print(f'Loading parquet: {PARQUET_FILE}')
    df = pd.read_parquet(PARQUET_FILE)
    print(f'Loaded {len(df)} rows, {len(df.columns)} columns')

    print('Converting to games-index format...')
    games_dict = {}
    for i, row in df.iterrows():
        if i % 10000 == 0:
            print(f'  Progress: {i}/{len(df)} ({i/len(df)*100:.1f}%)')
        appid, game = convert_row(row)
        games_dict[appid] = game

    print(f'Converted {len(games_dict)} games')
    print(f'Writing to {OUTPUT_FILE}...')

    # 先写临时文件，再替换
    temp_file = OUTPUT_FILE.with_suffix('.json.temp')
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(games_dict, f, ensure_ascii=False, indent=None)

    if OUTPUT_FILE.exists():
        OUTPUT_FILE.unlink()
    temp_file.rename(OUTPUT_FILE)

    # 验证
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        loaded = json.load(f)
    print(f'Verified: {len(loaded)} games in {OUTPUT_FILE}')
    print(f'File size: {OUTPUT_FILE.stat().st_size / 1024 / 1024:.1f} MB')

    # 清理 parquet
    PARQUET_FILE.unlink()
    print(f'Deleted parquet file')


if __name__ == '__main__':
    main()
