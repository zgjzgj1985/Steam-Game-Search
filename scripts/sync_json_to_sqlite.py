# -*- coding: utf-8 -*-
"""
SQLite 数据同步脚本
将 games-index.json 中的所有数据同步到 SQLite 数据库
处理增量数据（新游戏插入）和现有数据更新
"""
import time

from config import INDEX_FILE, DB_FILE, BATCH_SIZE
from logging_utils import log
from data_utils import load_games_index
from db_utils import get_db_connection, create_tables, migrate_add_columns

sys.stdout.reconfigure(encoding='utf-8')


def sync_to_sqlite(index_path, db_path):
    """同步 JSON 数据到 SQLite"""
    # 加载 JSON 数据
    json_data = load_games_index(index_path)

    # 连接数据库
    conn = get_db_connection(db_path)
    create_tables(conn)
    migrate_add_columns(conn)

    # 获取现有数据
    cursor = conn.cursor()
    cursor.execute('SELECT appid FROM games')
    existing_ids = set(row[0] for row in cursor.fetchall())
    log(f'SQLite 现有 {len(existing_ids):,} 个游戏')

    # 统计
    batch_size = BATCH_SIZE
    games_batch = []
    json_batch = []

    t0 = time.time()
    json_appids = set(int(k) for k in json_data.keys())

    new_appids = json_appids - existing_ids
    existing_appids = json_appids & existing_ids

    log(f'新增: {len(new_appids):,} | 更新: {len(existing_appids):,}')

    # 处理所有游戏
    for appid_str, game in json_data.items():
        appid = int(appid_str)
        game['appid'] = appid

        # 使用公共函数准备数据
        from data_utils import prepare_game_record, prepare_json_record
        games_batch.append(prepare_game_record(game))
        json_batch.append(prepare_json_record(game))

        # 批量插入
        if len(games_batch) >= batch_size:
            _execute_batch(conn, games_batch, json_batch)
            log(f'    处理中... {len(games_batch):,} / {len(json_data):,}')
            games_batch = []
            json_batch = []

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
         metacritic_score, _p0_fetched, _is_test_version,
         _is_suspicious_delisted, _last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

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
