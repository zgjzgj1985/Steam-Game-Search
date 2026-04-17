# -*- coding: utf-8 -*-
"""
配置文件 - 统一定义所有脚本使用的路径和常量
"""
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(r'D:\Steam全域游戏搜索')

# 数据文件目录
DATA_DIR = PROJECT_ROOT / 'public' / 'data'

# 主数据文件
INDEX_FILE = DATA_DIR / 'games-index.json'
DB_FILE = DATA_DIR / 'games.db'

# 备份文件
BACKUP_FILE = DATA_DIR / 'games-index.json.backup'
TEMP_FILE = DATA_DIR / 'games-index.json.temp'
INCR_BACKUP_FILE = DATA_DIR / 'games-index.json.incr_backup'
INCR_TEMP_FILE = DATA_DIR / 'games-index.json.incr_temp'

# 状态文件
STATE_FILE = DATA_DIR / 'games-index.json.last_run'

# Steam API 配置
STEAM_API_BASE = 'https://store.steampowered.com'
STEAM_API = STEAM_API_BASE + '/api/appdetails?appids={appid}&cc=cn&l=schinese'
REVIEWS_API = 'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'
STEAM_STORE_URL = 'https://store.steampowered.com/search/?term={term}&page={page}'

# 请求配置
REQUEST_DELAY = 0.5  # 请求间隔(秒)
REQUEST_TIMEOUT = 15  # 请求超时(秒)
DEFAULT_RETRIES = 3  # 默认重试次数

# 批量处理配置
BATCH_SIZE = 500  # SQLite 批量插入大小
SAVE_EVERY = 100   # 检查点保存间隔

# 增量更新配置
MAX_NEW_GAMES = 3000   # 每次运行最多处理新游戏数
MAX_UPDATE_GAMES = 500  # 每次运行最多更新游戏数
MAX_SEARCH_PAGES = 100  # Steam 搜索页面最大页数

# 线程池配置
DEFAULT_WORKERS = 4  # 默认并发数
