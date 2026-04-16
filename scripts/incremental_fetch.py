# -*- coding: utf-8 -*-
"""
增量更新脚本 - 检测Steam新增/修改的游戏并更新本地数据库

工作流程:
1. 从Steam新游戏页面发现新增游戏
2. 与本地数据库对比，找出新增的游戏
3. 抓取新游戏数据
4. 可选: 更新最近发布游戏的评价数据

用途: 定时任务自动执行，保持数据新鲜
"""
import sys
import time
import json
from pathlib import Path
from datetime import datetime, timedelta

from config import (
    INDEX_FILE, BACKUP_FILE, INCR_BACKUP_FILE, STATE_FILE,
    REQUEST_DELAY, SAVE_EVERY, MAX_NEW_GAMES, MAX_UPDATE_GAMES,
    MAX_SEARCH_PAGES
)
from logging_utils import log
from data_utils import load_games_index, safe_save_json, normalize_genres, normalize_categories
from steam_api import fetch_game_data, fetch_reviews

sys.stdout.reconfigure(encoding='utf-8')

# Steam 搜索页面 URL
STEAM_STORE_URL = 'https://store.steampowered.com/search/?term={term}&page={page}'


def parse_release_date(date_str):
    """
    解析游戏发布日期，支持多种格式
    """
    if not date_str:
        return ''

    # 中文格式
    if '年' in date_str:
        normalized = date_str.replace(' ', '').replace('  ', '')
        for fmt in ['%Y年%m月%d日', '%Y年%m月']:
            try:
                dt = datetime.strptime(normalized, fmt)
                return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
            except Exception:
                continue

    for fmt in ['%Y-%m-%d', '%b %d, %Y', '%b, %Y']:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d') if '%d' in fmt else dt.strftime('%Y-%m')
        except ValueError:
            continue

    return date_str


def save_json(data, path):
    """保存 JSON 文件"""
    return safe_save_json(data, path, BACKUP_FILE)


def save_state(state):
    """保存运行状态"""
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def get_new_releases(max_pages=None):
    """从Steam新游戏页面获取新游戏appid列表"""
    import re
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError

    if max_pages is None:
        max_pages = MAX_SEARCH_PAGES

    all_appids = []
    seen = set()

    for page in range(max_pages):
        try:
            url = STEAM_STORE_URL.format(term='a', page=page)
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=15) as response:
                html = response.read().decode('utf-8')

            pattern = r'/app/(\d+)/'
            found = set(re.findall(pattern, html))

            new_found = found - seen
            seen.update(found)
            all_appids.extend(int(aid) for aid in new_found)

            if not found:
                break

            time.sleep(REQUEST_DELAY)

        except (URLError, HTTPError) as e:
            log(f'    页面{page}错误: {e}')
            break
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

        # 解析日期
        parsed = None
        # ISO 格式
        if date_str.startswith('202'):
            for fmt in ['%Y-%m-%d', '%Y-%m']:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    break
                except Exception:
                    pass

        # 中文格式
        if not parsed and '年' in date_str:
            normalized = date_str.replace(' ', '')
            for fmt in ['%Y年%m月%d日', '%Y年%m月']:
                try:
                    parsed = datetime.strptime(normalized, fmt)
                    break
                except Exception:
                    pass

        # 英文格式
        if not parsed:
            for fmt in ['%b %d, %Y', '%b, %Y']:
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    break
                except Exception:
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

    db = load_games_index(INDEX_FILE)

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
