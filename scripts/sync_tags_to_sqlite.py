# -*- coding: utf-8 -*-
"""
将 games-index.json 中抓取的 tags 同步到 SQLite 数据库
"""
import sys
import json

from config import INDEX_FILE, DB_FILE
from logging_utils import log
from data_utils import load_games_index
from db_utils import get_db_connection

sys.stdout.reconfigure(encoding='utf-8')


def main():
    log('=== 同步 tags 到 SQLite ===')

    games = load_games_index(INDEX_FILE)

    conn = get_db_connection(DB_FILE)
    cur = conn.cursor()

    updated = 0
    for appid, game in games.items():
        tags = game.get('tags', {})
        if not tags:
            continue

        tags_json = json.dumps(tags, ensure_ascii=False)
        cur.execute(
            'UPDATE games_json SET tags = ? WHERE appid = ?',
            (tags_json, int(appid))
        )
        updated += 1

    conn.commit()
    conn.close()

    log(f'更新了 {updated} 个游戏的 tags')
    log('SQLite 数据库已更新')


if __name__ == '__main__':
    main()
