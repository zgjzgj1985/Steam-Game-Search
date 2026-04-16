# -*- coding: utf-8 -*-
"""
Steam 数据采集工具包
"""
import sys
from pathlib import Path

# 将 scripts 目录添加到 Python path
_scripts_dir = Path(__file__).parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from .config import *
from .logging_utils import log, warn, error, success, info
from .data_utils import (
    load_games_index,
    safe_save_json,
    normalize_genres,
    normalize_categories,
    parse_release_date,
    normalize_tags,
    prepare_game_record,
    prepare_json_record,
    GENRE_ID_MAP,
    CATEGORY_ID_MAP,
)
from .db_utils import (
    get_db_connection,
    create_tables,
    migrate_add_columns,
    get_stats,
    get_existing_appids,
    batch_sync_games,
    update_game,
    export_to_json,
)
from .steam_api import (
    fetch_reviews,
    fetch_game_data,
    scrape_tags_from_store,
    get_new_releases_from_search,
)

__all__ = [
    # config
    'PROJECT_ROOT', 'DATA_DIR', 'INDEX_FILE', 'DB_FILE',
    'BACKUP_FILE', 'TEMP_FILE', 'STATE_FILE',
    'STEAM_API', 'REVIEWS_API', 'REQUEST_DELAY', 'REQUEST_TIMEOUT',
    'BATCH_SIZE', 'SAVE_EVERY', 'MAX_NEW_GAMES', 'MAX_UPDATE_GAMES',
    # logging
    'log', 'warn', 'error', 'success', 'info',
    # data_utils
    'load_games_index', 'safe_save_json',
    'normalize_genres', 'normalize_categories', 'parse_release_date',
    'normalize_tags', 'prepare_game_record', 'prepare_json_record',
    'GENRE_ID_MAP', 'CATEGORY_ID_MAP',
    # db_utils
    'get_db_connection', 'create_tables', 'migrate_add_columns',
    'get_stats', 'get_existing_appids', 'batch_sync_games',
    'update_game', 'export_to_json',
    # steam_api
    'fetch_reviews', 'fetch_game_data',
    'scrape_tags_from_store', 'get_new_releases_from_search',
]
