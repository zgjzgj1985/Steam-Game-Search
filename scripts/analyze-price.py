import json

# 直接从games-index.json分析
with open('D:/Steam全域游戏搜索/public/data/games-index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 分析价格为0的游戏
price_zero_games = []
for app_id, game in data.items():
    if game.get('price') == 0:
        price_zero_games.append({
            'app_id': app_id,
            'name': game.get('name', '')[:60],
            'positive': game.get('positive', 0),
            'negative': game.get('negative', 0),
            'estimated_owners': game.get('estimated_owners', '0'),
        })

print(f"Total price=0 games: {len(price_zero_games):,}")
print()

# 按评价数分组
high_review = [g for g in price_zero_games if g['positive'] >= 100]
low_review = [g for g in price_zero_games if g['positive'] < 100]
medium_review = [g for g in price_zero_games if 10 <= g['positive'] < 100]

print(f"High review (>=100): {len(high_review):,}")
print(f"Medium review (10-99): {len(medium_review):,}")
print(f"Low review (<10): {len(low_review):,}")
print()

# 高评价的免费游戏示例（这些可能是真正的免费游戏）
print("High review examples (likely real free games):")
for g in sorted(high_review, key=lambda x: -x['positive'])[:5]:
    print(f"  [{g['app_id']}] {g['name']} (+{g['positive']}/-{g['negative']})")

# 低评价的免费游戏示例（这些可能有问题）
print("\nLow review examples (may be problematic):")
for g in sorted(low_review, key=lambda x: x['positive'])[:5]:
    print(f"  [{g['app_id']}] {g['name']} (+{g['positive']}/-{g['negative']})")

# Save to file
with open('D:/Steam全域游戏搜索/scripts/free-games-analysis.json', 'w', encoding='utf-8') as f:
    json.dump({
        'total': len(price_zero_games),
        'high_review': len(high_review),
        'medium_review': len(medium_review),
        'low_review': len(low_review),
        'samples': {
            'high': high_review[:10],
            'low': low_review[:10]
        }
    }, f, ensure_ascii=False, indent=2)
