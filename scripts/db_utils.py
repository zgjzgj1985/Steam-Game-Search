# -*- coding: utf-8 -*-
"""
数据库工具 - SQLite 数据库操作
"""
import json
import sqlite3
from pathlib import Path
from typing import Optional, List, Tuple

from config import DB_FILE
from logging_utils import log


def get_db_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """
    获取 SQLite 数据库连接

    Args:
        db_path: 数据库文件路径，默认使用 DB_FILE

    Returns:
        sqlite3.Connection: 数据库连接
    """
    path = db_path or DB_FILE
    conn = sqlite3.connect(path)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn


def create_tables(conn: sqlite3.Connection) -> None:
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
            _is_suspicious_delisted INTEGER DEFAULT 0,
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


def migrate_add_columns(conn: sqlite3.Connection) -> None:
    """为已存在的数据库添加新列"""
    cursor = conn.cursor()

    # 检查 games 表是否有 _is_suspicious_delisted 列
    cursor.execute("PRAGMA table_info(games)")
    columns = [col[1] for col in cursor.fetchall()]

    if '_is_suspicious_delisted' not in columns:
        log('   迁移: 添加 _is_suspicious_delisted 列...')
        cursor.execute('ALTER TABLE games ADD COLUMN _is_suspicious_delisted INTEGER DEFAULT 0')
        conn.commit()
        log('   迁移完成')

    conn.commit()


def get_stats(conn: sqlite3.Connection) -> dict:
    """获取数据库统计信息"""
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) FROM games')
    total = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM games WHERE positive + negative > 0')
    has_reviews = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM games WHERE _p0_fetched = 1')
    p0_done = cursor.fetchone()[0]

    cursor.execute('SELECT SUM(positive) FROM games')
    total_pos = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM games WHERE release_date >= '2026-01-01'")
    recent_2026 = cursor.fetchone()[0]

    return {
        'total': total,
        'has_reviews': has_reviews,
        'p0_done': p0_done,
        'total_positive': total_pos,
        'recent_2026': recent_2026
    }


def get_existing_appids(conn: sqlite3.Connection) -> set:
    """获取数据库中所有已存在的 appid"""
    cursor = conn.cursor()
    cursor.execute('SELECT appid FROM games')
    return set(row[0] for row in cursor.fetchall())


def batch_sync_games(
    conn: sqlite3.Connection,
    games_data: dict,
    batch_size: int = 500
) -> Tuple[int, int]:
    """
    批量同步游戏数据到 SQLite

    Args:
        conn: 数据库连接
        games_data: 游戏数据字典
        batch_size: 批量大小

    Returns:
        Tuple[int, int]: (updated_count, error_count)
    """
    from data_utils import prepare_game_record, prepare_json_record

    cursor = conn.cursor()
    updated = 0
    errors = 0

    # 获取已存在的 appid
    existing_appids = get_existing_appids(conn)

    try:
        for appid_str, data in games_data.items():
            appid = int(appid_str)
            data['appid'] = appid  # 确保有 appid 字段

            try:
                if appid in existing_appids:
                    # 存在则更新
                    record = prepare_game_record(data)
                    cursor.execute('''
                        UPDATE games SET
                            name = ?, release_date = ?, header_image = ?,
                            short_description = ?, estimated_owners = ?, price = ?,
                            positive = ?, negative = ?, peak_ccu = ?,
                            metacritic_score = ?, _p0_fetched = ?,
                            _is_suspicious_delisted = ?, _last_updated = ?
                        WHERE appid = ?
                    ''', (*record[1:-1], appid))  # 去掉 appid 和 _last_updated
                else:
                    # 不存在则插入
                    record = prepare_game_record(data)
                    cursor.execute('''
                        INSERT INTO games
                        (appid, name, release_date, header_image, short_description,
                         estimated_owners, price, positive, negative, peak_ccu,
                         metacritic_score, _p0_fetched, _is_suspicious_delisted, _last_updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', record)
                    existing_appids.add(appid)

                # 更新 JSON 字段
                json_record = prepare_json_record(data)
                cursor.execute('''
                    INSERT OR REPLACE INTO games_json
                    (appid, developers, publishers, genres, categories, screenshots, tags,
                     detailed_description, about_the_game, website)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', json_record)

                updated += 1

                # 批量提交
                if updated % batch_size == 0:
                    conn.commit()
                    log(f'    处理中... {updated:,} / {len(games_data):,}')
                    # 重新获取已存在的 appid（减少内存占用）
                    if updated % (batch_size * 10) == 0:
                        existing_appids = get_existing_appids(conn)

            except Exception as e:
                errors += 1
                if errors <= 5:
                    log(f'   [错误] 同步失败 appid={appid}: {e}')

        conn.commit()

    except Exception as e:
        log(f'   [严重错误] 批量同步失败，回滚事务: {e}')
        conn.rollback()
        raise e

    return updated, errors


def update_game(conn: sqlite3.Connection, appid: int, data: dict) -> bool:
    """
    更新单个游戏数据

    Args:
        conn: 数据库连接
        appid: 游戏 appid
        data: 游戏数据

    Returns:
        bool: 是否成功
    """
    from data_utils import prepare_game_record, prepare_json_record

    cursor = conn.cursor()
    data['appid'] = appid

    # 检查是否存在
    cursor.execute('SELECT 1 FROM games WHERE appid = ?', (appid,))
    exists = cursor.fetchone() is not None

    if exists:
        record = prepare_game_record(data)
        cursor.execute('''
            UPDATE games SET
                name = ?, release_date = ?, header_image = ?,
                short_description = ?, estimated_owners = ?, price = ?,
                positive = ?, negative = ?, peak_ccu = ?,
                metacritic_score = ?, _p0_fetched = ?,
                _is_suspicious_delisted = ?, _last_updated = ?
            WHERE appid = ?
        ''', (*record[1:-1], appid))
    else:
        record = prepare_game_record(data)
        cursor.execute('''
            INSERT INTO games
            (appid, name, release_date, header_image, short_description,
             estimated_owners, price, positive, negative, peak_ccu,
             metacritic_score, _p0_fetched, _is_suspicious_delisted, _last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', record)

    # 更新 JSON 字段
    json_record = prepare_json_record(data)
    cursor.execute('''
        INSERT OR REPLACE INTO games_json
        (appid, developers, publishers, genres, categories, screenshots, tags,
         detailed_description, about_the_game, website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', json_record)

    return True


def export_to_json(conn: sqlite3.Connection, output_path: Path) -> bool:
    """
    从 SQLite 导出游戏数据到 JSON 文件

    Args:
        conn: 数据库连接
        output_path: 输出文件路径

    Returns:
        bool: 是否成功
    """
    cursor = conn.cursor()

    cursor.execute('''
        SELECT g.appid, g.name, g.release_date, g.header_image, g.short_description,
               g.estimated_owners, g.price, g.positive, g.negative, g.peak_ccu,
               g.metacritic_score, g._p0_fetched, g._is_test_version, g._is_suspicious_delisted,
               j.developers, j.publishers, j.genres, j.categories, j.screenshots, j.tags,
               j.detailed_description, j.about_the_game, j.website
        FROM games g
        LEFT JOIN games_json j ON g.appid = j.appid
    ''')

    games = {}
    for row in cursor.fetchall():
        appid = str(row[0])
        games[appid] = {
            'name': row[1],
            'release_date': row[2],
            'header_image': row[3],
            'short_description': row[4],
            'estimated_owners': row[5],
            'price': row[6],
            'positive': row[7],
            'negative': row[8],
            'peak_ccu': row[9],
            'metacritic_score': row[10],
            '_p0_fetched': row[11] == 1,
            '_is_test_version': row[12] == 1,
            '_is_suspicious_delisted': row[13] == 1,
            'developers': json.loads(row[14]) if row[14] else [],
            'publishers': json.loads(row[15]) if row[15] else [],
            'genres': json.loads(row[16]) if row[16] else [],
            'categories': json.loads(row[17]) if row[17] else [],
            'screenshots': json.loads(row[18]) if row[18] else [],
            'tags': json.loads(row[19]) if row[19] else {},
            'detailed_description': row[20] or '',
            'about_the_game': row[21] or '',
            'website': row[22] or ''
        }

    import shutil
    temp_path = output_path.with_suffix('.temp')
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(games, f, ensure_ascii=False, indent=2)

    if output_path.exists():
        output_path.unlink()
    temp_path.rename(output_path)

    return True
