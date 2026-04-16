# -*- coding: utf-8 -*-
"""
增量写入脚本 - 更新SQLite数据库中的游戏数据
"""
import sys
import time
from pathlib import Path

from config import DB_FILE
from logging_utils import log
from db_utils import (
    get_db_connection,
    get_stats,
    batch_sync_games,
)

sys.stdout.reconfigure(encoding='utf-8')


def export_to_json(conn, output_path, min_reviews=0):
    """导出为JSON格式（用于预计算）"""
    import json
    log(f'导出为 JSON (min_reviews={min_reviews})...')
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
                except Exception:
                    game[field] = []

        # 处理tags（可能是dict）
        if isinstance(game.get('tags'), str):
            try:
                game['tags'] = json.loads(game['tags'])
            except Exception:
                game['tags'] = {}

        data[appid] = game

    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

    log(f'  导出 {len(data):,} 个游戏，耗时 {time.time()-t0:.1f}s')
    log(f'  文件大小: {output_path.stat().st_size/1024/1024:.1f} MB')

    return len(data)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')

    log('=' * 60)
    log('SQLite 增量更新工具')
    log('=' * 60)
    log('')

    conn = get_db_connection(DB_FILE)

    # 显示当前统计
    stats = get_stats(conn)
    log('[统计]')
    log(f'  总游戏数: {stats["total"]:,}')
    log(f'  有评价: {stats["has_reviews"]:,}')
    log(f'  P0 已抓取: {stats["p0_done"]:,}')
    if stats.get('total_positive', 0) + stats.get('total_negative', 0) > 0:
        rate = stats['total_positive'] / (stats['total_positive'] + stats['total_negative']) * 100
        log(f'  好评率: {rate:.1f}%')
    log('')

    # 导出JSON用于预计算
    OUTPUT_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index-filtered.json')
    count = export_to_json(conn, OUTPUT_FILE, min_reviews=1)

    log('')
    log('[完成]')

    conn.close()
