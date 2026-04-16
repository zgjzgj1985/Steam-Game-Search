"""
将 games-index.json 中抓取的 tags 同步到 SQLite 数据库
"""
import json
import sqlite3
from pathlib import Path

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
DB_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games.db')

def log(msg):
    print(msg, flush=True)

def main():
    log('=== 同步 tags 到 SQLite ===')

    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        games = json.load(f)

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    updated = 0
    for appid, game in games.items():
        tags = game.get('tags', {})
        if not tags or len(tags) == 0:
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
