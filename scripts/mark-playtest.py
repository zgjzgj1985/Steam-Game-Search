import json
import shutil
from datetime import datetime

# 数据文件路径
INDEX_FILE = 'D:/Steam全域游戏搜索/public/data/games-index.json'
BACKUP_DIR = 'D:/SteamDataBackup'

# 创建带时间戳的备份
timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup_file = f'{BACKUP_DIR}/games-index_before_playtest_mark_{timestamp}.json'

# 复制备份
print(f'备份数据到: {backup_file}')
shutil.copy2(INDEX_FILE, backup_file)

# 读取数据
print('读取数据...')
with open(INDEX_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

# 需要标记为测试版的app_id列表
with open('D:/Steam全域游戏搜索/scripts/playtest-games.json', 'r', encoding='utf-8') as f:
    playtest_games = json.load(f)

playtest_ids = {g['app_id'] for g in playtest_games}
print(f'待标记测试版游戏数量: {len(playtest_ids):,}')

# 添加标记
marked_count = 0
for app_id in data:
    if app_id in playtest_ids:
        data[app_id]['is_playtest'] = True
        marked_count += 1

print(f'已标记: {marked_count:,}')

# 保存
with open(INDEX_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

print(f'已完成！数据已更新。')
print(f'备份位置: {backup_file}')
