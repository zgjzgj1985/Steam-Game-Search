import json
from pathlib import Path

index_file = Path('d:/Steam全域游戏搜索/public/data/games-index.json')

with open(index_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

p0_fetched = sum(1 for g in data.values() if g.get('_p0_fetched'))
has_reviews = sum(1 for g in data.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
got_reviews_count = sum(1 for g in data.values() if g.get('_p0_fetched') and (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)

total_needed = 20461

print(f'P0已抓取: {p0_fetched:,} / {total_needed:,} ({p0_fetched/total_needed*100:.1f}%)')
print(f'其中有评价: {got_reviews_count:,}')
print(f'其中仍零评价: {p0_fetched - got_reviews_count:,}')
print(f'有评价总计: {has_reviews:,}')
print(f'剩余: {total_needed - p0_fetched:,}')
