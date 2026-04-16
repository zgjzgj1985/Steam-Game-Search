import sqlite3
from pathlib import Path

DB_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games.db')
conn = sqlite3.connect(str(DB_FILE))
conn.row_factory = sqlite3.Row

# Check if tags exist in games table
cursor = conn.execute('SELECT appid, name, genres, tags FROM games LIMIT 5')
print('games table columns with genres/tags:')
for row in cursor:
    print('  appid:', row[0], 'name:', str(row[1])[:30] if row[1] else 'None')

# Check what columns exist in games table
cursor = conn.execute("PRAGMA table_info(games)")
print('\ngames table schema:')
for row in cursor:
    print(' ', row[1], row[2])

conn.close()
