"""
Steam 用户标签补全脚本（多线程版）
为 games-index.json 中缺失 tags 的 2026 年游戏批量抓取用户标签
"""
import json
import re
import time
import random
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
STATE_FILE = Path(r'D:\Steam全域游戏搜索\public\data\tags-scrape-state.json')
TAGS_OUTPUT = Path(r'D:\Steam全域游戏搜索\public\data\scraped-tags.json')
BATCH_SAVE = 200
MAX_WORKERS = 8
REQUEST_DELAY = (0.3, 1.0)  # 每个线程的随机延迟范围

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
]

_lock = Lock()
_global_success = 0
_global_fail = 0

def log(msg):
    print(msg, flush=True)

def extract_tags(html):
    tags = re.findall(r'<a[^>]+class="[^"]*tag[^"]*"[^>]*>([^<]+)</a>', html, re.IGNORECASE)
    tags = [t.strip() for t in tags if t.strip() and len(t.strip()) > 1]
    return tags[:20]

def scrape_one(appid_name):
    appid, name = appid_name
    time.sleep(random.uniform(*REQUEST_DELAY))

    url = f'https://store.steampowered.com/app/{appid}/'
    headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode('utf-8', errors='ignore')
        tags = extract_tags(content)
        return (appid, name, tags, None)
    except Exception as e:
        return (appid, name, None, str(e))

def main():
    global _global_success, _global_fail

    log('=== Steam 用户标签补全（多线程版）===')
    log(f'并发数: {MAX_WORKERS}')

    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        games = json.load(f)

    state = {'done': {}, 'failed': {}}
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except Exception:
            pass
    done = state.setdefault('done', {})
    failed = state.setdefault('failed', {})

    scraped_tags = {}
    if TAGS_OUTPUT.exists():
        try:
            with open(TAGS_OUTPUT, 'r', encoding='utf-8') as f:
                scraped_tags = json.load(f)
        except Exception:
            pass

    log(f'已有进度: 成功 {len(done)}, 失败 {len(failed)}')

    to_scrape = []
    for appid, game in games.items():
        if appid in done or appid in failed:
            continue
        rd = game.get('release_date', '')
        if not (rd.startswith('2026-') and rd < '2026-05-01'):
            continue
        tags = game.get('tags', {})
        if tags and len(tags) > 0:
            continue
        to_scrape.append((appid, game.get('name', '')))

    log(f'待抓取: {len(to_scrape)} 个游戏')

    if not to_scrape:
        log('无需抓取')
        return

    # 多线程抓取
    success = 0
    fail = 0
    batch_buf = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(scrape_one, item): item for item in to_scrape}

        for future in as_completed(futures):
            appid, name, tags, err = future.result()

            if tags and len(tags) > 0:
                if appid in games:
                    games[appid]['tags'] = {tag: 10 for tag in tags}
                done[appid] = {'name': name, 'tags': tags, 'ts': time.strftime('%Y-%m-%d %H:%M:%S')}
                scraped_tags[appid] = tags
                success += 1
                batch_buf.append(appid)
            else:
                failed[appid] = {'name': name, 'ts': time.strftime('%Y-%m-%d %H:%M:%S')}
                fail += 1

            cur = success + fail
            if cur % 50 == 0:
                log(f'  {cur}/{len(to_scrape)} | 成功:{success} | 失败:{fail}')

            # 批量保存
            if len(batch_buf) >= BATCH_SAVE:
                with open(INDEX_FILE, 'w', encoding='utf-8') as f:
                    json.dump(games, f, ensure_ascii=False, indent=2)
                with open(TAGS_OUTPUT, 'w', encoding='utf-8') as f:
                    json.dump(scraped_tags, f, ensure_ascii=False, indent=2)
                state['done'] = done
                state['failed'] = failed
                with open(STATE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(state, f, ensure_ascii=False)
                log(f'  [保存] {cur}/{len(to_scrape)}')
                batch_buf.clear()

    # 最终保存
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(games, f, ensure_ascii=False, indent=2)
    with open(TAGS_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(scraped_tags, f, ensure_ascii=False, indent=2)
    state['done'] = done
    state['failed'] = failed
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)

    total = success + fail
    log(f'\n完成! 成功:{success} 失败:{fail} 总计:{total}')
    log(f'games-index.json 已更新')

    # 验证
    has_card = [(aid, games[aid]['name']) for aid in scraped_tags
                if any('card' in t.lower() or 'deck' in t.lower() for t in scraped_tags[aid])]
    log(f'抓取到的卡牌相关游戏: {len(has_card)} 个')
    if has_card[:3]:
        for aid, name in has_card[:3]:
            log(f'  {aid} {name}: {scraped_tags[aid]}')

if __name__ == '__main__':
    main()
