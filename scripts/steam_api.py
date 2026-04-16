# -*- coding: utf-8 -*-
"""
Steam API 工具 - Steam API 请求封装
"""
import time
import random
from typing import Optional, Tuple, Dict, List
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

import requests

from config import STEAM_API, REVIEWS_API, REQUEST_DELAY, REQUEST_TIMEOUT, DEFAULT_RETRIES
from logging_utils import log


# 请求头模板
DEFAULT_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}


def fetch_reviews(
    appid: int,
    retries: int = DEFAULT_RETRIES,
    handle_rate_limit: bool = True
) -> Tuple[Optional[int], Optional[int]]:
    """
    获取游戏评价数据

    Args:
        appid: 游戏 appid
        retries: 重试次数
        handle_rate_limit: 是否处理 429 限流

    Returns:
        Tuple[positive, negative]: 好评数和差评数，失败返回 (None, None)
    """
    url = REVIEWS_API.format(appid=appid)

    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)

            # 429 限流处理
            if r.status_code == 429 and handle_rate_limit:
                retry_after = int(r.headers.get('Retry-After', 30))
                log(f'   [限流] appid={appid} 评价获取触发限流，等待 {retry_after} 秒...')
                time.sleep(retry_after)
                continue

            if r.status_code == 200:
                d = r.json()
                if d.get('success') == 1:
                    sq = d.get('query_summary', {})
                    return sq.get('total_positive', 0), sq.get('total_negative', 0)

            # 其他错误，使用指数退避
            if attempt < retries - 1:
                wait_time = 2 ** attempt + random.uniform(0, 1)
                time.sleep(wait_time)

        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                time.sleep(wait_time)
        except requests.exceptions.RequestException as e:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                time.sleep(wait_time)
            else:
                log(f'   [网络错误] appid={appid}: {e}')

    return None, None


def fetch_game_data(
    appid: int,
    retries: int = DEFAULT_RETRIES,
    handle_rate_limit: bool = True
) -> Optional[Dict]:
    """
    获取游戏基础数据

    Args:
        appid: 游戏 appid
        retries: 重试次数
        handle_rate_limit: 是否处理 429 限流

    Returns:
        Dict: 游戏数据，失败返回 None
    """
    url = STEAM_API.format(appid=appid)

    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=REQUEST_TIMEOUT, headers=DEFAULT_HEADERS)

            # 429 限流处理
            if r.status_code == 429 and handle_rate_limit:
                retry_after = int(r.headers.get('Retry-After', 30))
                log(f'   [限流] appid={appid} 触发限流，等待 {retry_after} 秒...')
                time.sleep(retry_after)
                continue

            if r.status_code == 200:
                d = r.json()
                if str(appid) in d and d[str(appid)]['success']:
                    return d[str(appid)]['data']

            # 其他错误，使用指数退避
            if attempt < retries - 1:
                wait_time = 2 ** attempt + random.uniform(0, 1)
                time.sleep(wait_time)

        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                time.sleep(wait_time)
        except requests.exceptions.RequestException as e:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                time.sleep(wait_time)
            else:
                log(f'   [网络错误] appid={appid}: {e}')

    return None


def scrape_tags_from_store(appid: int) -> Dict[str, int]:
    """
    从 Steam 商店页面抓取游戏标签

    Args:
        appid: 游戏 appid

    Returns:
        Dict[str, int]: 标签字典 {tag_name: weight}
    """
    url = f'https://store.steampowered.com/app/{appid}'

    try:
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=REQUEST_TIMEOUT) as response:
            html = response.read().decode('utf-8')

        # 提取标签
        tags = {}
        import re
        tag_pattern = r'"label":"([^"]+)","count":(\d+)'
        for match in re.finditer(tag_pattern, html):
            tag_name = match.group(1)
            count = int(match.group(2))
            tags[tag_name] = count

        return tags

    except (URLError, HTTPError, Exception) as e:
        return {}


def get_new_releases_from_search(max_pages: int = 20) -> List[int]:
    """
    从 Steam 搜索页面获取新游戏 appid 列表

    Args:
        max_pages: 最大页数

    Returns:
        List[int]: appid 列表
    """
    import re
    from config import STEAM_STORE_URL

    appids = []
    seen = set()

    for page in range(max_pages):
        try:
            url = STEAM_STORE_URL.format(term='a', page=page)
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=REQUEST_TIMEOUT) as response:
                html = response.read().decode('utf-8')

            # 提取 appid
            pattern = r'/app/(\d+)/'
            found = set(re.findall(pattern, html))

            # 去重
            new_found = found - seen
            seen.update(new_found)
            appids.extend(int(aid) for aid in new_found)

            if not found:
                break

            time.sleep(REQUEST_DELAY)

        except Exception as e:
            log(f'   [错误] 获取新游戏失败 page={page}: {e}')
            break

    return appids
