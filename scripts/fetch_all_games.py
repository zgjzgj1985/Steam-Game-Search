"""
采集无类型无标签的零评价游戏: 尝试为所有零评价游戏获取评价数
"""
import json, re, time, requests, sys, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
BACKUP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.all_backup')
TEMP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.temp')
REVIEWS_API = 'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'

def log(msg):
    print(msg, flush=True)

def fetch(appid, retries=3):
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

def save(data, path):
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

log('[1] Loading games-index.json ...')
t0 = time.time()
with open(INDEX_FILE, 'r', encoding='utf-8') as f:
    db = json.load(f)
log(f'    Loaded {len(db):,} games in {time.time()-t0:.1f}s')

# 收集所有零评价游戏（不限类型和标签）
targets = []
for appid, g in db.items():
    reviews = (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0)
    if reviews > 0:
        continue
    targets.append(appid)

total = len(targets)
log(f'    Target games (zero reviews, all): {total:,}')

done = sum(1 for aid in targets if db[aid].get('_p0_fetched'))
log(f'    Already done: {done:,}')

if done >= total:
    log('[2] All done!')
    sys.exit(0)

log(f'[2] Starting fetch from #{done} ... (remaining: {total - done:,})')
log('=' * 60)

results = {'success': 0, 'failed': 0, 'got_reviews': 0, 'still_zero': 0}
fetch_start = time.time()
save_count = 0
save_every = 200
processed_this_run = 0

for appid in targets:
    if db[appid].get('_p0_fetched'):
        continue

    pos, neg = fetch(appid)

    if pos is not None:
        db[appid]['positive'] = pos
        db[appid]['negative'] = neg
        db[appid]['_p0_fetched'] = True
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
              f'Success:{results["success"]} | GotReviews:{results["got_reviews"]}({success_rate:.1f}%) | '
              f'Failed:{results["failed"]} | {rate:.1f}/s | ETA:{remaining/3600:.1f}h')

    if processed_this_run % save_every == 0:
        log(f'    [Saving checkpoint ...]')
        if save(db, INDEX_FILE):
            save_count += 1
            log(f'    [Checkpoint #{save_count} saved]')
        else:
            log(f'    [Save FAILED - will retry next interval]')

log('')
log(f'=== This Run Results ===')
log(f'  Processed: {processed_this_run}')
log(f'  Success:   {results["success"]}')
log(f'  Failed:    {results["failed"]}')
log(f'  Got reviews:   {results["got_reviews"]} ({results["got_reviews"]/results["success"]*100:.1f}%)')
log(f'  Still zero:    {results["still_zero"]}')

log(f'\n=== Final Save ===')
if save(db, INDEX_FILE):
    log(f'    [Final save OK]')
    save_count += 1
else:
    log(f'    [Final save FAILED]')

has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
done_final = sum(1 for aid in targets if db[aid].get('_p0_fetched'))

log(f'\n=== Session Stats ===')
log(f'  Total games in db:    {len(db):,}')
log(f'  Games with reviews:  {has_reviews:,}')
log(f'  Targets done:         {done_final:,}/{total:,} ({done_final/total*100:.1f}%)')
log(f'  Checkpoints saved:   {save_count}')
log(f'  Elapsed:              {time.time() - fetch_start:.0f}s')
log('[DONE]')
