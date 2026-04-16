"""
采集P0: 为2024+零评价有类型有标签的游戏批量获取评价数
"""
import json, re, time, requests, sys, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# 使用正确的路径
INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
BACKUP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.p0_backup')
TEMP_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json.temp')
REVIEWS_API = 'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'

def get_year(date_str):
    if not date_str:
        return 0
    m = re.search(r'(\d{4})', str(date_str))
    return int(m.group(1)) if m else 0

def has_tags(game):
    t = game.get('tags', [])
    if isinstance(t, list):
        return len(t) > 0
    if isinstance(t, dict):
        return len(t) > 0
    return False

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
        TEMP_FILE.unlink(missing_ok=True)
        return False
    if path.exists():
        shutil.copy2(path, BACKUP_FILE)
    TEMP_FILE.replace(path)
    return True

print('[1] Loading games-index.json ...')
t0 = time.time()
with open(INDEX_FILE, 'r', encoding='utf-8') as f:
    db = json.load(f)
print(f'    Loaded {len(db):,} games in {time.time()-t0:.1f}s')

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
print(f'    Target games (2024+, zero reviews, has genres, has tags): {total:,}')

done = sum(1 for aid in targets if db[aid].get('_p0_fetched'))
print(f'    Already done: {done:,}')

if done >= total:
    print('[2] All done!')
    sys.exit(0)

print(f'[2] Starting fetch from #{done} ... (remaining: {total - done:,})')
print('=' * 60)

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

        print(f'    [{processed_this_run:,}/{total - done:,} ({pct:.1f}%)] '
              f'Success:{results["success"]} | GotReviews:{results["got_reviews"]}({success_rate:.1f}%) | '
              f'Failed:{results["failed"]} | {rate:.1f}/s | ETA:{remaining/60:.0f}min')

    if processed_this_run % save_every == 0:
        print(f'    [Saving checkpoint ...]')
        if save(db, INDEX_FILE):
            save_count += 1
            print(f'    [Checkpoint #{save_count} saved]')
        else:
            print(f'    [Save FAILED - will retry next interval]')

print('')
print(f'=== This Run Results ===')
print(f'  Processed: {processed_this_run}')
print(f'  Success:   {results["success"]}')
print(f'  Failed:    {results["failed"]}')
print(f'  Got reviews:   {results["got_reviews"]} ({results["got_reviews"]/results["success"]*100:.1f}%)')
print(f'  Still zero:    {results["still_zero"]}')

print(f'\n=== Final Save ===')
if save(db, INDEX_FILE):
    print(f'    [Final save OK]')
    save_count += 1
else:
    print(f'    [Final save FAILED]')

has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
done_final = sum(1 for aid in targets if db[aid].get('_p0_fetched'))

print(f'\n=== Session Stats ===')
print(f'  Total games in db:    {len(db):,}')
print(f'  Games with reviews:  {has_reviews:,}')
print(f'  Targets done:         {done_final:,}/{total:,} ({done_final/total*100:.1f}%)')
print(f'  Checkpoints saved:   {save_count}')
print(f'  Elapsed:              {time.time() - fetch_start:.0f}s')
print('[DONE]')
