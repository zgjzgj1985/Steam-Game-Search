"""
增量写入脚本 - 更新SQLite数据库中的游戏数据
"""
import json
import sqlite3
import time
from pathlib import Path

DB_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games.db')

def log(msg):
    print(msg, flush=True)

def get_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_FILE)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn

def update_game(conn, appid, data):
    """更新单个游戏数据"""
    cursor = conn.cursor()
    
    # 更新主表
    cursor.execute('''
        UPDATE games SET
            name = COALESCE(?, name),
            release_date = COALESCE(?, release_date),
            header_image = COALESCE(?, header_image),
            short_description = COALESCE(?, short_description),
            estimated_owners = COALESCE(?, estimated_owners),
            price = COALESCE(?, price),
            positive = COALESCE(?, positive),
            negative = COALESCE(?, negative),
            peak_ccu = COALESCE(?, peak_ccu),
            metacritic_score = COALESCE(?, metacritic_score),
            _p0_fetched = COALESCE(?, _p0_fetched),
            _last_updated = ?
        WHERE appid = ?
    ''', (
        data.get('name'),
        data.get('release_date'),
        data.get('header_image'),
        data.get('short_description'),
        data.get('estimated_owners'),
        data.get('price'),
        data.get('positive'),
        data.get('negative'),
        data.get('peak_ccu'),
        data.get('metacritic_score'),
        1 if data.get('_p0_fetched') else 0,
        int(time.time()),
        appid
    ))
    
    # 更新JSON字段表
    cursor.execute('''
        INSERT OR REPLACE INTO games_json
        (appid, developers, publishers, genres, categories, screenshots, tags,
         detailed_description, about_the_game, website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        appid,
        json.dumps(data.get('developers', []), ensure_ascii=False),
        json.dumps(data.get('publishers', []), ensure_ascii=False),
        json.dumps(data.get('genres', []), ensure_ascii=False),
        json.dumps(data.get('categories', []), ensure_ascii=False),
        json.dumps(data.get('screenshots', []), ensure_ascii=False),
        json.dumps(data.get('tags', {}), ensure_ascii=False),
        data.get('detailed_description', ''),
        data.get('about_the_game', ''),
        data.get('website', '')
    ))
    
    return cursor.rowcount > 0

def batch_update(conn, games_data, batch_size=500):
    """批量更新游戏数据"""
    cursor = conn.cursor()
    updated = 0
    errors = 0
    
    games_batch = []
    json_batch = []
    
    for appid, data in games_data:
        # 主表数据
        games_batch.append((
            data.get('name'),
            data.get('release_date'),
            data.get('header_image'),
            data.get('short_description'),
            data.get('estimated_owners'),
            data.get('price'),
            data.get('positive'),
            data.get('negative'),
            data.get('peak_ccu'),
            data.get('metacritic_score'),
            1 if data.get('_p0_fetched') else 0,
            int(time.time()),
            appid
        ))
        
        # JSON字段
        json_batch.append((
            appid,
            json.dumps(data.get('developers', []), ensure_ascii=False),
            json.dumps(data.get('publishers', []), ensure_ascii=False),
            json.dumps(data.get('genres', []), ensure_ascii=False),
            json.dumps(data.get('categories', []), ensure_ascii=False),
            json.dumps(data.get('screenshots', []), ensure_ascii=False),
            json.dumps(data.get('tags', {}), ensure_ascii=False),
            data.get('detailed_description', ''),
            data.get('about_the_game', ''),
            data.get('website', '')
        ))
        
        # 批量执行
        if len(games_batch) >= batch_size:
            try:
                cursor.executemany('''
                    UPDATE games SET
                        name = COALESCE(?, name),
                        release_date = COALESCE(?, release_date),
                        header_image = COALESCE(?, header_image),
                        short_description = COALESCE(?, short_description),
                        estimated_owners = COALESCE(?, estimated_owners),
                        price = COALESCE(?, price),
                        positive = COALESCE(?, positive),
                        negative = COALESCE(?, negative),
                        peak_ccu = COALESCE(?, peak_ccu),
                        metacritic_score = COALESCE(?, metacritic_score),
                        _p0_fetched = COALESCE(?, _p0_fetched),
                        _last_updated = ?
                    WHERE appid = ?
                ''', games_batch)
                
                cursor.executemany('''
                    INSERT OR REPLACE INTO games_json
                    (appid, developers, publishers, genres, categories, screenshots, tags,
                     detailed_description, about_the_game, website)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', json_batch)
                
                updated += len(games_batch)
                games_batch = []
                json_batch = []
            except Exception as e:
                errors += len(games_batch)
                games_batch = []
                json_batch = []
    
    # 处理剩余数据
    if games_batch:
        try:
            cursor.executemany('''
                UPDATE games SET
                    name = COALESCE(?, name),
                    release_date = COALESCE(?, release_date),
                    header_image = COALESCE(?, header_image),
                    short_description = COALESCE(?, short_description),
                    estimated_owners = COALESCE(?, estimated_owners),
                    price = COALESCE(?, price),
                    positive = COALESCE(?, positive),
                    negative = COALESCE(?, negative),
                    peak_ccu = COALESCE(?, peak_ccu),
                    metacritic_score = COALESCE(?, metacritic_score),
                    _p0_fetched = COALESCE(?, _p0_fetched),
                    _last_updated = ?
                WHERE appid = ?
            ''', games_batch)
            
            cursor.executemany('''
                INSERT OR REPLACE INTO games_json
                (appid, developers, publishers, genres, categories, screenshots, tags,
                 detailed_description, about_the_game, website)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', json_batch)
            
            updated += len(games_batch)
        except Exception as e:
            errors += len(games_batch)
    
    conn.commit()
    return updated, errors

def get_stats(conn):
    """获取数据库统计"""
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) FROM games')
    total = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM games WHERE positive + negative > 0')
    has_reviews = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM games WHERE _p0_fetched = 1')
    p0_done = cursor.fetchone()[0]
    
    cursor.execute('SELECT SUM(positive) FROM games')
    total_pos = cursor.fetchone()[0] or 0
    
    cursor.execute('SELECT SUM(negative) FROM games')
    total_neg = cursor.fetchone()[0] or 0
    
    return {
        'total': total,
        'has_reviews': has_reviews,
        'p0_done': p0_done,
        'total_positive': total_pos,
        'total_negative': total_neg
    }

def export_to_json(conn, output_path, min_reviews=0):
    """导出为JSON格式（用于预计算）"""
    log(f'Exporting to JSON (min_reviews={min_reviews})...')
    t0 = time.time()
    
    cursor = conn.execute('''
        SELECT g.*, j.developers, j.publishers, j.genres, j.categories, 
               j.screenshots, j.tags, j.detailed_description
        FROM games g
        LEFT JOIN games_json j ON g.appid = j.appid
        WHERE g.positive + g.negative >= ?
    ''', (min_reviews,))
    
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    
    data = {}
    for row in rows:
        game = dict(zip(columns, row))
        appid = game.pop('appid')
        
        # 转换JSON字符串
        for field in ['developers', 'publishers', 'genres', 'categories', 'screenshots', 'tags']:
            if game.get(field):
                try:
                    game[field] = json.loads(game[field])
                except:
                    game[field] = []
        
        # 处理tags（可能是dict）
        if isinstance(game.get('tags'), str):
            try:
                game['tags'] = json.loads(game['tags'])
            except:
                game['tags'] = {}
        
        data[appid] = game
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    
    log(f'  Exported {len(data):,} games in {time.time()-t0:.1f}s')
    log(f'  File size: {output_path.stat().st_size/1024/1024:.1f} MB')
    
    return len(data)

if __name__ == '__main__':
    log('=' * 60)
    log('Incremental Update Tool for SQLite')
    log('=' * 60)
    log('')
    
    conn = get_connection()
    
    # 显示当前统计
    stats = get_stats(conn)
    log('[Stats]')
    log(f'  Total games: {stats["total"]:,}')
    log(f'  With reviews: {stats["has_reviews"]:,}')
    log(f'  P0 fetched: {stats["p0_done"]:,}')
    if stats['total_positive'] + stats['total_negative'] > 0:
        rate = stats['total_positive'] / (stats['total_positive'] + stats['total_negative']) * 100
        log(f'  Positive rate: {rate:.1f}%')
    log('')
    
    # 导出JSON用于预计算
    OUTPUT_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index-filtered.json')
    count = export_to_json(conn, OUTPUT_FILE, min_reviews=1)
    
    log('')
    log('[DONE]')
    
    conn.close()
