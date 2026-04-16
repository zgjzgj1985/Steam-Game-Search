import json
from pathlib import Path
import re
from collections import defaultdict

INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
with open(INDEX_FILE, 'r', encoding='utf-8') as f:
    db = json.load(f)

total = len(db)
has_reviews = sum(1 for g in db.values() if (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) > 0)
zero_reviews = total - has_reviews

total_reviews = sum((g.get('positive', 0) or 0) + (g.get('negative', 0) or 0) for g in db.values())
total_positive = sum(g.get('positive', 0) or 0 for g in db.values())
total_negative = sum(g.get('negative', 0) or 0 for g in db.values())
avg_reviews = total_reviews / has_reviews if has_reviews > 0 else 0

year_stats = defaultdict(lambda: {'count': 0, 'has_reviews': 0, 'total_reviews': 0, 'positive': 0, 'negative': 0})
for appid, g in db.items():
    m = re.search(r'(\d{4})', str(g.get('release_date', '')))
    year = int(m.group(1)) if m else 0
    pos = g.get('positive', 0) or 0
    neg = g.get('negative', 0) or 0
    reviews = pos + neg
    year_stats[year]['count'] += 1
    year_stats[year]['positive'] += pos
    year_stats[year]['negative'] += neg
    if reviews > 0:
        year_stats[year]['has_reviews'] += 1
        year_stats[year]['total_reviews'] += reviews

genre_stats = defaultdict(lambda: {'count': 0, 'has_reviews': 0, 'total_reviews': 0})
for appid, g in db.items():
    genres = g.get('genres', []) or []
    pos = g.get('positive', 0) or 0
    neg = g.get('negative', 0) or 0
    reviews = pos + neg
    for genre in genres:
        genre_stats[genre]['count'] += 1
        if reviews > 0:
            genre_stats[genre]['has_reviews'] += 1
            genre_stats[genre]['total_reviews'] += reviews

# Zero review breakdown
zero_breakdown = defaultdict(int)
for appid, g in db.items():
    reviews = (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0)
    if reviews > 0:
        continue
    m = re.search(r'(\d{4})', str(g.get('release_date', '')))
    year = int(m.group(1)) if m else 0
    zero_breakdown[year] += 1

print('=' * 70)
print('Steam游戏数据集统计报告')
print('=' * 70)
print()
print('【基础数据】')
print(f'  总游戏数: {total:,}')
print(f'  有评价游戏: {has_reviews:,} ({has_reviews/total*100:.1f}%)')
print(f'  零评价游戏: {zero_reviews:,} ({zero_reviews/total*100:.1f}%)')
print()
print('【评价统计】')
print(f'  总评价数: {total_reviews:,}')
print(f'  好评数: {total_positive:,}')
print(f'  差评数: {total_negative:,}')
if total_reviews > 0:
    print(f'  好评率: {total_positive/total_reviews*100:.1f}%')
print(f'  有评价游戏平均评价数: {avg_reviews:.1f}')
print()

print('【按发布年份分布】')
header = f'  {"年份":<8}{"游戏数":<12}{"有评价":<12}{"覆盖率":<10}{"总评价数":<15}{"好评率":<10}'
print(header)
print('  ' + '-' * 67)
for year in sorted(year_stats.keys(), reverse=True)[:12]:
    s = year_stats[year]
    coverage = s['has_reviews'] / s['count'] * 100 if s['count'] > 0 else 0
    pos_rate = s['positive'] / s['total_reviews'] * 100 if s['total_reviews'] > 0 else 0
    print(f'  {year:<8}{s["count"]:<12,}{s["has_reviews"]:<12,}{coverage:>6.1f}%    {s["total_reviews"]:>12,}   {pos_rate:>6.1f}%')

print()
print('【TOP 10 类型分布】')
genre_list = sorted(genre_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:10]
header = f'  {"类型":<25}{"游戏数":<12}{"有评价":<12}{"覆盖率":<10}'
print(header)
print('  ' + '-' * 59)
for genre, s in genre_list:
    coverage = s['has_reviews'] / s['count'] * 100 if s['count'] > 0 else 0
    print(f'  {genre:<25}{s["count"]:<12,}{s["has_reviews"]:<12,}{coverage:>6.1f}%')

print()
print('【零评价游戏年份分布】')
print('  (这些游戏抓取后仍无评价)')
for year in sorted(zero_breakdown.keys(), reverse=True)[:8]:
    print(f'  {year}: {zero_breakdown[year]:,}')

print()
print('【价格类型分布】')
free_count = sum(1 for g in db.values() if g.get('price') == 0 or g.get('is_free'))
paid_count = total - free_count
print(f'  免费游戏: {free_count:,} ({free_count/total*100:.1f}%)')
print(f'  付费游戏: {paid_count:,} ({paid_count/total*100:.1f}%)')

print()
print('【评分分布】(只统计有评价的游戏)')
rating_buckets = {'0-10': 0, '10-50': 0, '50-100': 0, '100-500': 0, '500-1000': 0, '1000+': 0}
for game in db.values():
    reviews = (g.get('positive', 0) or 0) + (g.get('negative', 0) or 0)
    if reviews == 0:
        continue
    if reviews <= 10:
        rating_buckets['0-10'] += 1
    elif reviews <= 50:
        rating_buckets['10-50'] += 1
    elif reviews <= 100:
        rating_buckets['50-100'] += 1
    elif reviews <= 500:
        rating_buckets['100-500'] += 1
    elif reviews <= 1000:
        rating_buckets['500-1000'] += 1
    else:
        rating_buckets['1000+'] += 1

for bucket, count in rating_buckets.items():
    pct = count / has_reviews * 100
    bar = '█' * int(pct / 2)
    print(f'  {bucket:>8}: {count:>6,} ({pct:>5.1f}%) {bar}')

print()
print('=' * 70)
