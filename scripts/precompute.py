"""
预计算缓存生成脚本
从SQLite数据库生成优化的JSON缓存
"""
import json
import sqlite3
import time
import re
from pathlib import Path

# ============ 标签配置 ============

TURN_BASED_TAGS = [
    "Turn-Based", "Turn-Based Strategy", "Turn-Based Tactics",
    "Turn-Based Combat", "Turn-Based RPG", "Turn Based",
    "Tactical RPG", "回合制", "回合",
]

POKEMON_LIKE_TAGS = [
    "Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection",
]

BLACKLIST_TAGS = [
    "Board Game", "Grand Strategy", "4X Strategy", "NSFW", "Hentai",
    "Text-Based", "Sexual Content",
]

CORE_TAGS = [
    "Creature Collector", "Monster Catching", "Monster Taming", "Creature Collection",
    "养宠", "养成", "宠物养成", "怪物养成",
]

SECONDARY_TAGS = [
    "JRPG", "Party-Based RPG", "Tactical RPG", "角色扮演", "RPG",
]

MODERN_TAGS = [
    "Deckbuilding", "Card Battler", "Card Game",
    "Pixel Graphics",
    "Exploration", "Collectathon", "Dungeon Crawler",
    "Rogue-lite", "Rogue-like", "Roguelite", "Roguelike", "类肉鸽",
    "开放世界", "Open World",
    "Survival", "Crafting", "Survival Game", "生存", "建造",
    "形态融合", "Time Travel", "时间旅行",
]

DIFFERENTIATION_LABELS = {
    # 牌组构建
    "Deckbuilding": "牌组构建", "Card Battler": "牌组构建", "Card Game": "卡牌游戏",
    # 像素风格
    "Pixel Graphics": "像素风格",
    # 探索冒险
    "Exploration": "探索冒险", "Collectathon": "收集冒险", "Dungeon Crawler": "地牢探索",
    # 肉鸽融合
    "Rogue-lite": "肉鸽融合", "Rogue-like": "肉鸽融合",
    "Roguelite": "肉鸽融合", "Roguelike": "肉鸽融合", "类肉鸽": "肉鸽融合",
    # 开放世界
    "开放世界": "开放世界", "Open World": "开放世界",
    # 生存建造
    "Survival": "生存建造", "Survival Game": "生存建造",
    "Crafting": "合成系统", "生存": "生存建造", "建造": "建造系统",
    # 形态融合
    "形态融合": "形态融合",
    # 银河恶魔城
    "Metroidvania": "银河恶魔城", "银河恶魔城": "银河恶魔城",
    # 时间旅行
    "Time Travel": "时间旅行", "时间旅行": "时间旅行",
}

TAG_CHINESE_NAMES = {
    # 核心标签
    "Creature Collector": "生物收集", "Monster Catching": "怪物捕捉",
    "Monster Tamer": "怪物养成", "Collectathon": "收集冒险",
    "生物收集": "生物收集", "怪物捕捉": "怪物捕捉", "怪物养成": "怪物养成",
    # 次级标签
    "JRPG": "JRPG", "Party-Based RPG": "队伍RPG", "Tactical RPG": "战术RPG",
    "Turn-Based Tactics": "回合制战术", "Turn-Based Strategy": "回合制策略",
    "回合制策略": "回合制策略", "角色扮演": "角色扮演", "RPG": "RPG",
    # 牌组构建
    "Deckbuilding": "牌组构建", "Card Battler": "牌组构建", "Card Game": "卡牌游戏",
    # 像素风格
    "Pixel Graphics": "像素风格",
    # 探索冒险
    "Exploration": "探索冒险", "Dungeon Crawler": "地牢探索",
    # 肉鸽融合
    "Rogue-lite": "肉鸽融合", "Rogue-like": "肉鸽融合",
    "Roguelite": "肉鸽融合", "Roguelike": "肉鸽融合", "类肉鸽": "肉鸽融合",
    # 开放世界
    "开放世界": "开放世界", "Open World": "开放世界",
    # 生存建造
    "Survival": "生存建造", "Survival Game": "生存建造", "Crafting": "合成系统",
    # 形态融合
    "形态融合": "形态融合",
    # 银河恶魔城
    "Metroidvania": "银河恶魔城", "银河恶魔城": "银河恶魔城",
    # 时间旅行
    "Time Travel": "时间旅行", "时间旅行": "时间旅行",
    # 卡牌构建
    "卡牌构建": "牌组构建", "牌组构建": "牌组构建",
}

TEST_VERSION_KEYWORDS = [
    "beta", "alpha", "demo", "trial", "early access", "pre-release", "pre release",
    "prototype", "tech demo", "test build", "testing", "test version",
    " (beta)", " [beta]", " (demo)", " [demo]", " (alpha)", " [alpha]",
    " (test)", " [test]", " (prototype)", " (early access)",
    " - beta", " - demo", " - test",
    " 测试版", " 试玩版", " 体验版", " 抢先体验",
]

POOL_CONFIG = {
    'poolA': {'minRating': 75, 'minReviews': 50},
    'poolB': {'minRating': 75, 'minReviews': 50},
    'poolC': {'minRating': 40, 'maxRating': 74, 'minReviews': 50},
}

# 特色标签定义（基于 LLM 融合玩法分析 v3）
# 来源：B 池游戏融合玩法分析（combinedMechanics.json）
# 设计原则：标签必须是具体的机制、必须排他、必须有案例
LLM_MECHANICS_TAG_OPTIONS = [
    {'key': 'roguelite',     'label': '肉鸽融合',    'tag': '肉鸽融合'},
    {'key': 'deckbuilding',  'label': '牌组构建',    'tag': '牌组构建'},
    {'key': 'morphing',     'label': '形态融合',    'tag': '形态融合'},
    {'key': 'survival',     'label': '生存建造',    'tag': '生存建造'},
    {'key': 'mmo',          'label': 'MMO元素',     'tag': 'MMO元素'},
    {'key': 'autobattle',   'label': '自动战斗',    'tag': '自动战斗'},
    {'key': 'bullet',       'label': '弹幕射击',    'tag': '弹幕射击'},
    {'key': 'timetravel',   'label': '时间旅行',    'tag': '时间旅行'},
    {'key': 'metroidvania', 'label': '银河恶魔城',  'tag': '银河恶魔城'},
    {'key': 'sandbox',      'label': '沙盒建造',    'tag': '沙盒建造'},
]

# 标准标签列表（用于聚类归类）
CANONICAL_LLM_TAGS = [ft['tag'] for ft in LLM_MECHANICS_TAG_OPTIONS]

# ============ 工具函数 ============

def load_combined_mechanics():
    """加载 LLM 融合玩法分析结果（支持 v3 的自由标签）"""
    mechanics_file = Path(r'D:\Steam全域游戏搜索\public\data\combinedMechanics.json')
    if not mechanics_file.exists():
        return {}
    try:
        with open(mechanics_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # 构建 {appid: {mechanics: [...], rawMechanics: [...], summary: '...'}} 的映射
        result = {}
        for appid, game_data in data.get('games', {}).items():
            result[str(appid)] = {
                'mechanics': game_data.get('mechanics', []),      # 标准标签（向后兼容）
                'rawMechanics': game_data.get('rawMechanics', []),  # 自由标签（v3 新增）
                'summary': game_data.get('summary', ''),
            }
        log(f'Loaded LLM mechanics for {len(result)} games')
        return result
    except Exception as e:
        log(f'Warning: Failed to load combinedMechanics.json: {e}')
        return {}


# 模块级缓存
combined_mechanics_cache = None


def get_combined_mechanics():
    global combined_mechanics_cache
    if combined_mechanics_cache is None:
        combined_mechanics_cache = load_combined_mechanics()
    return combined_mechanics_cache


# ============ 聚类映射（v3 新增）============

def load_tag_clusters():
    """加载标签聚类映射表"""
    cluster_file = Path(__file__).parent / 'tag_clusters.json'
    if not cluster_file.exists():
        log('Warning: tag_clusters.json not found, skipping cluster mapping')
        return {}
    try:
        with open(cluster_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        log(f'Loaded tag cluster map: {len(data.get("clusterMap", {}))} mappings')
        return data.get('clusterMap', {})
    except Exception as e:
        log(f'Warning: Failed to load tag_clusters.json: {e}')
        return {}


# 模块级聚类映射缓存
TAG_CLUSTER_MAP = None


def get_tag_cluster_map():
    """获取标签聚类映射表（带缓存）"""
    global TAG_CLUSTER_MAP
    if TAG_CLUSTER_MAP is None:
        TAG_CLUSTER_MAP = load_tag_clusters()
    return TAG_CLUSTER_MAP


def map_raw_mechanics_to_canonical(raw_mechanics, cluster_map, canonical_tags):
    """
    将自由标签归类到标准分类
    - 优先匹配预定义的标准标签
    - 然后通过聚类映射归类
    """
    if not raw_mechanics:
        return []

    canonical_set = set(canonical_tags)
    result = set()

    for tag in raw_mechanics:
        if tag in canonical_set:
            # 直接匹配标准标签
            result.add(tag)
        elif cluster_map and tag in cluster_map:
            # 通过聚类映射归类
            canonical = cluster_map[tag]
            result.add(canonical)

    return list(result)

def normalize_tags(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return list(raw.keys()) if raw else []
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                return list(parsed.keys())
        except:
            pass
    return []

def parse_estimated_owners(raw):
    cleaned = raw.replace(",", "").strip()
    try:
        parts = cleaned.split("-")
        if len(parts) == 2:
            return {
                'value': (int(parts[0].strip()) + int(parts[1].strip())) // 2,
                'min': int(parts[0].strip()),
                'max': int(parts[1].strip())
            }
        return {'value': int(cleaned)}
    except:
        return {'value': 0}

def wilson_score(positive, negative):
    n = positive + negative
    if n == 0:
        return 0
    p = positive / n
    z = 1.64485
    denominator = 1 + (z * z) / n
    center = p + (z * z) / (2 * n)
    spread = z * ((p * (1 - p) + (z * z) / 4) / n) ** 0.5
    return max(0, min(1, (center - spread) / denominator))

def get_review_score_desc(score):
    if score >= 95:
        return "Overwhelmingly Positive"
    if score >= 80:
        return "Very Positive"
    if score >= 70:
        return "Mostly Positive"
    if score >= 40:
        return "Mixed"
    if score >= 20:
        return "Mostly Negative"
    return "Very Negative"

def check_pokemon_like(tags):
    normalized = [t.lower() for t in tags]
    return [tag for tag in POKEMON_LIKE_TAGS if any(tag.lower() in t for t in normalized)]

def is_blacklisted(tags):
    normalized = [t.lower() for t in tags]
    return any(bl.lower() in t for t in normalized for bl in BLACKLIST_TAGS)

def is_turn_based(tags, genres):
    normalized_tags = [t.lower() for t in tags]
    normalized_genres = [g.lower() for g in genres]
    for tb in TURN_BASED_TAGS:
        tb_lower = tb.lower()
        if any(tb_lower in t for t in normalized_tags) or any(tb_lower in g for g in normalized_genres):
            return True
    return False

def detect_test_version_by_name(name):
    if not name:
        return False
    lower_name = name.lower()
    for keyword in TEST_VERSION_KEYWORDS:
        if keyword in lower_name:
            return True
    patterns = [
        r'\s*[\(\[\-]\s*(beta|alpha|demo|test|prototype|early\s*access)\s*[\)\]\-]',
        r'\s*[\(\[\-]\s*[\d.]+\s*(beta|alpha|b)\s*[\)\]\-]',
        r'beta\s*v?\d',
    ]
    for pattern in patterns:
        if re.search(pattern, lower_name):
            return True
    return False

def str_lower(s):
    """安全转小写，兼容整数类型"""
    return str(s).lower()

def is_test_version_by_tag(tags, categories):
    all_items = [str_lower(t) for t in tags] + [str_lower(c) for c in categories]
    return any("early access" in t for t in all_items)

def calculate_tag_weight(tags):
    normalized = [t.lower() for t in tags]
    
    matched_core = [tag for tag in CORE_TAGS if any(tag.lower() in t for t in normalized)]
    core_set = set(tag.lower() for tag in matched_core)
    
    matched_secondary = [tag for tag in SECONDARY_TAGS 
                        if any(tag.lower() in t for t in normalized) and tag.lower() not in core_set]
    
    matched_modern = [tag for tag in MODERN_TAGS if tag.lower() in normalized]
    
    differentiation = [DIFFERENTIATION_LABELS.get(tag, tag) for tag in matched_modern]
    
    return {
        'coreTagCount': len(matched_core),
        'secondaryTagCount': len(matched_secondary),
        'modernTagCount': len(matched_modern),
        'tagWeight': len(matched_core) * 3 + len(matched_secondary) * 2 + len(matched_modern) * 1,
        'matchedCoreTags': [TAG_CHINESE_NAMES.get(t, t) for t in matched_core],
        'matchedSecondaryTags': [TAG_CHINESE_NAMES.get(t, t) for t in matched_secondary],
        'matchedModernTags': [TAG_CHINESE_NAMES.get(t, t) for t in matched_modern],
        'differentiationLabels': list(dict.fromkeys(differentiation)),
    }

def calculate_pool(reviews, is_pokemon_like, tags):
    if not reviews or reviews['totalReviews'] == 0:
        return None
    if is_blacklisted(tags):
        return None
    
    score = reviews['reviewScore']
    total = reviews['totalReviews']
    
    if not is_pokemon_like and score >= 75 and total >= 50:
        return 'A'
    if is_pokemon_like and score >= 75 and total >= 50:
        return 'B'
    if is_pokemon_like and 40 <= score <= 74 and total >= 50:
        return 'C'
    return None

def safe_json_parse(value, default=None):
    """安全解析JSON，支持字符串和列表两种格式"""
    if value is None:
        return default
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except:
            return default
    return default

def transform_game(row, llm_mechanics=None, cluster_map=None):
    owners = parse_estimated_owners(row.get('estimated_owners') or row.get('estimated_owners', '0 - 0') or '0 - 0')
    positive = row.get('positive') or 0
    negative = row.get('negative') or 0
    total_reviews = positive + negative
    review_score = round(positive / total_reviews * 100) if total_reviews > 0 else 0

    tags = normalize_tags(row.get('tags'))
    categories = safe_json_parse(row.get('categories'), [])
    genres = safe_json_parse(row.get('genres'), [])

    pokemon_like_tags = check_pokemon_like(tags)
    is_pokemon_like = len(pokemon_like_tags) > 0
    turn_based = is_turn_based(tags, genres)

    is_test_by_data = row.get('_is_test_version') == 1
    is_test_by_name = detect_test_version_by_name(row.get('name') or '')
    is_test_by_tag = is_test_version_by_tag(tags, categories)
    is_test = is_test_by_data or is_test_by_name or is_test_by_tag

    if is_test_by_data:
        test_type = 'data'
    elif is_test_by_name:
        test_type = 'name'
    elif is_test_by_tag:
        test_type = 'tag'
    else:
        test_type = 'none'

    tag_weight = calculate_tag_weight(tags)

    reviews = None
    if total_reviews > 0:
        reviews = {
            'totalPositive': positive,
            'totalNegative': negative,
            'totalReviews': total_reviews,
            'reviewScore': review_score,
            'reviewScoreDescription': get_review_score_desc(review_score)
        }

    # 处理国内评价数据（国内/海外评价筛选功能）
    cn_reviews_raw = row.get('cn_reviews')
    cn_reviews = None
    if cn_reviews_raw:
        cn_positive = cn_reviews_raw.get('positive', 0) or 0
        cn_negative = cn_reviews_raw.get('negative', 0) or 0
        cn_total = cn_reviews_raw.get('total', 0) or 0
        if cn_total > 0:
            cn_score = round(cn_positive / cn_total * 100)
            cn_reviews = {
                'totalPositive': cn_positive,
                'totalNegative': cn_negative,
                'totalReviews': cn_total,
                'reviewScore': cn_score,
                'reviewScoreDescription': get_review_score_desc(cn_score)
            }

    # 处理海外评价数据
    overseas_reviews_raw = row.get('overseas_reviews')
    overseas_reviews = None
    if overseas_reviews_raw:
        overseas_positive = overseas_reviews_raw.get('positive', 0) or 0
        overseas_negative = overseas_reviews_raw.get('negative', 0) or 0
        overseas_total = overseas_reviews_raw.get('total', 0) or 0
        if overseas_total > 0:
            overseas_score = round(overseas_positive / overseas_total * 100)
            overseas_reviews = {
                'totalPositive': overseas_positive,
                'totalNegative': overseas_negative,
                'totalReviews': overseas_total,
                'reviewScore': overseas_score,
                'reviewScoreDescription': get_review_score_desc(overseas_score)
            }

    # 兼容处理不同格式的字段名（appid可能是int或str）
    appid = row.get('appid')
    if appid is None:
        return None

    # 计算国内/海外威尔逊得分
    cn_wilson = 0
    if cn_reviews_raw:
        cn_pos = cn_reviews_raw.get('positive', 0) or 0
        cn_neg = cn_reviews_raw.get('negative', 0) or 0
        cn_wilson = wilson_score(cn_pos, cn_neg)

    overseas_wilson = 0
    if overseas_reviews_raw:
        overseas_pos = overseas_reviews_raw.get('positive', 0) or 0
        overseas_neg = overseas_reviews_raw.get('negative', 0) or 0
        overseas_wilson = wilson_score(overseas_pos, overseas_neg)

    # LLM 融合玩法分析数据
    appid_str = str(appid)
    llm_data = llm_mechanics.get(appid_str) if llm_mechanics else None
    llm_mechanics_list = llm_data.get('mechanics', []) if llm_data else []
    llm_raw_mechanics = llm_data.get('rawMechanics', []) if llm_data else []
    llm_summary = llm_data.get('summary', '') if llm_data else ''

    # 通过聚类映射将自由标签归类到标准分类（v3 新增）
    llm_canonical = map_raw_mechanics_to_canonical(
        llm_raw_mechanics,
        cluster_map,
        CANONICAL_LLM_TAGS
    )

    return {
        'id': appid_str,
        'steamAppId': appid_str,
        'name': row.get('name') or '',
        'shortDescription': row.get('short_description') or '',
        'developers': safe_json_parse(row.get('developers'), []),
        'publishers': safe_json_parse(row.get('publishers'), []),
        'genres': genres,
        'tags': tags,
        'categories': categories,
        'releaseDate': row.get('release_date') or None,
        'isFree': (row.get('price') or 0) == 0,
        'price': row.get('price') or 0,
        'estimatedOwners': owners['value'],
        'estimatedOwnersMin': owners.get('min'),
        'estimatedOwnersMax': owners.get('max'),
        'peakCCU': row.get('peak_ccu') or 0,
        'steamReviews': reviews,
        # 区域评价数据（国内/海外评价筛选功能）
        'cnReviews': cn_reviews,
        'overseasReviews': overseas_reviews,
        # 区域威尔逊得分
        'cnWilsonScore': cn_wilson,
        'overseasWilsonScore': overseas_wilson,
        'headerImage': row.get('header_image') or None,
        'screenshots': safe_json_parse(row.get('screenshots'), []),
        'steamUrl': f"https://store.steampowered.com/app/{appid}",
        'isPokemonLike': is_pokemon_like,
        'pokemonLikeTags': pokemon_like_tags,
        'wilsonScore': wilson_score(positive, negative),
        'isTurnBased': turn_based,
        'isTestVersion': is_test,
        'testVersionType': test_type,
        'coreTagCount': tag_weight['coreTagCount'],
        'secondaryTagCount': tag_weight['secondaryTagCount'],
        'modernTagCount': tag_weight['modernTagCount'],
        'tagWeight': tag_weight['tagWeight'],
        'matchedCoreTags': tag_weight['matchedCoreTags'],
        'matchedSecondaryTags': tag_weight['matchedSecondaryTags'],
        'matchedModernTags': tag_weight['matchedModernTags'],
        'uniqueFeatureTags': tag_weight['matchedModernTags'],
        'differentiationLabels': tag_weight['differentiationLabels'],
        # LLM 融合玩法分析（来自 combinedMechanics.json）
        # llmMechanics: 标准标签（向后兼容，优先使用聚类归类结果）
        'llmMechanics': llm_canonical if llm_canonical else llm_mechanics_list,
        # llmRawMechanics: 自由标签（v3 新增，用于展示和筛选）
        'llmRawMechanics': llm_raw_mechanics,
        'llmMechanicsSummary': llm_summary,
    }


def calculate_feature_tag_options(games):
    """计算特色标签选项及其统计数据（基于 LLM 融合玩法分析）"""
    feature_tag_options = []

    for ft in LLM_MECHANICS_TAG_OPTIONS:
        raw_tag = ft['tag']  # 中文标签，如 '探索冒险'

        total_count = 0
        pool_a_count = 0
        pool_b_count = 0
        pool_c_count = 0
        total_wilson = 0

        for game in games:
            if not game.get('isTurnBased') or game.get('isTestVersion'):
                continue

            # 检查 LLM 分析的融合玩法中是否包含该标签
            llm_mechanics = game.get('llmMechanics') or []
            has_tag = raw_tag in llm_mechanics

            if not has_tag:
                continue

            total_count += 1

            # 计算池子归属
            reviews = game.get('steamReviews')
            if reviews and reviews.get('totalReviews', 0) > 0:
                score = reviews.get('reviewScore', 0)
                total = reviews.get('totalReviews', 0)
                is_pokemon = game.get('isPokemonLike', False)
                tags = game.get('tags', [])

                if not is_blacklisted(tags):
                    if not is_pokemon and score >= 75 and total >= 50:
                        pool_a_count += 1
                    elif is_pokemon and score >= 75 and total >= 50:
                        pool_b_count += 1
                    elif is_pokemon and 40 <= score <= 74 and total >= 50:
                        pool_c_count += 1

            ws = game.get('wilsonScore', 0)
            if ws > 0:
                total_wilson += ws

        avg_wilson = total_wilson / total_count if total_count > 0 else 0

        feature_tag_options.append({
            'key': ft['key'],
            'label': ft['label'],
            'tag': raw_tag,
            'count': total_count,
            'gameCount': total_count,
            'coverage': 0,
            'avgWilson': round(avg_wilson, 4),
            'poolDistribution': {
                'A': pool_a_count,
                'B': pool_b_count,
                'C': pool_c_count,
            },
        })

    return feature_tag_options

# ============ 主程序 ============

def log(msg):
    print(msg, flush=True)

def main():
    DB_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games.db')
    INDEX_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-index.json')
    CACHE_FILE = Path(r'D:\Steam全域游戏搜索\public\data\games-cache.json')
    
    log('=' * 60)
    log('Precompute Cache Generator')
    log('=' * 60)
    
    t0 = time.time()
    
    # 用于存储所有游戏数据（去重前）
    all_games_map = {}  # appid -> row_dict
    
    # ==================== 1. 从SQLite读取主体数据 ====================
    if DB_FILE.exists():
        log('Loading from SQLite...')
        conn = sqlite3.connect(str(DB_FILE))
        conn.row_factory = sqlite3.Row
        
        cursor = conn.execute('''
            SELECT g.appid, g.name, g.release_date, g.header_image, g.short_description,
                   g.estimated_owners, g.price, g.positive, g.negative, g.peak_ccu,
                   g.metacritic_score, g._is_test_version,
                   j.developers, j.publishers, j.genres, j.categories, j.screenshots, j.tags
            FROM games g
            LEFT JOIN games_json j ON g.appid = j.appid
        ''')
        
        rows = cursor.fetchall()
        sqlite_count = len(rows)
        for row in rows:
            row_dict = {k: row[k] for k in row.keys()}
            all_games_map[str(row['appid'])] = row_dict
        
        conn.close()
        log(f'  Loaded {sqlite_count:,} games from SQLite')
    else:
        log('  SQLite not found, will only use JSON file')
        sqlite_count = 0
    
    # ==================== 2. 从JSON合并增量数据 ====================
    if INDEX_FILE.exists():
        log('Loading incremental data from JSON...')
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            json_db = json.load(f)
        
        new_count = 0
        updated_count = 0
        for appid, game in json_db.items():
            if appid in all_games_map:
                # 已存在，检查是否需要更新（增量更新的数据可能更新了评价）
                existing = all_games_map[appid]
                existing_pos = existing.get('positive') or 0
                existing_neg = existing.get('negative') or 0
                new_pos = game.get('positive') or 0
                new_neg = game.get('negative') or 0
                # 如果增量数据有评价而SQLite没有，或者增量数据的评价更新（数值更大）
                if (existing_pos == 0 and existing_neg == 0 and (new_pos > 0 or new_neg > 0)) or \
                   (new_pos + new_neg > existing_pos + existing_neg):
                    # 更新评价数据
                    existing['positive'] = new_pos
                    existing['negative'] = new_neg
                    updated_count += 1
            else:
                # 新增游戏
                row_dict = {
                    'appid': int(appid),
                    'name': game.get('name', ''),
                    'release_date': game.get('release_date', ''),
                    'header_image': game.get('header_image', ''),
                    'short_description': game.get('short_description', ''),
                    'estimated_owners': game.get('estimated_owners', ''),
                    'price': game.get('price', 0) or 0,
                    'positive': game.get('positive') or 0,
                    'negative': game.get('negative') or 0,
                    'peak_ccu': game.get('peak_ccu') or 0,
                    'metacritic_score': game.get('metacritic_score') or 0,
                    '_is_test_version': 1 if game.get('_is_test_version') else 0,
                    'developers': json.dumps(game.get('developers', []), ensure_ascii=False),
                    'publishers': json.dumps(game.get('publishers', []), ensure_ascii=False),
                    'genres': json.dumps(game.get('genres', []), ensure_ascii=False),
                    'categories': json.dumps(game.get('categories', []), ensure_ascii=False),
                    'screenshots': json.dumps(game.get('screenshots', []), ensure_ascii=False),
                    'tags': json.dumps(game.get('tags', {}), ensure_ascii=False),
                }
                all_games_map[appid] = row_dict
                new_count += 1
        
        json_count = len(json_db)
        log(f'  Loaded {json_count:,} games from JSON')
        if new_count > 0 or updated_count > 0:
            log(f'  Incremental: {new_count} new, {updated_count} updated')
    
    # 加载 LLM 融合玩法分析数据
    t_llm = time.time()
    log('Loading LLM mechanics...')
    llm_mechanics = get_combined_mechanics()
    log(f'LLM mechanics loaded in {time.time()-t_llm:.1f}s')

    # 加载标签聚类映射表（v3 新增）
    t_cluster = time.time()
    log('Loading tag cluster map...')
    cluster_map = get_tag_cluster_map()
    log(f'Tag cluster map loaded in {time.time()-t_cluster:.1f}s')

    # ==================== 3. 转换所有游戏数据 ====================
    log(f'Transforming {len(all_games_map):,} games...')
    t1 = time.time()
    games = []
    for appid, row_dict in all_games_map.items():
        game = transform_game(row_dict, llm_mechanics, cluster_map)
        if game:
            games.append(game)
    
    log(f'Transformed {len(games):,} games in {time.time()-t1:.1f}s')
    
    # 去重：优先保留正式版（而非玩家数更多的测试版）
    t2 = time.time()
    log('Deduplicating...')
    dedup_map = {}
    test_replaced = 0  # 被正式版替换掉的测试版数量
    for game in games:
        key = game['name'].lower().strip()
        existing = dedup_map.get(key)
        if not existing:
            dedup_map[key] = game
        else:
            existing_is_test = existing.get('isTestVersion', False)
            game_is_test = game.get('isTestVersion', False)

            if existing_is_test != game_is_test:
                # 一方为测试版，另一方为正式版 → 保留正式版
                if game_is_test:
                    # 当前是测试版，已有是正式版 → 跳过
                    test_replaced += 1
                else:
                    # 当前是正式版，已有是测试版 → 替换
                    dedup_map[key] = game
                    test_replaced += 1
            else:
                # 同为正式版或同为测试版 → 按玩家数和评价数排序
                game_owners = game.get('estimatedOwners') or 0
                existing_owners = existing.get('estimatedOwners') or 0
                game_reviews = (game.get('steamReviews') or {}).get('totalReviews') or 0
                existing_reviews = (existing.get('steamReviews') or {}).get('totalReviews') or 0
                if (game_owners > existing_owners or
                    (game_owners == existing_owners and game_reviews > existing_reviews)):
                    dedup_map[key] = game

    deduped = list(dedup_map.values())
    log(f'Deduplication complete: {len(deduped):,} kept ({len(games) - len(deduped):,} removed) in {time.time()-t2:.1f}s')
    if test_replaced > 0:
        log(f'  (其中 {test_replaced:,} 个测试版被正式版替换)')
    
    # 池子统计
    t3 = time.time()
    log('Calculating pools...')
    pools = {'A': 0, 'B': 0, 'C': 0}
    turn_based_count = 0
    test_version_count = 0

    for game in deduped:
        if game['isTurnBased']:
            turn_based_count += 1
        if game['isTestVersion']:
            test_version_count += 1

        pool = calculate_pool(game['steamReviews'], game['isPokemonLike'], game['tags'])
        if pool:
            pools[pool] += 1

    log(f'Pools: A={pools["A"]:,} B={pools["B"]:,} C={pools["C"]:,}')
    log(f'Turn-based: {turn_based_count:,} | Test versions: {test_version_count:,}')
    log(f'Stats calculated in {time.time()-t3:.1f}s')

    # 计算特色标签选项（基于 LLM 融合玩法分析）
    t3b = time.time()
    log('Calculating feature tag options (from LLM mechanics)...')
    feature_tag_options = calculate_feature_tag_options(deduped)
    log(f'Feature tag options: {len(feature_tag_options)} tags')
    for ft in feature_tag_options:
        log(f'  - {ft["label"]} ({ft["tag"]}): {ft["gameCount"]} games, avgWilson={ft["avgWilson"]:.4f}')
    log(f'Feature tag options calculated in {time.time()-t3b:.1f}s')

    # 生成缓存
    t4 = time.time()
    log('Generating cache file...')
    
    cache = {
        'meta': {
            'version': 2,
            'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'source': 'sqlite' if DB_FILE.exists() else 'json',
            'sourceFile': str(DB_FILE) if DB_FILE.exists() else str(INDEX_FILE),
            'totalRaw': len(games),
            'totalAfterDedup': len(deduped),
            'totalTurnBased': turn_based_count,
            'totalTestVersion': test_version_count,
            'poolA': pools['A'],
            'poolB': pools['B'],
            'poolC': pools['C'],
        },
        'games': deduped,
        'featureTagOptions': feature_tag_options,
    }
    
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False)
    
    size_mb = CACHE_FILE.stat().st_size / 1024 / 1024
    log(f'Cache saved: {size_mb:.2f} MB in {time.time()-t4:.1f}s')
    
    if DB_FILE.exists():
        conn.close()
    
    total_ms = (time.time() - t0) * 1000
    log('')
    log('=' * 60)
    log(f'DONE! Total time: {total_ms/1000:.1f}s')
    log('=' * 60)

if __name__ == '__main__':
    main()
