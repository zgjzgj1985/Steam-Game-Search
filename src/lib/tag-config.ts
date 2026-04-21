/**
 * 标签配置模块（前端与后端共享）
 *
 * 此文件包含同义词映射和黑名单配置的单一来源定义。
 *
 * 数据流向：
 * 1. manage_tags.py --export-config → scripts/tag-config.json
 * 2. 此文件从 tag-config.json 读取（服务端）或使用内置默认值（客户端）
 * 3. route.ts 和 page.tsx 使用此模块确保前后端一致
 */

// 标签配置的同义词合并映射（废弃标签 → 保留标签）
// 来源: scripts/tag-config.json（由 manage_tags.py --export-config 生成）
export const SYNONYM_MERGE: Record<string, string> = {
  // 推理解谜类
  "案件推理": "推理探案",
  // 叙事驱动类
  "分支叙事": "阵营抉择",
  "派系抉择": "阵营抉择",
  "多分支剧情": "阵营抉择",
  "CRPG式叙事": "阵营抉择",
  "视觉小说叙事": "视觉小说",
  "网状叙事": "太空歌剧",
  "非暴力交涉": "心灵潜入",
  // 战斗策略类
  "刷宝驱动": "刷宝掉落",
  "猜拳克制": "弱点追击",
  "元素循环克制": "元素反应",
  "双人协作": "多人竞技",
  "队伍羁绊": "团队管理",
  "队伍构建": "团队管理",
  "即时队伍战斗": "即时战术",
  "小队RPG": "即时战术",
  "仆从军团": "领袖+召唤单位",
  // 养成方式类
  "放置挂机": "放置养成",
  "点击放置": "放置养成",
  "社交羁绊": "好感度养成",
  "深度构筑": "天赋树",
  "深度BD构筑": "天赋树",
  "策略构筑": "天赋树",
  "数值博弈": "天赋树",
  "数值攻占": "天赋树",
  "精髓技能继承": "技能继承",
  "自由角色构筑": "职业Build自由",
  "角色定制": "职业Build自由",
  "主角尺寸切换": "体型系统",
  "网格化养成": "体型系统",
  "体型堆叠": "主角变身",
  // 怪物收集类
  "战棋怪物收集": "怪物收集",
  // 模拟经营类
  "地牢运营": "养成模拟",
  "反向RPG经营": "养成模拟",
  // 多人社交类
  "异步对战": "异步多人",
  // 桌游骰牌类
  "D&D规则改编": "桌游改编",
  "IP改编": "桌游改编",
  "肉鸽LITE": "肉鸽Lite",
  // 肉鸽融合类
  "程序化生成世界": "程序生成",
  "无限构筑": "程序生成",
  "无尽进程": "程序生成",
  "海量组合": "程序生成",
  "第一人称地牢探索": "随机地牢",
  "地牢探索": "随机地牢",
  "感染模拟": "永久死亡",
  // 生存建造类
  "素材打造": "装备打造",
  "资源生存": "生存管理",
  "耐力资源管理": "生存管理",
  "体力资源管理": "生存管理",
  // 形态融合类
  "怪物创造": "生物创造",
  "基因改造": "生物塑造",
  // 探索方式类
  "双世界穿梭": "开放世界探索",
  "情绪解谜": "机关解谜",
  "物理解谜": "机关解谜",
  // 玩法融合类
  "弹射碰撞": "即时走位",
  "地图无缝战斗": "非战斗解法",
  "回合制策略": "六边形战棋",
  "回合制战术": "六边形战棋",
  "棋盘战术": "六边形战棋",
  "半开放世界探索": "开放世界探索",
  "开放区域探索": "开放世界探索",
};

// 品类标配黑名单（仅用于过滤 featureTagOptions）
// 只包含真正无区分度的泛化标签，创新玩法标签（如阵营抉择、程序生成、刷宝掉落等）不在此列
export const INNOVATION_BLACKLIST: Record<string, boolean> = {
  // Steam 品类标签（泛化，过于宽泛）
  "RPG": true,
  "JRPG": true,
  "Action RPG": true,
  "Adventure": true,
  "Turn-Based": true,
  "Turn-Based Combat": true,
  "Turn-Based Strategy": true,
  "Turn-Based Tactics": true,
  "Turn-Based RPG": true,
  "Tactical RPG": true,
  "Party-Based RPG": true,
  "Strategy RPG": true,
  "Roguelike": true,
  "Roguelite": true,
  "Rogue-lite": true,
  "Rogue-like": true,
  "Metroidvania": true,
  "Roguelike Deckbuilder": true,
  "Card Game": true,
  "Card Battler": true,
  "Deckbuilding": true,
  "Board Game": true,
  "Tabletop": true,
  "Simulation": true,
  "Sandbox": true,
  "Farming Sim": true,
  "Life Sim": true,
  "Survival": true,
  "Survival Game": true,
  "Crafting": true,
  "Open World": true,
  "Exploration": true,
  "Collectathon": true,
  "Dungeon Crawler": true,
  "MMORPG": true,
  "Auto Battler": true,
  "Singleplayer": true,
  // Steam 评价/属性标签
  "Story Rich": true,
  "Multiple Endings": true,
  "Choices Matter": true,
  "Perma Death": true,
  "Procedural Generation": true,
  "Loot": true,
  "PvE": true,
  "PvP": true,
  "Co-op": true,
  "Multiplayer": true,
  // 美术/风格标签
  "Fantasy": true,
  "Anime": true,
  "2D": true,
  "3D": true,
  "Pixel Graphics": true,
  "Indie": true,
  "Action": true,
  "Strategy": true,
  "Casual": true,
  "Family Friendly": true,
  "Cute": true,
  "Colorful": true,
  "Funny": true,
  "Dark": true,
  "Atmospheric": true,
  "Great Soundtrack": true,
  "Female Protagonist": true,
  "Replay Value": true,
  "Character Customization": true,
  "Time Management": true,
  "Resource Management": true,
  "Relaxing": true,
  // 项目核心概念（作为模式2池子筛选条件，不作为特色标签展示）
  "Creature Collector": true,
  "Monster Catching": true,
  "Monster Taming": true,
  "宝可梦Like": true,
  "Steam 评测": true,
  "回合制": true,
};
