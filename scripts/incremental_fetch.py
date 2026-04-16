"""
增量更新脚本 - 检测Steam新增/修改的游戏并更新本地数据库

工作流程:
1. 从Steam新游戏页面发现新增游戏
2. 与本地数据库对比，找出新增的游戏
3. 抓取新游戏数据
4. 可选: 更新最近发布游戏的评价数据

用途: 定时任务自动执行，保持数据新鲜
"""
import json
import time
import requests
import sys
import shutil
import re
from pathlib import Path
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')

# ==================== 配置 ====================
INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
BACKUP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.incr_backup')
TEMP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.incr_temp')
STATE_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.last_run')

# Steam API
STEAM_API = 'https://store.steampowered.com/api/appdetails?appids={appid}&cc=cn&l=schinese'
REVIEWS_API = 'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'

# 请求间隔(秒)
REQUEST_DELAY = 0.5

# 检查点保存间隔
SAVE_EVERY = 100

# 每次运行最多处理数量(避免单个任务运行太久)
MAX_NEW_GAMES = 3000
MAX_UPDATE_GAMES = 500

# Steam 搜索页面最大页数（每页25个，约覆盖43天）
MAX_SEARCH_PAGES = 100

# ==================== 日志 ====================
def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)

# ==================== Steam API ID 映射表 ====================
# Steam API 2025年末改变了 genres/categories 返回格式：
# 旧格式: [{id:"1", description:"Action"}]
# 新格式: ["1","25","4"] 或 [2,10,29]

GENRE_ID_MAP = {
    # ===== 游戏类型（基于2026年Steam API实际数据验证）====
    # Steam 在 2025年末至2026年初重构了 genres ID 体系
    # 验证来源：直接调用 Steam API 对比第三方数据集 ID
    "1": "Action",
    "2": "Strategy",
    "3": "RPG",
    "4": "Casual",
    "7": "Education",
    "8": "Utilities",
    "9": "Racing",
    "10": "Photo Editing",
    "13": "Sports",
    "17": "Documentary",
    "18": "Sports",
    "20": "Software Training",
    "23": "Indie",
    "24": "Video Production",
    "25": "Adventure",
    "26": "Violent",
    "27": "Nudity",
    "28": "Simulation",
    "29": "Massively Multiplayer",
    "30": "Farming Sim",
    "35": "Free To Play",
    "37": "Free To Play",
    "51": "Animation & Modeling",
    "52": "Audio Production",
    "53": "Design & Illustration",
    "54": "Education",
    "55": "Photo Editing",
    "56": "Software Training",
    "57": "Utilities",
    "58": "Video Production",
    "59": "Web Publishing",
    "60": "Game Development",
    "70": "Early Access",
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
    """将 genres 标准化为字符串数组，兼容新旧格式"""
    if not raw:
        return []
    if not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    # 旧格式: [{id:"1", description:"Action"}]
    if isinstance(first, dict) and 'description' in first:
        return [g.get('description', '') for g in raw if g.get('description')]
    # 新格式: ["1","25","4"] 或 [1, 25, 4]
    if isinstance(first, (str, int)):
        result = []
        for item in raw:
            key = str(int(item)) if isinstance(item, (int, str)) and str(item).isdigit() else None
            if key and key in GENRE_ID_MAP:
                result.append(GENRE_ID_MAP[key])
        return result
    # 正常文本数组
    if isinstance(first, str):
        return raw
    return []

def normalize_categories(raw):
    """将 categories 标准化为字符串数组，兼容新旧格式"""
    if not raw:
        return []
    if not isinstance(raw, list) or len(raw) == 0:
        return []
    first = raw[0]
    # 旧格式: [{id:2, description:"Steam Play"}]
    if isinstance(first, dict) and 'description' in first:
        return [c.get('description', '') for c in raw if c.get('description')]
    # 新格式: [2, 10, 29] 或 ["2","10","29"]
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

# ==================== 工具函数 ====================
def save_json(data, path):
    """安全保存JSON文件"""
    with open(TEMP_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    try:
        with open(TEMP_FILE, 'r', encoding='utf-8') as f:
            json.load(f)
    except json.JSONDecodeError:
        try:
            TEMP_FILE.unlink()
        except:
            pass
        return False
    if path.exists():
        shutil.copy2(path, BACKUP_FILE)
    TEMP_FILE.replace(path)
    return True

def save_state(state):
    """保存运行状态"""
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)

def parse_release_date(release_data):
    """解析Steam API返回的发行日期"""
    if isinstance(release_data, dict):
        date_str = release_data.get('date', '')
    else:
        date_str = release_data or ''

    # 标准化：去除多余空格，转换为标准格式存储
    # Steam API 常见格式:
    #   "2026 年 4 月 13 日" (中文，年月日有空格)
    #   "2026年4月13日" (中文，无空格)
    #   "Apr 13, 2026" (英文)
    #   "Apr, 2026" (仅年月)
    #   "2026-04-13" (ISO)
    date_str = ' '.join(date_str.split())  # 合并多余空格

    # 中文格式（有空格）
    if '年' in date_str and '月' in date_str:
        # "2026 年 4 月 13 日" -> "2026年4月13日"
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

    # 无法解析时返回原文
    return date_str

def fetch_game_data(appid, retries=3):
    """获取游戏基础数据"""
    url = STEAM_API.format(appid=appid)
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                d = r.json()
                if str(appid) in d and d[str(appid)]['success']:
                    return d[str(appid)]['data']
            if attempt < retries - 1:
                time.sleep(2)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2)
    return None

def fetch_reviews(appid, retries=3):
    """获取游戏评价数据"""
    url = REVIEWS_API.format(appid=appid)
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                d = r.json()
                if d.get('success') == 1:
                    sq = d.get('query_summary', {})
                    return sq.get('total_positive', 0), sq.get('total_negative', 0)
            if attempt < retries - 1:
                time.sleep(2)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2)
    return None, None

def get_new_releases(max_pages=None):
    """
    从Steam新发行页面获取新游戏appid列表

    策略: Steam的"最新"排序页面会展示最近发行的游戏
    通过解析HTML获取appid列表
    """
    if max_pages is None:
        max_pages = MAX_SEARCH_PAGES

    log(f'[Step 1] 从Steam发现新游戏（最多{max_pages}页）...')

    all_appids = []

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    for page in range(1, max_pages + 1):
        try:
            # Steam新游戏页面
            url = f'https://store.steampowered.com/search/results?sort_by=Released_DESC&sort_dir=desc&category1=2&category2=0&category3=0&specials=0&ignore_autoview=1&search=1&page={page}'
            r = requests.get(url, headers=headers, timeout=30)

            if r.status_code != 200:
                log(f'    页面{page}请求失败: {r.status_code}')
                break

            # 从HTML提取appid
            # 格式: data-ds-appid="123456"
            found = re.findall(r'data-ds-appid="(\d+)"', r.text)

            if not found:
                # 备选格式
                found = re.findall(r'"app_(\d+)"', r.text)

            if not found:
                log(f'    页面{page}没有找到更多游戏，停止')
                break

            for aid in found:
                if int(aid) not in all_appids:
                    all_appids.append(int(aid))

            if page % 10 == 0:
                log(f'    页面{page}: 发现{len(found)}个游戏，总计{len(all_appids)}个')

            if page < max_pages:
                time.sleep(REQUEST_DELAY)

        except Exception as e:
            log(f'    页面{page}错误: {e}')
            break

    log(f'    共发现{len(all_appids)}个appid')
    return all_appids

def get_recently_updated_games(db, days_back=30, limit=500):
    """
    获取最近可能更新的游戏

    策略: 只检查最近30天发布的游戏，因为只有这些游戏可能有数据变化
    """
    log(f'[Step 2] 筛选最近{days_back}天发布的游戏...')

    recent = []
    cutoff = datetime.now() - timedelta(days=days_back)

    for appid, game in db.items():
        date_str = game.get('release_date', '')
        if not date_str:
            continue

        # 解析日期（支持多种格式）
        parsed = None
        # ISO 格式
        if date_str.startswith('202'):
            for fmt in ['%Y-%m-%d', '%Y-%m']:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    break
                except:
                    pass
        # 中文格式（有无空格）
        if not parsed and '年' in date_str:
            normalized = date_str.replace(' ', '')
            for fmt in ['%Y年%m月%d日', '%Y年%m月']:
                try:
                    parsed = datetime.strptime(normalized, fmt)
                    break
                except:
                    pass
        # 英文格式
        if not parsed:
            for fmt in ['%b %d, %Y', '%b, %Y']:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    break
                except:
                    pass

        if parsed and parsed >= cutoff:
            recent.append(int(appid))

    log(f'    最近{days_back}天发布: {len(recent)}个')

    # 只取前limit个(按appid降序，越大越新)
    recent.sort(reverse=True)
    return recent[:limit]

def main():
    t0 = time.time()
    log('=' * 60)
    log('增量更新开始')
    log('=' * 60)

    # ==================== Step 0: 加载本地数据 ====================
    log('[Step 0] 加载本地数据库...')
    if not INDEX_FILE.exists():
        log('    错误: games-index.json不存在')
        return

    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        db = json.load(f)

    local_appids = set(db.keys())
    log(f'    本地游戏数: {len(local_appids):,}')
    log(f'    文件修改时间: {datetime.fromtimestamp(INDEX_FILE.stat().st_mtime).strftime("%Y-%m-%d %H:%M")}')

    # ==================== Step 1: 发现新游戏 ====================
    new_release_appids = get_new_releases()
    new_appids = [aid for aid in new_release_appids if aid not in local_appids]

    # 限制数量
    if len(new_appids) > MAX_NEW_GAMES:
        log(f'    新游戏过多({len(new_appids)}个)，限制为{MAX_NEW_GAMES}个')
        new_appids = new_appids[:MAX_NEW_GAMES]

    log(f'[Step 1] 发现新游戏: {len(new_appids)}个')

    if new_appids:
        log(f'[Step 2] 开始采集新游戏...')

        results = {'success': 0, 'failed': 0}
        processed = 0
        save_count = 0

        for appid in new_appids:
            data = fetch_game_data(appid)

            if data:
                game = {
                    'name': data.get('name', ''),
                    'release_date': parse_release_date(data.get('release_date', '')),
                    'header_image': data.get('header_image', ''),
                    'short_description': data.get('short_description', ''),
                    'estimated_owners': '',
                    'price': data.get('price', {}).get('final', 0) // 100 if data.get('price') else 0,
                    'positive': 0,
                    'negative': 0,
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
                    '_p0_fetched': False,
                    '_is_new': True,
                }

                db[str(appid)] = game
                results['success'] += 1

                # 同时获取评价
                pos, neg = fetch_reviews(appid)
                if pos is not None:
                    db[str(appid)]['positive'] = pos
                    db[str(appid)]['negative'] = neg
                    db[str(appid)]['_p0_fetched'] = True
            else:
                results['failed'] += 1

            processed += 1
            time.sleep(REQUEST_DELAY)

            if processed % 50 == 0:
                pct = processed / len(new_appids) * 100
                log(f'    [{processed}/{len(new_appids)} ({pct:.1f}%)] 成功:{results["success"]} 失败:{results["failed"]}')

            # 检查点
            if processed % SAVE_EVERY == 0:
                if save_json(db, INDEX_FILE):
                    save_count += 1

        log(f'    新游戏采集完成: 新增{results["success"]}, 失败{results["failed"]}')

    # ==================== Step 3: 更新最近游戏的评价 ====================
    recent_to_update = get_recently_updated_games(db, days_back=30, limit=MAX_UPDATE_GAMES)
    # 排除新游戏(刚采集过)
    recent_to_update = [aid for aid in recent_to_update if aid not in new_appids]

    if recent_to_update:
        log(f'[Step 3] 更新最近游戏的评价 ({len(recent_to_update)}个)...')

        results = {'updated': 0, 'failed': 0}
        processed = 0

        for appid in recent_to_update:
            if str(appid) not in db:
                continue

            pos, neg = fetch_reviews(appid)

            if pos is not None:
                db[str(appid)]['positive'] = pos
                db[str(appid)]['negative'] = neg
                results['updated'] += 1
            else:
                results['failed'] += 1

            processed += 1
            time.sleep(REQUEST_DELAY)

            if processed % 100 == 0:
                pct = processed / len(recent_to_update) * 100
                log(f'    [{processed}/{len(recent_to_update)} ({pct:.1f}%)] 更新:{results["updated"]} 失败:{results["failed"]}')

        log(f'    评价更新完成: 更新{results["updated"]}, 失败{results["failed"]}')

    # ==================== Step 4: 保存 ====================
    log('[Step 4] 保存...')
    save_json(db, INDEX_FILE)

    # 保存状态
    save_state({
        'last_run': datetime.now().isoformat(),
        'total_games': len(db),
    })

    # ==================== 统计 ====================
    elapsed = time.time() - t0
    total_now = len(db)
    has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
    new_count = sum(1 for g in db.values() if g.get('_is_new'))

    log('')
    log('=' * 60)
    log('增量更新完成')
    log('=' * 60)
    log(f'  总游戏数: {total_now:,} (本次新增{results.get("success", 0) if new_appids else 0}个)')
    log(f'  有评价: {has_reviews:,}')
    log(f'  耗时: {elapsed:.0f}秒 ({elapsed/60:.1f}分钟)')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log('\n用户中断')
        sys.exit(1)
    except Exception as e:
        log(f'\n错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
