import json
import re

# 检查games-index.json中的Playtest情况
with open('D:/Steam全域游戏搜索/public/data/games-index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 数据是以app_id为key的字典
total = len(data)

# 统计Playtest相关 - 使用多种匹配方式
playtest_patterns = [
    (r'playtest', 'i'),           # playtest (不区分大小写)
    (r'beta', 'i'),               # beta测试
    (r'测试版', ''),              # 中文测试版
    (r'alpha', 'i'),              # alpha测试
    (r'demo', 'i'),              # demo演示版
]

playtest_games = []
playtest_reasons = {}

for app_id, game in data.items():
    name = game.get('name', '')
    name_lower = name.lower()

    matched_reason = None
    for pattern, flag in playtest_patterns:
        if re.search(pattern, name, re.IGNORECASE if flag == 'i' else 0):
            matched_reason = pattern
            break

    if matched_reason:
        playtest_games.append({
            'app_id': app_id,
            'name': name[:80],
            'reason': matched_reason,
            'type': game.get('type', 'unknown')
        })

print(f'总游戏数: {total:,}')
print(f'检测到测试版游戏: {len(playtest_games):,}')
print(f'占比: {len(playtest_games)/total*100:.2f}%')
print()

# 按类型统计
type_stats = {}
for g in playtest_games:
    t = g['type']
    type_stats[t] = type_stats.get(t, 0) + 1
print('按type统计:')
for t, c in sorted(type_stats.items(), key=lambda x: -x[1]):
    print(f'  {t}: {c:,}')

print()
print('示例 (前10个):')
for g in playtest_games[:10]:
    print(f"  [{g['app_id']}] {g['name']} - {g['reason']}")

# 保存完整列表供后续处理
with open('D:/Steam全域游戏搜索/scripts/playtest-games.json', 'w', encoding='utf-8') as f:
    json.dump(playtest_games, f, ensure_ascii=False, indent=2)
print()
print(f'完整列表已保存到: scripts/playtest-games.json')
