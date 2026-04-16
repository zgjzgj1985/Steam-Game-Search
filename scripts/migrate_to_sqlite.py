"""
SQLite数据库迁移脚本
将games-index.json迁移到SQLite数据库
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
    """创建数据库表"""
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
    
    # JSON字段表（存储复杂数据）
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
            website TEXT,
            FOREIGN KEY (appid) REFERENCES games(appid)
        )
    ''')
    
    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_name ON games(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_positive ON games(positive DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_release ON games(release_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_games_price ON games(price)')
    
    conn.commit()
    log('    Tables and indexes created')

def migrate_data(db_path, index_path):
    """迁移数据"""
    log(f'    Loading {index_path}...')
    t0 = time.time()
    with open(index_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
    log(f'    Loaded {len(db):,} games in {time.time()-t0:.1f}s')
    
    # 创建数据库连接
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode=WAL')  # 使用WAL模式提升性能
    conn.execute('PRAGMA synchronous=NORMAL')
    
    create_tables(conn)
    
    # 批量插入
    batch_size = 5000
    games_data = []
    json_data = []
    
    t0 = time.time()
    for appid, game in db.items():
        # 主表数据
        games_data.append((
            int(appid),
            game.get('name', ''),
            game.get('release_date', ''),
            game.get('header_image', ''),
            game.get('short_description', ''),
            game.get('estimated_owners', ''),
            game.get('price', 0) or 0,
            game.get('positive', 0) or 0,
            game.get('negative', 0) or 0,
            game.get('peak_ccu', 0) or 0,
            game.get('metacritic_score', 0) or 0,
            1 if game.get('_p0_fetched') else 0,
            1 if game.get('_is_test_version') else 0,
            int(time.time())
        ))
        
        # JSON字段
        json_data.append((
            int(appid),
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
        
        # 批量插入
        if len(games_data) >= batch_size:
            conn.executemany('''
                INSERT OR REPLACE INTO games 
                (appid, name, release_date, header_image, short_description,
                 estimated_owners, price, positive, negative, peak_ccu,
                 metacritic_score, _p0_fetched, _is_test_version, _last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', games_data)
            
            conn.executemany('''
                INSERT OR REPLACE INTO games_json
                (appid, developers, publishers, genres, categories,
                 screenshots, tags, detailed_description, about_the_game, website)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', json_data)
            
            conn.commit()
            log(f'    Inserted {len(games_data):,} games...')
            games_data = []
            json_data = []
    
    # 插入剩余数据
    if games_data:
        conn.executemany('''
            INSERT OR REPLACE INTO games 
            (appid, name, release_date, header_image, short_description,
             estimated_owners, price, positive, negative, peak_ccu,
             metacritic_score, _p0_fetched, _is_test_version, _last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', games_data)
        
        conn.executemany('''
            INSERT OR REPLACE INTO games_json
            (appid, developers, publishers, genres, categories,
             screenshots, tags, detailed_description, about_the_game, website)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', json_data)
        
        conn.commit()
    
    log(f'    Migrated {len(db):,} games in {time.time()-t0:.1f}s')
    
    # 验证
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM games')
    count = cursor.fetchone()[0]
    log(f'    Verified: {count:,} games in database')
    
    cursor.execute('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()')
    size = cursor.fetchone()[0]
    log(f'    Database size: {size/1024/1024:.1f} MB')
    
    conn.close()
    
    # 对比JSON文件大小
    json_size = index_path.stat().st_size
    log(f'    Original JSON size: {json_size/1024/1024:.1f} MB')
    log(f'    Space saved: {(json_size-size)/1024/1024:.1f} MB ({(1-size/json_size)*100:.1f}%)')
    
    return True

if __name__ == '__main__':
    log('=' * 60)
    log('SQLite Migration Tool')
    log('=' * 60)
    log('')
    log('[1] Creating SQLite database...')
    
    t0 = time.time()
    if migrate_data(DB_FILE, INDEX_FILE):
        log('')
        log(f'[DONE] Total time: {time.time()-t0:.1f}s')
        log(f'    Database location: {DB_FILE}')
    else:
        log('')
        log('[FAILED] Migration failed')
