"""
Steam游戏数据统一工作流 - 一键完成全量更新

合并以下脚本逻辑为一体:
  1. incremental_fetch.py  - 发现+采集新游戏 + 评价更新
  2. fetch_extended.py    - 标签补全
  3. sync_json_to_sqlite.py - 增量同步到SQLite
  4. precompute.ts        - 预计算缓存生成

工作流程:
  [Step 1] 从Steam发现新游戏
  [Step 2] 多线程采集新游戏详情(含评价+标签) - 8并发
  [Step 3] 多线程补全零评价/缺失标签的已有游戏 - 8并发
  [Step 4] 增量同步到SQLite
  [Step 5] 生成预计算缓存(games-cache.json)
  [Step 6] 备份数据

用途: 定时任务执行，一条命令完成全部更新
"""
import json
import time
import requests
import sys
import shutil
import re
import sqlite3
import subprocess
import os
from pathlib import Path
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Semaphore
from queue import Queue

sys.stdout.reconfigure(encoding='utf-8')

# ==================== 路径配置 ====================
DATA_DIR = Path(r'D:\Steam全域游戏搜索\public\data')
INDEX_FILE = DATA_DIR / 'games-index.json'
BACKUP_FILE = DATA_DIR / 'games-index.json.unified_backup'
TEMP_FILE = DATA_DIR / 'games-index.json.unified_temp'
STATE_FILE = DATA_DIR / 'games-index.json.unified_state'
SCRATCH_FILE = DATA_DIR / 'games-index.json.scratch'  # 采集中间结果

STEAM_API = 'https://store.steampowered.com/api/appdetails?appids={appid}&cc=cn&l=schinese'
REVIEWS_API = 'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'
TAG_API = 'https://steamcommunity.com/app/{appid}/tagging/?term=&offset=0&count=20&explore=0&force=1'

# Steam 标签抓取API (从HTML解析)
TAG_PAGE_API = 'https://store.steampowered.com/app/{appid}'

# ==================== 并发配置 ====================
FETCH_THREADS = 8       # 详情+评价并发数
TAG_THREADS = 4         # 标签抓取并发数
REQUEST_DELAY = 0.3     # 线程内请求间隔(秒)
REQUEST_DELAY_TAG = 0.5 # 标签请求间隔(秒)

# ==================== 数量限制 ====================
MAX_NEW_GAMES = 3000    # 每次最多采集新游戏数量
MAX_UPDATE_REVIEWS = 500   # 每次最多更新评价的游戏数量
MAX_UPDATE_TAGS = 1000     # 每次最多补全标签的游戏数量
MAX_TAG_PAGES = 100    # 标签页最大页数

# Steam 搜索页面最大页数(每页25个，约覆盖43天)
MAX_SEARCH_PAGES = 100

# ==================== 检查点配置 ====================
SAVE_EVERY = 100  # 每处理N个游戏保存一次
SQLITE_BATCH = 1000  # SQLite批量提交大小

# ==================== 日志 ====================
def log(msg, level='INFO'):
    ts = datetime.now().strftime('%H:%M:%S')
    prefix = {
        'INFO': '  ',
        'STEP': '[=]',
        'OK': '[OK]',
        'SKIP': '[-]',
        'WARN': '[!]',
        'FAIL': '[X]',
        'PROG': '[>]',
    }.get(level, '  ')
    print(f'[{ts}] {prefix} {msg}', flush=True)

def log_step(msg):
    log(msg, 'STEP')

def log_ok(msg):
    log(msg, 'OK')

def log_skip(msg):
    log(msg, 'SKIP')

def log_warn(msg):
    log(msg, 'WARN')

def log_fail(msg):
    log(msg, 'FAIL')

def log_prog(msg):
    log(msg, 'PROG')

# ==================== Steam API ID 映射表 ====================
GENRE_ID_MAP = {
    "1": "Action", "2": "Strategy", "3": "RPG", "4": "Casual",
    "7": "Education", "8": "Utilities", "9": "Racing", "10": "Photo Editing",
    "13": "Sports", "17": "Documentary", "18": "Sports", "20": "Software Training",
    "23": "Indie", "24": "Video Production", "25": "Adventure", "26": "Violent",
    "27": "Nudity", "28": "Simulation", "29": "Massively Multiplayer",
    "30": "Farming Sim", "35": "Free To Play", "37": "Free To Play",
    "51": "Animation & Modeling", "52": "Audio Production",
    "53": "Design & Illustration", "54": "Education", "55": "Photo Editing",
    "56": "Software Training", "57": "Utilities", "58": "Video Production",
    "59": "Web Publishing", "60": "Game Development", "70": "Early Access",
}

CATEGORY_ID_MAP = {
    1: "Multi-player", 2: "PvP", 8: "Anti-Cheat", 9: "Steam Cloud",
    10: "Steam Leaderboards", 13: "Single-player", 14: "Full controller support",
    15: "Steam Trading Cards", 17: "Steam Workshop", 18: "In-App Product",
    20: "Valve Anti-Cheat", 21: "Captions available", 22: "Includes Source SDK",
    23: "Includes Source Filmmaker", 24: "Commentary available",
    25: "Dynamic Renaming", 27: "Clan Chat", 28: "Chat", 29: "Voice Chat",
    30: "Broadcast", 32: "User Generated Content", 35: "Mods",
    36: "Online PvP", 37: "Shared/Split Screen PvP",
    38: "Cross-Platform Multiplayer", 39: "Online Co-op", 41: "Co-op",
    42: "Local Co-op", 43: "Shared/Split Screen Co-op",
    44: "Shared/Split Screen", 47: "MMO", 48: "Open World", 49: "PvE",
    50: "Partial Controller Support", 52: "Local Multi-player",
    53: "Asynchronous Multiplayer", 54: "Turn-based", 61: "Online Game",
    62: "Virtual Reality", 63: "SteamVR Teleportation", 64: "3D Vision",
    65: "Tracked Motion Controllers", 66: "Room Scale", 67: "Seated",
    68: "Standing", 69: "Native Vive", 70: "Native Rift", 71: "Native WMR",
    72: "GPU Access", 73: "HDR", 74: "Steam Input API", 75: "Reflex",
    76: "DualSense", 77: "DualShock", 78: "Xbox", 79: "Sega",
}

def normalize_genres(raw):
    if not raw or not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    if isinstance(first, dict) and 'description' in first:
        return [g.get('description', '') for g in raw if g.get('description')]
    if isinstance(first, (str, int)):
        result = []
        for item in raw:
            key = str(int(item)) if isinstance(item, (int, str)) and str(item).isdigit() else None
            if key and key in GENRE_ID_MAP:
                result.append(GENRE_ID_MAP[key])
        return result
    if isinstance(first, str):
        return raw
    return []

def normalize_categories(raw):
    if not raw or not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    if isinstance(first, dict) and 'description' in first:
        return [c.get('description', '') for c in raw if c.get('description')]
    if isinstance(first, (int, str)):
        result = []
        for item in raw:
            try:
                key = int(item) if isinstance(item, str) else item
                if key in CATEGORY_ID_MAP:
                    result.append(CATEGORY_ID_MAP[key])
            except (ValueError, TypeError):
                continue
        return result
    return []

def parse_release_date(release_data):
    if isinstance(release_data, dict):
        date_str = release_data.get('date', '')
    else:
        date_str = release_data or ''
    date_str = ' '.join(date_str.split())
    if '年' in date_str and '月' in date_str:
        normalized = date_str.replace(' ', '').replace('  ', '')
        for fmt in ['%Y年%m月%d日', '%Y年%m月']:
            try:
                dt = datetime.strptime(normalized, fmt)
                return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
            except:
                continue
    for fmt in ['%Y-%m-%d', '%b %d, %Y', '%b, %Y']:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
        except ValueError:
            continue
    return date_str

# ==================== 安全文件操作 ====================
def safe_write_json(data, path, backup_path=None):
    """安全写入JSON: 先写临时文件+验证+原子替换"""
    tmp = path.with_suffix('.tmp_write')
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=None)
        # 验证JSON完整性
        with open(tmp, 'r', encoding='utf-8') as f:
            json.load(f)
        # 有备份路径则备份原文件
        if backup_path and path.exists():
            shutil.copy2(path, backup_path)
        tmp.replace(path)
        return True
    except (json.JSONDecodeError, OSError):
        try:
            tmp.unlink()
        except:
            pass
        return False

def save_checkpoint(state):
    """保存检查点状态"""
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)

def load_checkpoint():
    """加载检查点状态,支持中断续传"""
    if not STATE_FILE.exists():
        return None
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

# ==================== API抓取 ====================
_session = None
_sem_fetch = None
_sem_tag = None

def get_session():
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        })
    return _session

def fetch_game_full(appid, retries=3):
    """一次性获取游戏详情+评价(合并减少请求次数)"""
    s = get_session()
    result = {'success': False, 'data': None, 'reviews': (0, 0), 'error': None}

    # 抓详情
    for attempt in range(retries):
        try:
            r = s.get(STEAM_API.format(appid=appid), timeout=15)
            if r.status_code == 200:
                d = r.json()
                if str(appid) in d and d[str(appid)]['success']:
                    result['data'] = d[str(appid)]['data']
                    result['success'] = True
                    break
            if attempt < retries - 1:
                time.sleep(2)
        except Exception as e:
            result['error'] = str(e)
            if attempt < retries - 1:
                time.sleep(2)

    if not result['success']:
        time.sleep(REQUEST_DELAY)
        return result

    # 抓评价
    for attempt in range(retries):
        try:
            r = s.get(REVIEWS_API.format(appid=appid), timeout=15)
            if r.status_code == 200:
                d = r.json()
                if d.get('success') == 1:
                    sq = d.get('query_summary', {})
                    result['reviews'] = (
                        sq.get('total_positive', 0),
                        sq.get('total_negative', 0),
                    )
                    break
            if attempt < retries - 1:
                time.sleep(1)
        except Exception:
            if attempt < retries - 1:
                time.sleep(1)

    time.sleep(REQUEST_DELAY)
    return result

def fetch_tags(appid, retries=2):
    """从Steam商店页面HTML提取用户标签"""
    import random
    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/119.0.0.0',
    ]
    s = get_session()
    s.headers.update({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': random.choice(USER_AGENTS),
    })
    for attempt in range(retries):
        try:
            r = s.get(TAG_PAGE_API.format(appid=appid), timeout=15)
            if r.status_code == 200:
                # 复用scrape_tags_for_missing.py的宽松正则
                tags = re.findall(r'<a[^>]+class="[^"]*tag[^"]*"[^>]*>([^<]+)</a>', r.text, re.IGNORECASE)
                tags = [t.strip() for t in tags if t.strip() and len(t.strip()) > 1]
                time.sleep(REQUEST_DELAY_TAG)
                return tags[:20]
            if attempt < retries - 1:
                time.sleep(2)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2)
    time.sleep(REQUEST_DELAY_TAG)
    return []

def fetch_game_worker(appid):
    """多线程抓取单个游戏"""
    result = fetch_game_full(appid)
    if result['success']:
        data = result['data']
        return {
            'appid': str(appid),
            'name': data.get('name', ''),
            'release_date': parse_release_date(data.get('release_date', '')),
            'header_image': data.get('header_image', ''),
            'short_description': data.get('short_description', ''),
            'estimated_owners': '',
            'price': data.get('price', {}).get('final', 0) // 100 if data.get('price') else 0,
            'positive': result['reviews'][0],
            'negative': result['reviews'][1],
            'peak_ccu': 0,
            'metacritic_score': data.get('metacritic', {}).get('score', 0) if data.get('metacritic') else 0,
            'developers': data.get('developers', []),
            'publishers': data.get('publishers', []),
            'genres': normalize_genres(data.get('genres', [])),
            'categories': normalize_categories(data.get('categories', [])),
            'screenshots': [],
            'tags': {},
            'detailed_description': data.get('detailed_description', ''),
            'about_the_game': '',
            'website': data.get('website', ''),
            '_p0_fetched': result['reviews'][0] > 0,
            '_is_new': True,
        }
    return None

def fetch_tags_worker(appid):
    """多线程抓取标签"""
    tags = fetch_tags(appid)
    return (str(appid), tags)  # 返回字符串appid供db更新

def parse_release_for_compare(date_str):
    """解析日期用于比较,返回datetime对象或None"""
    if not date_str:
        return None
    if date_str.startswith('202'):
        for fmt in ['%Y-%m-%d', '%Y-%m']:
            try:
                return datetime.strptime(date_str, fmt)
            except:
                pass
    if '年' in date_str:
        normalized = date_str.replace(' ', '')
        for fmt in ['%Y年%m月%d日', '%Y年%m月']:
            try:
                return datetime.strptime(normalized, fmt)
            except:
                pass
    for fmt in ['%b %d, %Y', '%b, %Y']:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            pass
    return None

# ==================== Steam新游戏发现 ====================
def discover_new_appids(max_pages=MAX_SEARCH_PAGES):
    """从Steam新发行页面发现新游戏appid"""
    log('从Steam新游戏页面发现新增游戏...')
    all_appids = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
    for page in range(1, max_pages + 1):
        try:
            url = (
                f'https://store.steampowered.com/search/results?sort_by=Released_DESC'
                f'&sort_dir=desc&category1=2&category2=0&category3=0&specials=0'
                f'&ignore_autoview=1&search=1&page={page}'
            )
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code != 200:
                log_warn(f'页面{page}请求失败: {r.status_code}')
                break
            found = re.findall(r'data-ds-appid="(\d+)"', r.text)
            if not found:
                found = re.findall(r'"app_(\d+)"', r.text)
            if not found:
                log(f'页面{page}没有找到更多游戏,停止')
                break
            for aid in found:
                aid_int = int(aid)
                if aid_int not in all_appids:
                    all_appids.append(aid_int)
            if page % 10 == 0:
                log(f'  页面{page}: 发现{len(found)}个游戏,总计{len(all_appids)}个')
            if page < max_pages:
                time.sleep(REQUEST_DELAY)
        except Exception as e:
            log_warn(f'页面{page}错误: {e}')
            break
    log_ok(f'共发现{len(all_appids)}个appid')
    return all_appids

# ==================== 标签补全目标筛选 ====================
def find_tag_targets(db, limit=MAX_UPDATE_TAGS):
    """找到需要补全标签的游戏

    筛选条件: 零评价 OR 无tags(不论有无genres)
    这覆盖了增量采集时API不返回标签的情况
    """
    cutoff = datetime.now() - timedelta(days=365)  # 最近一年
    targets = []
    for appid_str, game in db.items():
        try:
            appid = int(appid_str)
        except:
            continue
        pos = game.get('positive', 0) or 0
        neg = game.get('negative', 0) or 0
        reviews = pos + neg
        tags = game.get('tags', {})
        has_tags = (isinstance(tags, dict) and len(tags) > 0) or \
                   (isinstance(tags, list) and len(tags) > 0)
        # 有评价且有标签 -> 跳过
        if reviews > 0 and has_tags:
            continue
        # 零评价 -> 优先补全评价(Step2已处理); 无标签但有评价 -> 补全标签
        # 筛选: 有评价但无标签 OR 零评价且无标签(排除已有标签)
        if reviews > 0 and not has_tags:
            # 有评价但无标签 -> 需要补标签
            pass
        elif reviews == 0 and not has_tags:
            # 零评价且无标签 -> 也需要补标签
            pass
        else:
            continue
        release = game.get('release_date', '')
        parsed = parse_release_for_compare(release)
        if parsed and parsed >= cutoff:
            targets.append((parsed, appid_str, appid))
        elif not release or not parsed:
            # 无日期的也考虑(可能是Steam没给日期)
            targets.append((datetime.min, appid_str, appid))
    # 按时间降序(越新的越前面)
    targets.sort(key=lambda x: x[0], reverse=True)
    return [(t[1], t[2]) for t in targets[:limit]]  # (str_appid, int_appid)

# ==================== SQLite增量同步 ====================
def sync_to_sqlite(db, batch_size=SQLITE_BATCH):
    """增量同步games-index.json到SQLite(games.db)"""
    log_step('增量同步到SQLite...')
    db_path = DATA_DIR / 'games.db'
    if not db_path.exists():
        log_warn('games.db不存在,跳过SQLite同步')
        return

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    # 确保表存在
    cur.execute('''
        CREATE TABLE IF NOT EXISTS games (
            appid INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            release_date TEXT,
            estimated_owners TEXT,
            positive INTEGER DEFAULT 0,
            negative INTEGER DEFAULT 0,
            price REAL DEFAULT 0,
            peak_ccu INTEGER DEFAULT 0,
            _is_test_version INTEGER DEFAULT 0,
            _last_updated INTEGER DEFAULT 0
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS games_json (
            appid INTEGER PRIMARY KEY,
            developers TEXT,
            publishers TEXT,
            genres TEXT,
            categories TEXT,
            screenshots TEXT,
            tags TEXT,
            detailed_description TEXT
        )
    ''')

    items = list(db.items())
    total = len(items)
    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        for appid_str, game in batch:
            try:
                appid = int(appid_str)
            except:
                continue
            now_ts = int(time.time())
            is_test = 1 if game.get('_is_test_version') or game.get('isTestVersion') else 0

            cur.execute('''
                INSERT OR REPLACE INTO games
                (appid, name, release_date, estimated_owners, positive, negative,
                 price, peak_ccu, _is_test_version, _last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                appid, game.get('name', ''), game.get('release_date', ''),
                game.get('estimated_owners', ''),
                game.get('positive', 0) or 0, game.get('negative', 0) or 0,
                game.get('price', 0) or 0, game.get('peak_ccu', 0) or 0,
                is_test, now_ts,
            ))

            cur.execute('''
                INSERT OR REPLACE INTO games_json
                (appid, developers, publishers, genres, categories, screenshots, tags, detailed_description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                appid,
                json.dumps(game.get('developers', []), ensure_ascii=False),
                json.dumps(game.get('publishers', []), ensure_ascii=False),
                json.dumps(game.get('genres', []), ensure_ascii=False),
                json.dumps(game.get('categories', []), ensure_ascii=False),
                json.dumps(game.get('screenshots', []), ensure_ascii=False),
                json.dumps(game.get('tags', {}), ensure_ascii=False),
                game.get('detailed_description', ''),
            ))

        conn.commit()
        if (i + batch_size) % 5000 == 0 or (i + batch_size) >= total:
            log_prog(f'  SQLite同步: {min(i + batch_size, total)}/{total}')

    conn.close()
    log_ok(f'SQLite同步完成,共{total}条记录')

# ==================== 预计算 ====================
def run_precompute():
    """调用precompute.ts生成预计算缓存"""
    log_step('运行预计算缓存...')
    script_ts = DATA_DIR.parent / 'scripts' / 'precompute.ts'
    script_py = DATA_DIR.parent / 'scripts' / 'precompute.py'
    project_root = DATA_DIR.parent

    if script_ts.exists():
        # 尝试多种方式调用 tsx
        import shutil
        tsx_paths = [
            'npx.cmd', 'npx',
            str(project_root / 'node_modules' / '.bin' / 'tsx'),
            str(project_root / 'node_modules' / '.bin' / 'tsx.cmd'),
        ]
        tsx_cmd = None
        for p in tsx_paths:
            if shutil.which(p) or Path(p).exists():
                tsx_cmd = p
                break
        if tsx_cmd:
            try:
                result = subprocess.run(
                    [tsx_cmd, 'tsx', str(script_ts)],
                    capture_output=True, text=True, timeout=300,
                    cwd=str(project_root)
                )
                if result.returncode == 0:
                    log_ok('预计算完成')
                    return
                else:
                    log_warn(f'预计算失败: {result.stderr[:200]}')
            except Exception as e:
                log_warn(f'预计算异常: {e}')
        else:
            log_warn('tsx未找到,请先运行: npm install')

    if script_py.exists():
        try:
            result = subprocess.run(
                ['python', str(script_py)],
                capture_output=True, text=True, timeout=300,
                cwd=str(project_root)
            )
            if result.returncode == 0:
                log_ok('预计算完成')
            else:
                log_warn(f'预计算失败: {result.stderr[:200]}')
        except Exception as e:
            log_warn(f'预计算异常: {e}')
    else:
        log_warn('precompute脚本不存在,跳过预计算')

# ==================== 备份 ====================
def run_backup():
    """执行数据备份"""
    log_step('备份数据...')
    script_path = Path(r'D:\Steam全域游戏搜索\scripts\backup-data.py')
    if not script_path.exists():
        log_skip('backup-data.py不存在,跳过备份')
        return
    try:
        result = subprocess.run(
            ['python', str(script_path)],
            capture_output=True, text=True, timeout=60,
            cwd=str(Path(r'D:\Steam全域游戏搜索'))
        )
        if result.returncode == 0:
            log_ok('备份完成')
        else:
            log_warn(f'备份失败: {result.stderr[:100]}')
    except Exception as e:
        log_warn(f'备份异常: {e}')

# ==================== 主流程 ====================
def main():
    t0 = time.time()

    log('=' * 60)
    log('Steam游戏数据 - 统一工作流开始')
    log('=' * 60)

    # ==================== Step 0: 检查点恢复 ====================
    checkpoint = load_checkpoint()
    start_step = checkpoint.get('step', 1) if checkpoint else 1
    completed_new_appids = set(checkpoint.get('completed_new_appids', [])) if checkpoint else set()
    tag_done = set(checkpoint.get('completed_tag_appids', [])) if checkpoint else set()
    db = {}

    if INDEX_FILE.exists():
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            db = json.load(f)
    else:
        log_fail('games-index.json不存在,无法继续')
        return

    local_appids = set(db.keys())
    log_ok(f'本地游戏数: {len(local_appids):,}')

    if start_step > 1:
        log(f'从检查点恢复,上次中断于 Step {start_step}')
        log(f'已完成新游戏采集: {len(completed_new_appids)}个')

    # ==================== Step 1: 发现新游戏 ====================
    if start_step <= 1:
        new_release_appids = discover_new_appids()
        new_appids = [aid for aid in new_release_appids if str(aid) not in local_appids]
        if len(new_appids) > MAX_NEW_GAMES:
            log(f'新游戏过多({len(new_appids)}个),限制为{MAX_NEW_GAMES}个')
            new_appids = new_appids[:MAX_NEW_GAMES]
        log_ok(f'发现新游戏: {len(new_appids)}个')

        # 保存discovery结果供后续步骤使用
        save_checkpoint({
            'step': 2,
            'new_appids': new_appids,
            'completed_new_appids': [],
            'total_games': len(db),
            'start_time': datetime.now().isoformat(),
        })
    else:
        new_appids = checkpoint.get('new_appids', [])
        log_ok(f'跳过Step1,从检查点加载新游戏列表: {len(new_appids)}个')

    # ==================== Step 2: 多线程采集新游戏 ====================
    if start_step <= 2:
        new_remaining = [aid for aid in new_appids if aid not in completed_new_appids]

        if new_remaining:
            log_step(f'多线程采集新游戏 ({len(new_remaining)}个, {FETCH_THREADS}并发)...')

            results = {'success': 0, 'failed': 0}
            processed = 0

            with ThreadPoolExecutor(max_workers=FETCH_THREADS) as executor:
                future_to_appid = {executor.submit(fetch_game_worker, aid): aid for aid in new_remaining}

                for future in as_completed(future_to_appid):
                    appid = future_to_appid[future]
                    try:
                        game = future.result()
                        if game:
                            db[str(appid)] = game
                            results['success'] += 1
                            completed_new_appids.add(appid)
                        else:
                            results['failed'] += 1
                    except Exception:
                        results['failed'] += 1

                    processed += 1

                    if processed % 50 == 0:
                        pct = processed / len(new_remaining) * 100
                        log_prog(
                            f'  [{processed}/{len(new_remaining)} ({pct:.1f}%)] '
                            f'成功:{results["success"]} 失败:{results["failed"]}'
                        )

                    # 检查点保存
                    if processed % SAVE_EVERY == 0:
                        if safe_write_json(db, INDEX_FILE, BACKUP_FILE):
                            save_checkpoint({
                                'step': 2,
                                'new_appids': new_appids,
                                'completed_new_appids': list(completed_new_appids),
                                'total_games': len(db),
                                'start_time': checkpoint.get('start_time') if checkpoint else datetime.now().isoformat(),
                            })

            log_ok(f'新游戏采集完成: 新增{results["success"]}, 失败{results["failed"]}')
        else:
            log_ok('没有新游戏需要采集')

        # 标记Step2完成,进入Step3
        save_checkpoint({
            'step': 3,
            'new_appids': new_appids,
            'completed_new_appids': list(completed_new_appids),
            'total_games': len(db),
            'start_time': checkpoint.get('start_time') if checkpoint else datetime.now().isoformat(),
        })

    # ==================== Step 3: 多线程补全零评价游戏的标签 ====================
    if start_step <= 3:
        tag_targets = find_tag_targets(db, limit=MAX_UPDATE_TAGS)
        tag_targets = [(s, i) for s, i in tag_targets if s not in tag_done]

        if tag_targets:
            log_step(f'多线程补全标签 ({len(tag_targets)}个, {TAG_THREADS}并发)...')
            str_targets = [s for s, i in tag_targets]

            done = 0
            with ThreadPoolExecutor(max_workers=TAG_THREADS) as executor:
                future_to_appid = {executor.submit(fetch_tags_worker, aid): str(aid) for str_aid, aid in tag_targets}

                for future in as_completed(future_to_appid):
                    appid_str = future_to_appid[future]
                    try:
                        appid_str, tags = future.result()
                        if tags and appid_str in db:
                            db[appid_str]['_user_tags'] = tags
                            if 'tags' not in db[appid_str] or not db[appid_str]['tags']:
                                db[appid_str]['tags'] = {}
                            for t in tags[:20]:
                                if t not in db[appid_str]['tags']:
                                    db[appid_str]['tags'][t] = 5
                            tag_done.add(appid_str)
                    except Exception:
                        pass

                    done += 1
                    if done % 50 == 0:
                        log_prog(f'  标签补全: {done}/{len(tag_targets)}')

                    if done % SAVE_EVERY == 0:
                        safe_write_json(db, INDEX_FILE, BACKUP_FILE)
                        save_checkpoint({
                            'step': 3,
                            'new_appids': new_appids,
                            'completed_new_appids': list(completed_new_appids),
                            'completed_tag_appids': list(tag_done),
                            'total_games': len(db),
                            'start_time': checkpoint.get('start_time') if checkpoint else datetime.now().isoformat(),
                        })

            log_ok(f'标签补全完成: {len(tag_done)}个')
        else:
            log_ok('没有需要补全标签的游戏')

        safe_write_json(db, INDEX_FILE, BACKUP_FILE)
        save_checkpoint({
            'step': 4,
            'new_appids': new_appids,
            'completed_new_appids': list(completed_new_appids),
            'completed_tag_appids': list(tag_done),
            'total_games': len(db),
            'start_time': checkpoint.get('start_time') if checkpoint else datetime.now().isoformat(),
        })

    # ==================== Step 4: 增量同步到SQLite ====================
    if start_step <= 4:
        sync_to_sqlite(db)

    # ==================== Step 5: 预计算缓存 ====================
    if start_step <= 5:
        run_precompute()

    # ==================== Step 6: 备份 ====================
    if start_step <= 6:
        run_backup()

    # 清理检查点
    if STATE_FILE.exists():
        STATE_FILE.unlink()

    # ==================== 统计 ====================
    elapsed = time.time() - t0
    total_now = len(db)
    has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
    new_count = sum(1 for g in db.values() if g.get('_is_new'))

    log('')
    log('=' * 60)
    log('统一工作流完成')
    log('=' * 60)
    log(f'  总游戏数: {total_now:,} (本次新增{new_count}个)')
    log(f'  有评价: {has_reviews:,}')
    log(f'  耗时: {elapsed:.0f}秒 ({elapsed/60:.1f}分钟)')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log('\n用户中断,检查点已保存,可重新运行继续')
        sys.exit(1)
    except Exception as e:
        log(f'\n错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
