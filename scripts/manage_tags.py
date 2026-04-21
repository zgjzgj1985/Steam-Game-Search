# -*- coding: utf-8 -*-
"""
标签管理脚本
============

核心功能：合并同义标签，丢弃无区分度标签。

使用流程：
1. python scripts/manage_tags.py --build          # 从 combinedMechanics.json 生成合并映射
2. python scripts/manage_tags.py --merge "A" "B"  # 手动合并同义标签（A为保留名，B为废弃名）
3. python scripts/manage_tags.py --status        # 查看当前状态
4. python scripts/manage_tags.py --add TAG        # 将标签加入白名单（保留，不丢弃）
"""
import sys
import os
import json
import time
import re
from collections import Counter, defaultdict
from pathlib import Path

# 加载 .env
_env_file = Path(__file__).parent.parent / '.env'
if _env_file.exists():
    for line in _env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ[key] = value

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ============ 配置 ============

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'public' / 'data'
COMBINED_MECHANICS_FILE = DATA_DIR / 'combinedMechanics.json'
CACHE_FILE = SCRIPT_DIR / 'tag_merge_cache.json'
MERGE_MAP_FILE = SCRIPT_DIR / 'tag_merge_map.json'

# 标准核心标签（直接保留，不合并）
CORE_TAGS = {
    '肉鸽融合', '牌组构建', '形态融合', '生存建造', 'MMO元素',
    '自动战斗', '弹幕射击', '时间旅行', '银河恶魔城', '沙盒建造',
}

# 同义词合并映射表
# key = 保留的标签名，value = 被合并的同义标签列表
SYNONYM_MAP = {
    # 推理解谜类
    '推理探案': ['案件推理'],

    # 叙事驱动类
    '阵营抉择': ['分支叙事', '派系抉择', '多分支剧情', 'CRPG式叙事'],
    '剧情驱动': ['StoryRich', 'Story Rich', 'JRPG叙事'],
    '视觉小说': ['视觉小说叙事'],
    '太空歌剧': ['网状叙事'],
    '心灵潜入': ['非暴力交涉'],
    '高自由度CRPG': [],

    # 战斗策略类
    '刷宝掉落': ['刷宝驱动'],
    '弱点追击': ['猜拳克制'],
    '元素反应': ['元素循环克制'],
    '部位破坏': ['基因拼图'],
    '多人竞技': ['双人协作'],
    '团队管理': ['队伍羁绊', '队伍构建'],
    '即时战术': ['即时队伍战斗', '小队RPG'],
    '领袖+召唤单位': ['仆从军团'],
    '背包构筑': [],

    # 养成方式类
    '放置养成': ['放置挂机', '点击放置'],
    '好感度养成': ['社交羁绊'],
    '勾玉养成': [],
    '天赋树': ['深度构筑', '深度BD构筑', '策略构筑', '数值博弈', '数值攻占'],
    '技能继承': ['精髓技能继承'],
    '职业Build自由': ['自由角色构筑', '角色定制'],
    '双线养成': [],
    '体型系统': ['网格化养成', '主角尺寸切换'],

    # 怪物收集类
    '怪物收集': ['战棋怪物收集'],
    '宝可梦Like': [],

    # 模拟经营类
    '养成模拟': ['地牢运营', '反向RPG经营'],
    '牧场经营': [],
    '公会经营': ['网游模拟'],

    # 多人社交类
    '异步多人': ['异步对战'],
    '社交羁绊': ['队伍羁绊'],

    # 桌游骰牌类
    '桌游改编': ['D&D规则改编', 'IP改编'],
    '骰面构筑': ['肉鸽LITE'],
    '行动顺序操控': [],

    # 肉鸽融合类
    '程序生成': ['程序化生成世界', '无限构筑', '无尽进程', '海量组合'],
    '随机地牢': ['第一人称地牢探索', '地牢探索'],
    '永久死亡': ['感染模拟'],
    '肉鸽Lite': ['肉鸽LITE'],
    '轻度肉鸽': [],

    # 生存建造类
    '装备打造': ['素材打造'],
    '基地建设': [],
    '生存管理': ['资源生存', '耐力资源管理', '体力资源管理'],
    '生活模拟': [],

    # 形态融合类
    '生物创造': ['怪物创造', '基因改造'],
    '生物合成/进化': ['怪物合成', '怪物深度合成', '怪物融合'],
    '生物塑造': ['生物改造'],
    '主角变身': ['体型堆叠'],
    '特性拼装': ['核心合成'],

    # 牌组构建类
    '卡牌对战': ['内置卡牌'],
    '手牌管理': ['纸牌接龙'],
    '集换式卡牌': [],

    # MMO元素类
    '多人协作': ['轻社交'],

    # 玩法融合类
    '塔防融合': ['战术RPG融合'],
    '解谜策略': ['解谜探索', '环境互动解谜'],
    '机关解谜': ['情绪解谜', '物理解谜', '弹射碰撞'],
    '地形改造': [],

    # 回合制策略类
    '半即时指令战斗': ['ATB战斗', '快节奏回合制'],
    '动态回合顺序': ['确定性战斗'],
    '可预见性战斗': [],

    # 战术战棋类
    '战棋式战斗': ['战棋融合'],
    '六边形战棋': ['回合制战术', '回合制策略', '策略战棋'],
    '网格战术': ['棋盘战术', '棋盘幸存者'],
    '即时走位': ['弹射碰撞'],

    # 开放世界类
    '开放世界探索': ['半开放世界探索', '开放区域探索', '双模式探索', '双世界穿梭'],

    # 叙事相关
    '非战斗解法': ['地图无缝战斗'],
    '交涉招募': ['潜行战术'],
    '团队连携攻击': ['小游戏战斗'],
    '双单位战术': ['尸群控制'],

    # 探索相关
    '骑乘探索': [],
    '收集马拉松': [],
    '海量支线任务': [],
    '任务驱动': [],

    # 战斗相关
    '地图无缝战斗': [],
    'FF系列大乱斗': [],
    '主角尺寸切换': [],

    # 其他有价值标签
    '魔法书系统': [],
    '赛博骇客': [],
    '节奏交互': ['第一人称跑酷'],
    'QTE机制': ['QTE捕获'],
    '装备镶嵌': [],
    '极简养成': ['极简主义'],
    '定期纳贡': [],
    '流程交换': ['柏拉图式社交'],
    '协同构筑': [],
    '码生成': [],
    '数字世界观': [],
    '伪Gacha': [],
    '角斗场机制': [],
    '双模式探索': [],
    '无限构筑': [],
    ' сезонные изменения': [],
    '海量收集': [],
    '无限地牢': ['无尽爬塔'],
}

# 白名单标签（强制保留，不丢弃）
WHITELIST_TAGS = set()

# 黑名单标签（强制丢弃，只保留真正泛化的标签）
# 注意：只包含品类标配/Steam原生标签，不包含同义词合并的目标端标签
# 有意义的差异化标签全部走 SYNONYM_MAP 合并路径
BLACKLIST_TAGS = {
    # Steam 品类标签
    'JRPG', 'RPG', 'Action RPG', 'Adventure', 'Singleplayer',
    'Turn-Based', 'Turn-Based Combat', 'Turn-Based Strategy', 'Turn-Based Tactics',
    'Roguelite', 'Roguelike', 'Rogue-lite', 'Rogue-like', 'Metroidvania',
    'Card Game', 'Deckbuilding', 'Board Game', 'Tabletop',
    'Simulation', 'Sandbox', 'Farming Sim', 'Life Sim',
    'Survival', 'Survival Game', 'Crafting',
    'Open World', 'Exploration', 'Dungeon Crawler',
    'Fantasy', 'Anime', '2D', '3D', 'Pixel Graphics',
    'Indie', 'Action', 'Strategy', 'Casual',
    'MMORPG', 'Auto Battler', 'Card Battler',
    'Party-Based RPG', 'Strategy RPG', 'Tactical RPG',
    'Perma Death', 'Procedural Generation', 'Loot',
    'Collectathon', 'PvE', 'PvP', 'Co-op', 'Multiplayer',
    # Steam 体验标签
    'Story Rich', 'Multiple Endings', 'Choices Matter',
    'Great Soundtrack', 'Female Protagonist', 'Relaxing',
    'Family Friendly', 'Cute', 'Colorful', 'Funny', 'Dark', 'Atmospheric',
    # 泛化中文标签
    '回合制', '回合', '角色扮演', 'RPG角色扮演',
    '宝可梦Like', 'Steam 评测',
    'Creature Collector', '怪物收集', '怪物捕捉', '怪物养成', '生物收集', '宠物养成', '养成',
    # 泛化杂项
    '海量收集', '海量组合', '无尽进程', '无尽爬塔',
}


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def load_mechanics():
    """加载 combinedMechanics.json"""
    if not COMBINED_MECHANICS_FILE.exists():
        log(f"错误: {COMBINED_MECHANICS_FILE} 不存在")
        return None, None

    with open(COMBINED_MECHANICS_FILE, 'r', encoding='utf-8') as f:
        combined = json.load(f)

    tag_counter = Counter()
    tag_games = defaultdict(list)
    for appid, game in combined.get('games', {}).items():
        for tag in game.get('rawMechanics', []):
            tag = tag.strip()
            if tag:
                tag_counter[tag] += 1
                tag_games[tag].append(game.get('name', ''))

    log(f"已加载 {len(tag_counter)} 个唯一标签")
    return tag_counter, tag_games


def load_cache():
    """加载缓存"""
    if CACHE_FILE.exists():
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_cache(cache):
    """保存缓存"""
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    log(f"已保存: {CACHE_FILE}")


def build_merge_map(tag_counter, tag_games):
    """构建合并映射表"""
    # 构建合并关系：废弃标签 -> 保留标签
    merge_map = {}  #废弃标签 -> 保留标签

    for canonical, synonyms in SYNONYM_MAP.items():
        for syn in synonyms:
            merge_map[syn] = canonical

    cache = {}
    kept = 0
    merged = 0
    discarded = 0
    pending = 0

    for tag, cnt in tag_counter.items():
        games = tag_games.get(tag, [])[:5]

        # 核心标签直接保留
        if tag in CORE_TAGS:
            cache[tag] = {
                'status': 'kept',
                'merged_to': None,
                'count': cnt,
                'games': games,
                'source': 'core',
            }
            kept += 1
        # 白名单保留
        elif tag in WHITELIST_TAGS:
            cache[tag] = {
                'status': 'kept',
                'merged_to': None,
                'count': cnt,
                'games': games,
                'source': 'whitelist',
            }
            kept += 1
        # 在合并映射中 -> 合并到目标标签
        elif tag in merge_map:
            canonical = merge_map[tag]
            cache[tag] = {
                'status': 'merged',
                'merged_to': canonical,
                'count': cnt,
                'games': games,
                'source': 'synonym_map',
            }
            merged += 1
        # 在黑名单中 -> 丢弃
        elif tag in BLACKLIST_TAGS:
            cache[tag] = {
                'status': 'discarded',
                'merged_to': None,
                'count': cnt,
                'games': games,
                'source': 'blacklist',
            }
            discarded += 1
        # 未分类的标签 -> 标记为待处理
        else:
            cache[tag] = {
                'status': 'pending',
                'merged_to': None,
                'count': cnt,
                'games': games,
                'source': 'auto',
            }
            pending += 1

    # 生成合并映射文件（供 precompute.py 使用）
    # 格式：{废弃标签: 保留标签, ...}
    # 注意：pending 标签不在 mergeMap 中，它们会保持原样
    final_merge_map = {}
    for tag, info in cache.items():
        if info['status'] == 'merged':
            final_merge_map[tag] = info['merged_to']

    merge_map_data = {
        'meta': {
            'createdAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            'totalUniqueTags': len(tag_counter),
            'kept': kept,
            'merged': merged,
            'discarded': discarded,
            'pending': pending,
        },
        'mergeMap': final_merge_map,  # {废弃标签: 保留标签}，保留为 None 表示独立保留
        'stats': {
            'kept': kept,
            'merged': merged,
            'discarded': discarded,
            'pending': pending,
        }
    }

    with open(MERGE_MAP_FILE, 'w', encoding='utf-8') as f:
        json.dump(merge_map_data, f, ensure_ascii=False, indent=2)
    log(f"已保存: {MERGE_MAP_FILE}")

    return cache, merge_map_data


def print_status(cache, tag_counter):
    """打印状态"""
    stats = {'kept': 0, 'merged': 0, 'discarded': 0, 'pending': 0}
    for tag, info in cache.items():
        stats[info['status']] += 1

    print("\n" + "=" * 60)
    print("标签管理状态")
    print("=" * 60)
    print(f"总标签数: {len(tag_counter)}")
    print(f"保留: {stats['kept']}")
    print(f"合并: {stats['merged']}")
    print(f"丢弃: {stats['discarded']}")
    print(f"待处理: {stats['pending']}")
    print()

    # 显示待处理标签
    pending_tags = [(tag, info) for tag, info in cache.items() if info['status'] == 'pending']
    if pending_tags:
        pending_tags.sort(key=lambda x: -tag_counter.get(x[0], 0))
        print(f"【待处理标签】({len(pending_tags)} 个)")
        for tag, info in pending_tags:
            print(f"  - {tag} (x{tag_counter.get(tag, 0)})")
            if info['games']:
                print(f"      示例: {', '.join(info['games'][:2])}")

    # 显示合并情况
    merged_tags = [(tag, info) for tag, info in cache.items() if info['status'] == 'merged']
    if merged_tags:
        merged_tags.sort(key=lambda x: -tag_counter.get(x[0], 0))
        print(f"\n【合并的标签】({len(merged_tags)} 个)")
        for tag, info in merged_tags:
            print(f"  - {tag} -> {info['merged_to']}")


def export_config():
    """导出统一配置到 tag-config.json，供 route.ts 和 page.tsx 使用"""
    # 构建合并映射（废弃标签 → 保留标签）
    synonym_merge: dict[str, str] = {}
    for canonical, synonyms in SYNONYM_MAP.items():
        for syn in synonyms:
            synonym_merge[syn] = canonical

    # 黑名单：品类标配标签，与同义词体系解耦
    # 只包含真正无区分度的泛化标签，有意义的标签全部走同义词合并路径
    blacklist: list[str] = [
        # 品类/平台/受众泛化标签
        'RPG', 'JRPG', 'RPG角色扮演', 'Action RPG', 'Adventure', 'Strategy RPG',
        'Turn-Based', 'Turn-Based Strategy', 'Turn-Based Tactics', 'Turn-Based Combat', 'Turn-Based RPG',
        '回合制', '回合', '回合制战斗', '回合制策略', '回合制战术',
        'Board Game', 'Tabletop', 'Card Game', 'Deckbuilding',
        'Roguelike Deckbuilder', 'Rogue-lite', 'Rogue-like', 'Roguelite', 'Roguelike', '类肉鸽',
        'Metroidvania', '银河恶魔城',
        'Card Battler',
        'Party-Based RPG', 'Tactical RPG',
        'Story Rich', 'Multiple Endings', 'Choices Matter',
        'Fantasy', 'Anime', '2D', '3D', 'Pixel Graphics',
        'Indie', 'Singleplayer', 'Action', 'Strategy', 'Casual',
        'Family Friendly', 'Cute', 'Colorful', 'Funny', 'Dark', 'Atmospheric',
        'Great Soundtrack', 'Female Protagonist',
        'Perma Death', 'Procedural Generation', 'Loot', 'Collectathon',
        'Open World', 'Exploration', 'Dungeon Crawler',
        'Survival', 'Survival Game', 'Crafting', 'Sandbox', 'Farming Sim',
        'Resource Management', 'Life Sim', 'Relaxing',
        'Character Customization', 'Time Management',
        'PvE', 'PvP', 'Co-op', 'Multiplayer', 'MMORPG', 'Auto Battler',
        # Steam 原始标签混入
        'Steam 评测',
        'Creature Collector', 'Monster Catching', 'Monster Taming',
        '怪物收集', '怪物捕捉', '怪物养成', '生物收集', '宠物养成', '养宠', '养成',
        '宝可梦Like',
    ]

    # 核心保留标签
    core_tags: list[str] = list(CORE_TAGS)

    # 从 clusterMap 导出分组结构
    cluster_file = SCRIPT_DIR / 'tag_clusters.json'
    tag_categories: dict[str, dict] = {}
    if cluster_file.exists():
        try:
            with open(cluster_file, 'r', encoding='utf-8') as f:
                cluster_data = json.load(f)
            clusters = cluster_data.get('clusters', {})
            for cat, tags in clusters.items():
                if isinstance(tags, list):
                    tag_categories[cat] = {
                        'tags': [t['tag'] for t in tags if isinstance(t, dict) and 'tag' in t],
                        'total': sum(t.get('count', 0) for t in tags if isinstance(t, dict))
                    }
        except Exception as e:
            log(f"Warning: 无法加载 tag_clusters.json: {e}")

    config = {
        'meta': {
            'version': '1.0',
            'generatedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'manage_tags.py SYNONYM_MAP + BLACKLIST_TAGS',
        },
        'synonymMerge': synonym_merge,   # {废弃标签: 保留标签}
        'blacklist': blacklist,           # 品类标配黑名单
        'coreTags': core_tags,           # 核心保留标签
        'tagCategories': tag_categories,  # 分组分类（可选）
    }

    config_file = SCRIPT_DIR / 'tag-config.json'
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    log(f"已导出配置: {config_file}")
    log(f"  同义词映射: {len(synonym_merge)} 条")
    log(f"  黑名单标签: {len(blacklist)} 个")
    log(f"  核心标签: {len(core_tags)} 个")
    log(f"  分组分类: {len(tag_categories)} 个")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='标签管理脚本')
    parser.add_argument('--build', action='store_true', help='从 combinedMechanics.json 生成合并映射')
    parser.add_argument('--merge', nargs=2, metavar=('KEEP', 'DISCARD'), help='合并同义标签（KEEP为保留名，DISCARD为废弃名）')
    parser.add_argument('--add', nargs=1, metavar='TAG', help='将标签加入白名单（保留，不丢弃）')
    parser.add_argument('--discard', nargs=1, metavar='TAG', help='将标签加入黑名单（丢弃）')
    parser.add_argument('--status', action='store_true', help='查看当前状态')
    parser.add_argument('--export-config', action='store_true', help='导出统一配置到 tag-config.json')
    args = parser.parse_args()

    # 加载数据
    tag_counter, tag_games = load_mechanics()
    if tag_counter is None:
        return

    # 加载缓存
    cache = load_cache()

    if args.build:
        log("重建合并映射...")
        cache, merge_data = build_merge_map(tag_counter, tag_games)
        save_cache(cache)

        print("\n最终统计:")
        print(f"  保留: {merge_data['stats']['kept']}")
        print(f"  合并: {merge_data['stats']['merged']}")
        print(f"  丢弃: {merge_data['stats']['discarded']}")
        print(f"  待处理: {merge_data['stats']['pending']}")
        print(f"\n合并映射已保存到: {MERGE_MAP_FILE}")

    elif args.status:
        if not cache:
            log("缓存不存在，请先运行 --build")
            return
        print_status(cache, tag_counter)

    elif args.merge:
        keep_tag, discard_tag = args.merge

        # 更新缓存
        if discard_tag in cache:
            cache[discard_tag]['status'] = 'merged'
            cache[discard_tag]['merged_to'] = keep_tag
            cache[discard_tag]['source'] = 'manual'
            log(f"已合并: {discard_tag} -> {keep_tag}")
        else:
            # 如果废弃标签不在缓存中（是新标签），添加到缓存
            cache[discard_tag] = {
                'status': 'merged',
                'merged_to': keep_tag,
                'count': tag_counter.get(discard_tag, 0),
                'games': tag_games.get(discard_tag, [])[:5],
                'source': 'manual',
            }
            log(f"已添加合并: {discard_tag} -> {keep_tag}")

        save_cache(cache)

        # 重建合并映射文件
        merge_map = {}
        for tag, info in cache.items():
            if info['status'] == 'merged' and info['merged_to']:
                merge_map[tag] = info['merged_to']
            elif info['status'] == 'pending':
                merge_map[tag] = None

        kept = sum(1 for info in cache.values() if info['status'] == 'kept')
        merged = sum(1 for info in cache.values() if info['status'] == 'merged')
        discarded = sum(1 for info in cache.values() if info['status'] == 'discarded')
        pending = sum(1 for info in cache.values() if info['status'] == 'pending')

        merge_data = {
            'meta': {
                'createdAt': time.strftime('%Y-%m-%d %H:%M:%S'),
                'totalUniqueTags': len(tag_counter),
                'kept': kept,
                'merged': merged,
                'discarded': discarded,
                'pending': pending,
            },
            'mergeMap': merge_map,
            'stats': {
                'kept': kept,
                'merged': merged,
                'discarded': discarded,
                'pending': pending,
            }
        }

        with open(MERGE_MAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(merge_data, f, ensure_ascii=False, indent=2)
        log(f"已更新: {MERGE_MAP_FILE}")

    elif args.add:
        tag = args.add[0]
        if tag in cache:
            cache[tag]['status'] = 'kept'
            cache[tag]['source'] = 'whitelist'
            log(f"已将 {tag} 加入白名单")
        else:
            cache[tag] = {
                'status': 'kept',
                'merged_to': None,
                'count': tag_counter.get(tag, 0),
                'games': tag_games.get(tag, [])[:5],
                'source': 'whitelist',
            }
            log(f"已将 {tag} 加入白名单")
        save_cache(cache)

    elif args.discard:
        tag = args.discard[0]
        if tag in cache:
            cache[tag]['status'] = 'discarded'
            cache[tag]['source'] = 'blacklist'
            log(f"已将 {tag} 加入黑名单")
        else:
            cache[tag] = {
                'status': 'discarded',
                'merged_to': None,
                'count': tag_counter.get(tag, 0),
                'games': tag_games.get(tag, [])[:5],
                'source': 'blacklist',
            }
            log(f"已将 {tag} 加入黑名单")
        save_cache(cache)

    elif args.export_config:
        # 导出配置不需要 combinedMechanics.json，直接从硬编码定义导出
        export_config()

    else:
        parser.print_help()


if __name__ == '__main__':
    # 验证关键标签
    print("=== 关键标签检查 ===")
    print(f"案件推理 in SYNONYM_MAP: {'案件推理' in SYNONYM_MAP}")
    print(f"推理探案 in SYNONYM_MAP: {'推理探案' in SYNONYM_MAP}")
    print(f"阵营抉择 in SYNONYM_MAP: {'阵营抉择' in SYNONYM_MAP}")
    print(f"怪物收集 in SYNONYM_MAP: {'怪物收集' in SYNONYM_MAP}")

    # 构建 merge_map
    merge_map = {}
    for canonical, synonyms in SYNONYM_MAP.items():
        for syn in synonyms:
            merge_map[syn] = canonical

    print(f"\n=== merge_map 检查 ===")
    print(f"案件推理 in merge_map: {'案件推理' in merge_map}")
    print(f"推理探案 in merge_map: {'推理探案' in merge_map}")
    if '案件推理' in merge_map:
        print(f"案件推理 -> {merge_map['案件推理']}")
    if '推理探案' in merge_map:
        print(f"推理探案 -> {merge_map['推理探案']}")

    # CORE_TAGS 检查
    print(f"\n=== CORE_TAGS ===")
    for t in CORE_TAGS:
        print(f"  {t}: {t in SYNONYM_MAP}")

    print(f"\n=== 统计 ===")
    print(f"SYNONYM_MAP keys (主标签数): {len(SYNONYM_MAP)}")
    print(f"merge_map entries (被合并的标签数): {len(merge_map)}")
    main()
