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
    """更新单个游戏数据，使用 INSERT OR REPLACE 保证数据一致性"""
    cursor = conn.cursor()

    # 先检查游戏是否存在
    cursor.execute('SELECT 1 FROM games WHERE appid = ?', (appid,))
    exists = cursor.fetchone() is not None

    if exists:
        # 存在则更新
        cursor.execute('''
            UPDATE games SET
                name = ?,
                release_date = ?,
                header_image = ?,
                short_description = ?,
                estimated_owners = ?,
                price = ?,
                positive = ?,
                negative = ?,
                peak_ccu = ?,
                metacritic_score = ?,
                _p0_fetched = ?,
                _is_suspicious_delisted = ?,
                _last_updated = ?
            WHERE appid = ?
        ''', (
            data.get('name', ''),
            data.get('release_date', ''),
            data.get('header_image', ''),
            data.get('short_description', ''),
            data.get('estimated_owners', ''),
            float(data.get('price', 0) or 0),
            int(data.get('positive', 0) or 0),
            int(data.get('negative', 0) or 0),
            int(data.get('peak_ccu', 0) or 0),
            int(data.get('metacritic_score', 0) or 0),
            1 if data.get('_p0_fetched') else 0,
            1 if data.get('_is_suspicious_delisted') else 0,
            int(time.time()),
            appid
        ))
    else:
        # 不存在则插入
        cursor.execute('''
            INSERT INTO games
            (appid, name, release_date, header_image, short_description,
             estimated_owners, price, positive, negative, peak_ccu,
             metacritic_score, _p0_fetched, _is_suspicious_delisted, _last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            appid,
            data.get('name', ''),
            data.get('release_date', ''),
            data.get('header_image', ''),
            data.get('short_description', ''),
            data.get('estimated_owners', ''),
            float(data.get('price', 0) or 0),
            int(data.get('positive', 0) or 0),
            int(data.get('negative', 0) or 0),
            int(data.get('peak_ccu', 0) or 0),
            int(data.get('metacritic_score', 0) or 0),
            1 if data.get('_p0_fetched') else 0,
            1 if data.get('_is_suspicious_delisted') else 0,
            int(time.time())
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

    return True

def batch_update(conn, games_data, batch_size=500):
    """批量更新游戏数据，使用事务保证原子性"""
    cursor = conn.cursor()
    updated = 0
    errors = 0
    error_appids = []

    # 先获取所有已存在的 appid
    cursor.execute('SELECT appid FROM games')
    existing_appids = set(row[0] for row in cursor.fetchall())

    try:
        for appid, data in games_data:
            try:
                if appid in existing_appids:
                    # 存在则更新
                    cursor.execute('''
                        UPDATE games SET
                            name = ?,
                            release_date = ?,
                            header_image = ?,
                            short_description = ?,
                            estimated_owners = ?,
                            price = ?,
                            positive = ?,
                            negative = ?,
                            peak_ccu = ?,
                            metacritic_score = ?,
                            _p0_fetched = ?,
                            _is_suspicious_delisted = ?,
                            _last_updated = ?
                        WHERE appid = ?
                    ''', (
                        data.get('name', ''),
                        data.get('release_date', ''),
                        data.get('header_image', ''),
                        data.get('short_description', ''),
                        data.get('estimated_owners', ''),
                        float(data.get('price', 0) or 0),
                        int(data.get('positive', 0) or 0),
                        int(data.get('negative', 0) or 0),
                        int(data.get('peak_ccu', 0) or 0),
                        int(data.get('metacritic_score', 0) or 0),
                        1 if data.get('_p0_fetched') else 0,
                        1 if data.get('_is_suspicious_delisted') else 0,
                        int(time.time()),
                        appid
                    ))
                else:
                    # 不存在则插入
                    cursor.execute('''
                        INSERT INTO games
                        (appid, name, release_date, header_image, short_description,
                         estimated_owners, price, positive, negative, peak_ccu,
                         metacritic_score, _p0_fetched, _is_suspicious_delisted, _last_updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        appid,
                        data.get('name', ''),
                        data.get('release_date', ''),
                        data.get('header_image', ''),
                        data.get('short_description', ''),
                        data.get('estimated_owners', ''),
                        float(data.get('price', 0) or 0),
                        int(data.get('positive', 0) or 0),
                        int(data.get('negative', 0) or 0),
                        int(data.get('peak_ccu', 0) or 0),
                        int(data.get('metacritic_score', 0) or 0),
                        1 if data.get('_p0_fetched') else 0,
                        1 if data.get('_is_suspicious_delisted') else 0,
                        int(time.time())
                    ))
                    existing_appids.add(appid)

                # 更新JSON字段
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

                updated += 1

            except Exception as e:
                errors += 1
                error_appids.append(appid)
                if len(error_appids) <= 10:  # 只记录前10个错误
                    log(f'   [错误] 更新失败 appid={appid}: {e}')

        # 批量提交
        conn.commit()
    except Exception as e:
        log(f'   [严重错误] 批量更新失败，回滚事务: {e}')
        conn.rollback()
        raise e

    if errors > 0:
        log(f'   [警告] 更新完成，其中 {errors} 个游戏更新失败')

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
