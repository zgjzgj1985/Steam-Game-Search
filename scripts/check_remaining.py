import json
from pathlib import Path
import re

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
with open(INDEX_FILE, 'r', encoding='utf-8') as f:
    db = json.load(f)

no_genre_no_tag = []
for appid, g in db.items():
    reviews = (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0)
    if reviews > 0:
        continue
    
    has_genre = len(g.get('genres', []) or []) > 0
    tags = g.get('tags', [])
    has_tag = isinstance(tags, (list, dict)) and len(tags) > 0
    
    if not has_genre and not has_tag:
        m = re.search(r'(\d{4})', str(g.get('release_date', '')))
        year = int(m.group(1)) if m else 0
        name = g.get('name', 'Unknown')
        no_genre_no_tag.append({
            'appid': appid,
            'name': name[:30],
            'year': year
        })

print(f'无类型无标签零评价游戏: {len(no_genre_no_tag):,}')
print()
print('年份分布:')
years = {}
for g in no_genre_no_tag:
    y = g['year']
    if y not in years:
        years[y] = 0
    years[y] += 1
for y in sorted(years.keys(), reverse=True)[:6]:
    print(f'  {y}: {years[y]:,}')

print()
print('示例游戏:')
for g in sorted(no_genre_no_tag, key=lambda x: x['year'], reverse=True)[:5]:
    print(f'  {g["year"]}: {g["appid"]} - {g["name"]}')
