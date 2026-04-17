# -*- coding: utf-8 -*-
"""
构建预计算缓存 SQLite 数据库
将 games-cache.json 转换为 games-cache.db，供 API 直接查询

使用 ijson 流式解析，避免全量 JSON 加载到内存

输出: public/data/games-cache.db
"""
import sys
import json
import time
import sqlite3
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

try:
    import ijson
except ImportError:
    print("需要安装 ijson: pip install ijson")
    sys.exit(1)

PROJECT_ROOT = Path(r'D:\Steam全域游戏搜索')
DATA_DIR = PROJECT_ROOT / 'public' / 'data'
CACHE_JSON = DATA_DIR / 'games-cache.json'
CACHE_DB = DATA_DIR / 'games-cache.db'
REGIONAL_REVIEWS = DATA_DIR / 'regional-reviews-checkpoint.json'

INSERT_PLACEHOLDERS = ', '.join(['?'] * 38)

# ============ 池子计算逻辑（与 precompute.ts 保持一致）============

POKEMON_LIKE_TAGS = {"Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection"}
BLACKLIST_TAGS = {"Board Game", "Grand Strategy", "4X Strategy", "NSFW", "Hentai", "Text-Based", "Sexual Content"}

def is_pokemon_like(tags_list: list) -> bool:
    return any(tag in POKEMON_LIKE_TAGS for tag in tags_list)

def is_blacklisted(tags_list: list) -> bool:
    return any(tag in BLACKLIST_TAGS for tag in tags_list)

def calculate_pool(is_pl: bool, review_score: int, total_reviews: int, tags_list: list) -> str:
    """计算游戏池子归属"""
    if total_reviews == 0 or is_blacklisted(tags_list):
        return ''
    if not is_pl and review_score >= 75 and total_reviews >= 50:
        return 'A'
    if is_pl and review_score >= 75 and total_reviews >= 50:
        return 'B'
    if is_pl and 40 <= review_score <= 74 and total_reviews >= 50:
        return 'C'
    return ''


def create_schema(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS games_cache (
            appid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            short_description TEXT,
            header_image TEXT,
            developers TEXT,
            publishers TEXT,
            genres TEXT,
            categories TEXT,
            screenshots TEXT,
            tags TEXT,
            release_date TEXT,
            price REAL DEFAULT 0,
            estimated_owners TEXT,
            estimated_owners_num INTEGER DEFAULT 0,
            peak_ccu INTEGER DEFAULT 0,
            metacritic_score INTEGER DEFAULT 0,
            positive INTEGER DEFAULT 0,
            negative INTEGER DEFAULT 0,
            total_reviews INTEGER DEFAULT 0,
            review_score INTEGER DEFAULT 0,
            cn_positive INTEGER DEFAULT 0,
            cn_negative INTEGER DEFAULT 0,
            cn_total INTEGER DEFAULT 0,
            overseas_positive INTEGER DEFAULT 0,
            overseas_negative INTEGER DEFAULT 0,
            overseas_total INTEGER DEFAULT 0,
            is_turn_based INTEGER DEFAULT 0,
            pool TEXT,
            wilson_score REAL DEFAULT 0,
            cn_wilson_score REAL DEFAULT 0,
            overseas_wilson_score REAL DEFAULT 0,
            is_pokemon_like INTEGER DEFAULT 0,
            pokemon_like_tags TEXT DEFAULT '[]',
            tag_weight REAL DEFAULT 0,
            unique_feature_tags TEXT DEFAULT '[]',
            differentiation_labels TEXT DEFAULT '[]',
            is_free INTEGER DEFAULT 0,
            search_vector TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_name ON games_cache(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_pool ON games_cache(pool)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_wilson ON games_cache(wilson_score DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_turn_based ON games_cache(is_turn_based)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_price ON games_cache(price)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_release ON games_cache(release_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_score ON games_cache(review_score DESC)')
    cursor.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
            appid, name, short_description, developers, publishers, genres, tags,
            content='games_cache', content_rowid='rowid'
        )
    ''')
    conn.commit()


def parse_owners(raw: str) -> int:
    cleaned = raw.replace(',', '').strip()
    parts = cleaned.split('-')
    if len(parts) == 2:
        try:
            return (int(parts[0].strip()) + int(parts[1].strip())) // 2
        except ValueError:
            pass
    try:
        return int(cleaned)
    except ValueError:
        return 0


def safe_json(obj) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except (TypeError, ValueError):
        return '[]'


def load_regional_reviews() -> dict:
    reviews = {}
    if not REGIONAL_REVIEWS.exists():
        print(f"   区域评价文件不存在，跳过")
        return reviews
    print(f"   加载区域评价: {REGIONAL_REVIEWS}")
    t0 = time.time()
    try:
        with open(REGIONAL_REVIEWS, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict):
            for appid_str, rd in data.items():
                try:
                    cn = rd.get('cn', {})
                    ov = rd.get('overseas', {})
                    reviews[str(appid_str)] = {
                        'cn_pos': cn.get('positive', 0),
                        'cn_neg': cn.get('negative', 0),
                        'cn_tot': cn.get('total', 0),
                        'ov_pos': ov.get('positive', 0),
                        'ov_neg': ov.get('negative', 0),
                        'ov_tot': ov.get('total', 0),
                    }
                except (AttributeError, TypeError):
                    continue
    except Exception as e:
        print(f"   加载区域评价失败: {e}")
    print(f"   加载 {len(reviews):,} 条区域评价，耗时 {time.time()-t0:.1f}s")
    return reviews


def stream_games(json_path: Path, regional: dict):
    print(f"   流式解析 {json_path}...")
    file_mb = json_path.stat().st_size / 1024 / 1024
    print(f"   文件大小: {file_mb:.1f} MB")
    t0 = time.time()
    count = 0
    with open(json_path, 'rb') as f:
        for game in ijson.items(f, 'games.item'):
            count += 1
            appid = str(game.get('steamAppId', ''))
            r = regional.get(appid, {})
            cn_reviews = game.get('cnReviews', {}) or {}
            overseas_reviews = game.get('overseasReviews', {}) or {}

            # 评价计算
            positive = int((game.get('steamReviews', {}) or {}).get('totalPositive', 0) or 0)
            negative = int((game.get('steamReviews', {}) or {}).get('totalNegative', 0) or 0)
            total_reviews = positive + negative
            review_score = total_reviews > 0 and (positive * 100 // total_reviews) or 0

            # 标签列表（用于池子计算）
            raw_tags = game.get('tags', [])
            if isinstance(raw_tags, list):
                tags_list = raw_tags
            elif isinstance(raw_tags, dict):
                tags_list = list(raw_tags.keys())
            else:
                tags_list = []

            # 宝可梦Like检测
            is_pl = 1 if is_pokemon_like(tags_list) else 0

            # 池子计算
            pool = calculate_pool(bool(is_pl), review_score, total_reviews, tags_list)

            yield (
                appid,
                game.get('name', ''),
                game.get('shortDescription', ''),
                game.get('headerImage', '') or '',
                safe_json(game.get('developers', [])),
                safe_json(game.get('publishers', [])),
                safe_json(game.get('genres', [])),
                safe_json(game.get('categories', [])),
                safe_json(game.get('screenshots', [])),
                safe_json(tags_list),
                game.get('releaseDate', '') or '',
                float(game.get('price', 0) or 0),
                str(game.get('estimatedOwners', '0 - 0') or '0 - 0'),
                parse_owners(str(game.get('estimatedOwners', '0 - 0') or '0 - 0')),
                int(game.get('peakCCU', 0) or 0),
                int(game.get('metacriticScore', 0) or 0),
                positive,
                negative,
                total_reviews,
                review_score,
                r.get('cn_pos', int(cn_reviews.get('totalPositive', 0) or 0)),
                r.get('cn_neg', int(cn_reviews.get('totalNegative', 0) or 0)),
                r.get('cn_tot', int(cn_reviews.get('totalReviews', 0) or r.get('cn_pos', 0) + r.get('cn_neg', 0))),
                r.get('ov_pos', int(overseas_reviews.get('totalPositive', 0) or 0)),
                r.get('ov_neg', int(overseas_reviews.get('totalNegative', 0) or 0)),
                r.get('ov_tot', int(overseas_reviews.get('totalReviews', 0) or r.get('ov_pos', 0) + r.get('ov_neg', 0))),
                1 if game.get('isTurnBased', False) else 0,
                pool,
                float(game.get('wilsonScore', 0) or 0),
                float(game.get('cnWilsonScore', 0) or 0),
                float(game.get('overseasWilsonScore', 0) or 0),
                is_pl,
                safe_json(game.get('pokemonLikeTags', [])),
                float(game.get('tagWeight', 0) or 0),
                safe_json(game.get('uniqueFeatureTags', [])),
                safe_json(game.get('differentiationLabels', [])),
                1 if game.get('isFree', False) else 0,
                f"{game.get('name', '')} {game.get('shortDescription', '')}",
            )
            if count % 10000 == 0:
                print(f"   已解析 {count:,} 个...")
    print(f"   解析完成: {count:,} 个，耗时 {time.time()-t0:.1f}s")


def main():
    print("=" * 60)
    print("构建预计算缓存数据库")
    print("=" * 60)
    print()
    if not CACHE_JSON.exists():
        print(f"错误: {CACHE_JSON} 不存在，请先运行 npm run precompute")
        sys.exit(1)

    regional = load_regional_reviews()

    print(f"\n创建数据库: {CACHE_DB}")
    t0 = time.time()
    if CACHE_DB.exists():
        CACHE_DB.unlink()

    conn = sqlite3.connect(str(CACHE_DB))
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA synchronous = NORMAL')
    conn.execute('PRAGMA cache_size = -200000')
    conn.execute('PRAGMA temp_store = MEMORY')
    create_schema(conn)

    BATCH_SIZE = 1000
    batch = []
    inserted = 0
    t1 = time.time()
    insert_sql = f'INSERT OR REPLACE INTO games_cache VALUES ({INSERT_PLACEHOLDERS})'

    for row in stream_games(CACHE_JSON, regional):
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            conn.cursor().executemany(insert_sql, batch)
            conn.commit()
            inserted += len(batch)
            print(f"   已写入 {inserted:,} 个...")
            batch = []

    if batch:
        conn.cursor().executemany(insert_sql, batch)
        conn.commit()
        inserted += len(batch)

    print(f"   写入完成: {inserted:,} 个，耗时 {time.time()-t1:.1f}s")

    print("   重建 FTS 索引...")
    conn.execute("INSERT INTO games_fts(games_fts) VALUES('rebuild')")
    conn.commit()

    c = conn.cursor()
    total = c.execute('SELECT COUNT(*) FROM games_cache').fetchone()[0]
    turn_based = c.execute('SELECT COUNT(*) FROM games_cache WHERE is_turn_based = 1').fetchone()[0]
    pool_a = c.execute('SELECT COUNT(*) FROM games_cache WHERE pool = "A"').fetchone()[0]
    pool_b = c.execute('SELECT COUNT(*) FROM games_cache WHERE pool = "B"').fetchone()[0]
    pool_c = c.execute('SELECT COUNT(*) FROM games_cache WHERE pool = "C"').fetchone()[0]
    fts_count = c.execute('SELECT COUNT(*) FROM games_fts').fetchone()[0]

    c.execute("INSERT OR REPLACE INTO meta VALUES ('created_at', ?)", (time.strftime('%Y-%m-%d %H:%M:%S'),))
    c.execute("INSERT OR REPLACE INTO meta VALUES ('total', ?)", (str(total),))
    conn.commit()

    db_mb = CACHE_DB.stat().st_size / 1024 / 1024
    print(f"   数据库大小: {db_mb:.1f} MB")
    print(f"   FTS 记录: {fts_count:,}")

    conn.close()

    print(f"\n✅ 完成！总耗时 {time.time()-t0:.1f}s")
    print(f"   总游戏: {total:,} | 回合制: {turn_based:,}")
    print(f"   A池: {pool_a:,} | B池: {pool_b:,} | C池: {pool_c:,}")
    print(f"   数据库: {CACHE_DB}")


if __name__ == '__main__':
    main()
