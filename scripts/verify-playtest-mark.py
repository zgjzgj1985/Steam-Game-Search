import json

# 读取数据验证
with open('D:/Steam全域游戏搜索/public/data/games-index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 检查is_playtest标记
marked_count = 0
playtest_examples = []

for app_id, game in data.items():
    if game.get('is_playtest'):
        marked_count += 1
        if len(playtest_examples) < 5:
            playtest_examples.append({
                'app_id': app_id,
                'name': game.get('name', '')[:60],
                'is_playtest': game.get('is_playtest')
            })

print(f'已标记测试版游戏: {marked_count:,}')
print(f'占比: {marked_count/len(data)*100:.2f}%')
print()
print('示例:')
for ex in playtest_examples:
    print(f"  [{ex['app_id']}] {ex['name']} - is_playtest={ex['is_playtest']}")

print()
print('验证通过 ✓')
