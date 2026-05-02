# -*- coding: utf-8 -*-
"""
SQLite 数据同步脚本 - 自包含版本，使用正确的项目路径
将 games-index.json 中的所有数据同步到 SQLite 数据库
"""
import json
import sqlite3
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 项目路径
DATA_DIR = r'D:\vibe codeing\steam游戏全域搜素\public\data'
INDEX_FILE = DATA_DIR + r'\games-index.json'
DB_FILE = DATA_DIR + r'\games.db'

BATCH_SIZE = 1000

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
    if not release_data:
        return ''
    date_str = str(release_data).strip()
    from datetime import datetime
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
        if s is None or s == '':
            return []
        if isinstance(s, list):
            return s
        return json.loads(s)
    except:
        return []


def safe_json_loads_dict(s):
    try:
        if s is None or s == '':
            return {}
        if isinstance(s, dict):
            return s
        return json.loads(s)
    except:
        return {}


def safe_str(s, maxlen=None):
    if s is None:
        return ''
    result = str(s)
    if maxlen and len(result) > maxlen:
        return result[:maxlen]
    return result


def prepare_game_record(data, appid):
    return (
        appid,
        data.get('name', ''),
        parse_release_date(data.get('release_date')),
        data.get('header_image', ''),
        safe_str(data.get('short_description'), 2000),
        data.get('estimated_owners', ''),
        float(data.get('price', 0) or 0),
        int(data.get('positive', 0) or 0),
        int(data.get('negative', 0) or 0),
        int(data.get('peak_ccu', 0) or 0),
        int(data.get('metacritic_score', 0) or 0),
        1 if data.get('_p0_fetched') else 0,
        1 if data.get('_is_test_version') else 0,
        1 if data.get('_is_suspicious_delisted') else 0,
        int(time.time()),
    )


def prepare_json_record(data, appid):
    genres = normalize_genres(safe_json_loads(data.get('genres', [])))
    categories = normalize_categories(safe_json_loads(data.get('categories', [])))
    tags = data.get('tags', {})
    if isinstance(tags, dict):
        tags_str = json.dumps(tags, ensure_ascii=False)
    else:
        tags_str = json.dumps({}, ensure_ascii=False)
    screenshots = data.get('screenshots', [])
    if isinstance(screenshots, list):
        screenshots_str = json.dumps(screenshots, ensure_ascii=False)
    else:
        screenshots_str = json.dumps([], ensure_ascii=False)

    return (
        appid,
        json.dumps(safe_json_loads(data.get('developers', [])), ensure_ascii=False),
        json.dumps(safe_json_loads(data.get('publishers', [])), ensure_ascii=False),
        json.dumps(genres, ensure_ascii=False),
        json.dumps(categories, ensure_ascii=False),
        screenshots_str,
        tags_str,
        safe_str(data.get('detailed_description'), 100000),
        safe_str(data.get('about_the_game'), 100000),
        data.get('website', ''),
    )


def create_tables(conn):
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS games (
            appid INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            release_date TEXT,
            header_image TEXT,
            short_description TEXT,
            estimated_owners TEXT,
            price REAL DEFAULT 0,
            positive INTEGER DEFAULT 0,
            negative INTEGER DEFAULT 0,
            peak_ccu INTEGER DEFAULT 0,
            metacritic_score INTEGER DEFAULT 0,
            _p0_fetched INTEGER DEFAULT 0,
            _is_test_version INTEGER DEFAULT 0,
            _is_suspicious_delisted INTEGER DEFAULT 0,
            _last_updated INTEGER DEFAULT 0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS games_json (
            appid INTEGER PRIMARY KEY,
            developers TEXT,
            publishers TEXT,
            genres TEXT,
            categories TEXT,
            screenshots TEXT,
            tags TEXT,
            detailed_description TEXT,
            about_the_game TEXT,
            website TEXT
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_name ON games(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_positive ON games(positive DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_release ON games(release_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_price ON games(price)')
    conn.commit()


def log(msg, level='INFO'):
    prefix = {'INFO': '  ', 'STEP': '[=]', 'OK': '[OK]', 'WARN': '[!]', 'FAIL': '[X]', 'PROG': '[>]'}.get(level, '  ')
    print(f'{prefix} {msg}', flush=True)


def main():
    log('=' * 60)
    log('SQLite 数据同步工具')
    log('=' * 60)

    t0 = time.time()

    # 加载 JSON
    log(f'加载 {INDEX_FILE}...')
    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    log(f'加载完成: {len(json_data):,} 个游戏')

    # 连接数据库
    conn = sqlite3.connect(DB_FILE)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    create_tables(conn)

    # 获取已存在的 appid
    cursor = conn.cursor()
    cursor.execute('SELECT appid FROM games')
    existing_ids = set(row[0] for row in cursor.fetchall())
    log(f'SQLite 已有: {len(existing_ids):,} 个游戏')

    # 批量同步
    games_batch = []
    json_batch = []
    processed = 0

    for appid_str, game in json_data.items():
        appid = int(appid_str)
        games_batch.append(prepare_game_record(game, appid))
        json_batch.append(prepare_json_record(game, appid))

        if len(games_batch) >= BATCH_SIZE:
            _execute_batch(conn, cursor, games_batch, json_batch)
            processed += len(games_batch)
            log(f'  已同步: {processed:,} / {len(json_data):,}')
            games_batch = []
            json_batch = []

    # 剩余数据
    if games_batch:
        _execute_batch(conn, cursor, games_batch, json_batch)
        processed += len(games_batch)

    conn.close()

    # 验证
    conn2 = sqlite3.connect(DB_FILE)
    cur = conn2.cursor()
    cur.execute('SELECT COUNT(*) FROM games')
    total = cur.fetchone()[0]
    conn2.close()

    elapsed = time.time() - t0
    log(f'同步完成: {total:,} 个游戏, 耗时 {elapsed:.0f}s ({elapsed/60:.1f}分钟)')
    log(f'数据库: {DB_FILE}')


def _execute_batch(conn, cursor, games_batch, json_batch):
    cursor.executemany('''
        INSERT OR REPLACE INTO games
        (appid, name, release_date, header_image, short_description,
         estimated_owners, price, positive, negative, peak_ccu,
         metacritic_score, _p0_fetched, _is_test_version,
         _is_suspicious_delisted, _last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', games_batch)
    cursor.executemany('''
        INSERT OR REPLACE INTO games_json
        (appid, developers, publishers, genres, categories,
         screenshots, tags, detailed_description, about_the_game, website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', json_batch)
    conn.commit()


if __name__ == '__main__':
    main()
