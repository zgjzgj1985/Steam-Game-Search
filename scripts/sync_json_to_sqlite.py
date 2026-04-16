"""
SQLite 数据同步脚本
将 games-index.json 中的所有数据同步到 SQLite 数据库
处理增量数据（新游戏插入）和现有数据更新
"""
import json
import sqlite3
import time
from pathlib import Path

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
DB_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games.db')

def log(msg):
    print(msg, flush=True)

def create_tables(conn):
    """创建数据库表（如果不存在）"""
    cursor = conn.cursor()

    # 游戏主表
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
            _last_updated INTEGER DEFAULT 0
        )
    ''')

    # JSON字段表
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

    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_name ON games(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_positive ON games(positive DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_release ON games(release_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_price ON games(price)')

    conn.commit()

def sync_to_sqlite(index_path, db_path):
    """同步 JSON 数据到 SQLite"""
    log(f'加载 {index_path}...')
    t0 = time.time()

    with open(index_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)

    log(f'JSON 文件包含 {len(json_data):,} 个游戏，耗时 {time.time()-t0:.1f}s')
    log('')

    # 创建/连接数据库
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')

    create_tables(conn)

    # 获取 SQLite 中现有的游戏
    log('检查现有数据...')
    cursor = conn.cursor()
    cursor.execute('SELECT appid FROM games')
    existing_ids = set(row[0] for row in cursor.fetchall())
    log(f'SQLite 现有 {len(existing_ids):,} 个游戏')

    # 统计
    stats = {
        'new': 0,
        'updated': 0,
        'unchanged': 0,
        'errors': 0
    }

    # 批量处理
    batch_size = 1000
    games_batch = []
    json_batch = []
    appids_in_batch = set()

    t0 = time.time()
    json_appids = set(int(k) for k in json_data.keys())

    # 找出需要新增和更新的游戏
    new_appids = json_appids - existing_ids
    existing_appids = json_appids & existing_ids

    log(f'新增: {len(new_appids):,} | 更新: {len(existing_appids):,}')

    # 处理所有游戏
    for appid_str, game in json_data.items():
        appid = int(appid_str)

        # 主表数据
        games_batch.append((
            appid,
            game.get('name', ''),
            game.get('release_date', ''),
            game.get('header_image', ''),
            game.get('short_description', ''),
            game.get('estimated_owners', ''),
            float(game.get('price', 0) or 0),
            int(game.get('positive', 0) or 0),
            int(game.get('negative', 0) or 0),
            int(game.get('peak_ccu', 0) or 0),
            int(game.get('metacritic_score', 0) or 0),
            1 if game.get('_p0_fetched') else 0,
            1 if game.get('_is_test_version') else 0,
            int(time.time())
        ))

        # JSON字段
        json_batch.append((
            appid,
            json.dumps(game.get('developers', []), ensure_ascii=False),
            json.dumps(game.get('publishers', []), ensure_ascii=False),
            json.dumps(game.get('genres', []), ensure_ascii=False),
            json.dumps(game.get('categories', []), ensure_ascii=False),
            json.dumps(game.get('screenshots', []), ensure_ascii=False),
            json.dumps(game.get('tags', {}), ensure_ascii=False),
            game.get('detailed_description', ''),
            game.get('about_the_game', ''),
            game.get('website', '')
        ))

        appids_in_batch.add(appid)

        # 批量插入
        if len(games_batch) >= batch_size:
            _execute_batch(conn, games_batch, json_batch)
            log(f'    处理中... {len(appids_in_batch):,} / {len(json_data):,}')
            games_batch = []
            json_batch = []
            appids_in_batch = set()

    # 处理剩余数据
    if games_batch:
        _execute_batch(conn, games_batch, json_batch)

    log(f'数据同步完成，耗时 {time.time()-t0:.1f}s')

    # 验证
    cursor.execute('SELECT COUNT(*) FROM games')
    total = cursor.fetchone()[0]
    log(f'验证: SQLite 现在包含 {total:,} 个游戏')

    cursor.execute('SELECT COUNT(*) FROM games WHERE release_date LIKE "2026%"')
    count_2026 = cursor.fetchone()[0]
    log(f'其中 2026 年游戏: {count_2026:,} 个')

    conn.close()

    return True

def _execute_batch(conn, games_batch, json_batch):
    """执行批量插入/更新"""
    cursor = conn.cursor()

    # 插入或替换主表
    cursor.executemany('''
        INSERT OR REPLACE INTO games
        (appid, name, release_date, header_image, short_description,
         estimated_owners, price, positive, negative, peak_ccu,
         metacritic_score, _p0_fetched, _is_test_version, _last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', games_batch)

    # 插入或替换 JSON 表
    cursor.executemany('''
        INSERT OR REPLACE INTO games_json
        (appid, developers, publishers, genres, categories,
         screenshots, tags, detailed_description, about_the_game, website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', json_batch)

    conn.commit()

if __name__ == '__main__':
    log('=' * 60)
    log('SQLite 数据同步工具')
    log('将 games-index.json 同步到 SQLite 数据库')
    log('=' * 60)
    log('')

    t0 = time.time()
    if sync_to_sqlite(INDEX_FILE, DB_FILE):
        log('')
        log(f'[完成] 总耗时: {time.time()-t0:.1f}s')
        log(f'数据库位置: {DB_FILE}')
    else:
        log('')
        log('[失败] 同步失败')
