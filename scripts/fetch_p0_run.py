# -*- coding: utf-8 -*-
"""
采集P0: 为2024+零评价有类型有标签的游戏批量获取评价数
"""
import re
import sys
import time

from config import INDEX_FILE, BACKUP_FILE
from logging_utils import log
from data_utils import load_games_index, safe_save_json
from steam_api import fetch_reviews

sys.stdout.reconfigure(encoding='utf-8')


def get_year(date_str):
    """从日期字符串提取年份"""
    if not date_str:
        return 0
    m = re.search(r'(\d{4})', str(date_str))
    return int(m.group(1)) if m else 0


def has_tags(game):
    """检查游戏是否有标签"""
    t = game.get('tags', [])
    if isinstance(t, list):
        return len(t) > 0
    if isinstance(t, dict):
        return len(t) > 0
    return False


log('[1] 加载 games-index.json ...')
t0 = time.time()
db = load_games_index(INDEX_FILE)
log(f'    加载 {len(db):,} 个游戏，耗时 {time.time()-t0:.1f}s')

targets = []
for appid, g in db.items():
    reviews = (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0)
    if reviews > 0:
        continue
    if get_year(g.get('release_date', '')) < 2024:
        continue
    if len(g.get('genres', []) or []) == 0:
        continue
    if not has_tags(g):
        continue
    targets.append(appid)

total = len(targets)
log(f'    目标游戏（2024+, 零评价, 有类型, 有标签）: {total:,}')

done = sum(1 for aid in targets if db[aid].get('_p0_fetched'))
log(f'    已完成: {done:,}')

if done >= total:
    log('[2] 全部完成！')
    sys.exit(0)

log(f'[2] 开始采集 #{done} ... (剩余: {total - done:,})')
log('=' * 60)

results = {'success': 0, 'failed': 0, 'got_reviews': 0, 'still_zero': 0}
fetch_start = time.time()
save_count = 0
save_every = 200
processed_this_run = 0

for appid in targets:
    appid_str = str(appid)
    if db[appid_str].get('_p0_fetched'):
        continue

    pos, neg = fetch_reviews(int(appid))

    if pos is not None:
        db[appid_str]['positive'] = pos
        db[appid_str]['negative'] = neg
        db[appid_str]['_p0_fetched'] = True
        results['success'] += 1
        if pos + neg > 0:
            results['got_reviews'] += 1
        else:
            results['still_zero'] += 1
    else:
        results['failed'] += 1

    time.sleep(0.3)
    processed_this_run += 1

    if processed_this_run % 100 == 0 or processed_this_run == total - done:
        elapsed = time.time() - fetch_start
        rate = processed_this_run / elapsed if elapsed > 0 else 0
        remaining = (total - done - processed_this_run) / rate if rate > 0 else 0
        pct = processed_this_run / (total - done) * 100
        success_rate = results['got_reviews'] / results['success'] * 100 if results['success'] > 0 else 0

        log(f'    [{processed_this_run:,}/{total - done:,} ({pct:.1f}%)] '
              f'成功:{results["success"]} | 有评价:{results["got_reviews"]}({success_rate:.1f}%) | '
              f'失败:{results["failed"]} | {rate:.1f}/s | 预计剩余:{remaining/60:.0f}分钟')

    if processed_this_run % save_every == 0:
        log(f'    [保存检查点 ...]')
        if safe_save_json(db, INDEX_FILE, BACKUP_FILE):
            save_count += 1
            log(f'    [检查点 #{save_count} 已保存]')
        else:
            log(f'    [保存失败 - 将在下一个间隔重试]')

log('')
log(f'=== 本次运行结果 ===')
log(f'  已处理: {processed_this_run}')
log(f'  成功:   {results["success"]}')
log(f'  失败:    {results["failed"]}')
log(f'  有评价:   {results["got_reviews"]} ({results["got_reviews"]/results["success"]*100:.1f}%)')
log(f'  仍为零:    {results["still_zero"]}')

log(f'\n=== 最终保存 ===')
if safe_save_json(db, INDEX_FILE, BACKUP_FILE):
    log(f'    [最终保存成功]')
    save_count += 1
else:
    log(f'    [最终保存失败]')

has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
done_final = sum(1 for aid in targets if db[aid].get('_p0_fetched'))

log(f'\n=== 会话统计 ===')
log(f'  数据库中游戏总数:    {len(db):,}')
log(f'  有评价的游戏:  {has_reviews:,}')
log(f'  目标完成:         {done_final:,}/{total:,} ({done_final/total*100:.1f}%)')
log(f'  保存检查点:   {save_count}')
log(f'  耗时:              {time.time() - fetch_start:.0f}s')
log('[完成]')