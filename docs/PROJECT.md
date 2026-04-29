# Steam 全域游戏搜索

> **版本**: v1.20.0
> **更新日期**: 2026-04-29

> **版本历史**:
> - v1.20.0: **文档全面审核与修复**：系统性审核 PROJECT.md，发现并修复大量陈旧内容。包括：API接口文档新增 `/api/games` 兼容层和 `/api/analysis/module` POST接口；修正 mode2/filter 默认值（poolA/B minRating=40）；补充缺失参数（poolA_minYear、priceMin/Max、modernTagFilter、featureTagFilter、tagSortBy、statsOnly）；更新 Game 类型定义（修正必填/可选、补充预计算字段、补充 cnReviews/overseasReviews）；更新项目结构目录树（补充缺失文件、补全 scripts/ 目录、补全组件列表）。涉及文件：`docs/PROJECT.md`。
> - v1.19.0: **筛选机制重构 + 池子条件放宽**：预计算脚本改用威尔逊得分替代好评率作为池子排序基准，解决样本量过少导致的好评率失真问题。API路由同步放宽池子参数默认值（A池>=40%、B池>=40%），确保筛选结果有足够样本支撑。涉及文件：`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。
> - v1.18.0: **LLM标签全量采集完成 + 质量复审通过**：A池633款+B池94款全部完成，零失败。模式2标签质量复审综合评分8/10。详见《池子创新标签质量审核报告 v2.0.0》。同时修复批量采集脚本日志输出 UnicodeEncodeError 崩溃问题。
> - v1.16.0: **翻译层彻底简化**：删除 `tag-translator.ts`（整个文件），删除 `page.tsx` 中200+行的 `TAG_TRANSLATIONS`，删除 `route.ts` 中60+行的 `TAG_CHINESE_NAMES`，合并翻译表为单一源。Python端：删除200+行的 `COMMON_TAG_TRANSLATIONS`，翻译完全交给LLM，Python只做验证（是否包含中文字符）。`mode2` 页面 JS 从 17.3kB 降至 15.4kB。
> - v1.14.0: **模式2英文标签翻译改进**：扩展 `tag-translator.ts` 的 `essentialTranslations` 翻译映射表（约200+个标签），新增 `cleanTag` 函数处理复杂格式标签（移除括号内容、中英混合标签）。扩展 `route.ts` 的 `TAG_CHINESE_NAMES` 映射表。扩展前端 `page.tsx` 的 `TAG_TRANSLATIONS` 映射表（约150+个标签），支持大小写不敏感匹配。涉及文件：`src/lib/tag-translator.ts`、`src/app/api/mode2/filter/route.ts`、`src/app/mode2/page.tsx`。
> - v1.13.2: **Bug修复：BLACKLIST_TAGS 过于严格导致游戏被误排除**：修复 B 池游戏数量为0的根本原因。问题：BLACKLIST_TAGS 包含 "Board Game"，使用子串匹配（`includes`），导致所有包含 "board game" 的游戏（如 Evolution Board Game）被排除在所有池子之外。修复：清理 BLACKLIST_TAGS，只保留 NSFW/Hentai 等真正有问题的标签，移除 Board Game / Grand Strategy / 4X Strategy / Text-Based 等过于宽泛的标签。涉及文件：`src/app/api/mode2/filter/route.ts`。
> - v1.13.1: **Bug修复：创新标签数量异常**：修复 featureTagOptions 只有10个标签的问题。根本原因：① INNOVATION_BLACKLIST 包含了大量创新玩法标签（如阵营抉择、程序生成、刷宝掉落等），② `precompute.py` 的 `calculate_feature_tag_options()` 使用硬编码的10个标签。修复：① 清理 INNOVATION_BLACKLIST，只保留品类标配标签；② 重写 `calculate_feature_tag_options()` 从 `combinedMechanics.json` 的 rawTagStats 动态加载所有标签；③ 重新运行预计算生成108个标签。涉及文件：`src/lib/tag-config.ts`、`scripts/precompute.py`、`public/data/games-cache.json`。
> - v1.13.0: **标签体系三端统一重构**：构建单一配置源 `manage_tags.py --export-config` 生成 `tag-config.json`，统一管理同义词映射（92条）、黑名单（87个）、核心标签（10个）、分组分类（22个）。消除 `manage_tags.py`、`precompute.py`、`route.ts` 三处重复定义。黑名单重新设计为只包含品类标配标签，同义词合并的目标端标签不再进入黑名单。`mergeLlMechancics()` 合并时应用同义词合并。`computeFeatureTagOptionsFromMechanics()` 从 rawTagStats 加载时应用同义词合并，解决统计口径不一致导致 count=0 的问题。涉及文件：`scripts/manage_tags.py`、`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`、`src/lib/tag-config.ts`。
> - v1.12.1: **聚类脚本 LLM 语义分析升级**：分11批调用 Gemini 对 207 个自由标签进行语义归类。聚类结果：41个归入标准分类、49个归入16个新分类（战斗策略/养成方式/叙事驱动/探索方式/多人社交等）、70个标记为噪声丢弃。人工审查回收 33 个高价值标签（如阵营抉择→叙事驱动、弱点追击→战斗策略等）。涉及文件：`scripts/cluster_tags.py`、`scripts/review_discard.py`、`scripts/manual_recover.py`。
> - v1.12.0: **融合标签开放化**：融合玩法标签从"固定封闭标签"升级为"开放自由标签 + 定期聚类归类"双层架构。`analyze_mechanics.py` 允许 LLM 自由发明新标签（最多6个），新增 `cluster_tags.py` 聚类脚本将相似标签归入标准分类，新增 `tag_clusters.json` 聚类映射表。解决旧体系无法发现新兴玩法（如吃鸡、搜打撤等）的根本性局限。`precompute.py` 支持加载聚类映射，`route.ts` 新增 `llmRawMechanics` 字段。涉及文件：`scripts/analyze_mechanics.py`、`scripts/cluster_tags.py`、`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。新增数据文件：`tag_clusters.json`、`emerge_tags_log.json`。
> - v1.11.0: **融合标签质量重构（Phase 1+2）**：第一性原理审查发现旧标签体系存在根本缺陷——66%游戏被标"探索冒险"（任何RPG标配）、52%被标"战棋策略"（核心玩法非融合玩法）、37%被标"像素风格"（美术≠机制）。重写 `analyze_mechanics.py` prompt，重新设计标签体系（丢弃探索冒险/战棋策略/像素风格，保留肉鸽融合/牌组构建/形态融合等具体机制标签），实现二次置信度验证（两模型交叉验证）。新标签体系使 B 池有效覆盖率从泛化的 66% 降至精确的 25%（肉鸽融合），真正实现了"区分融合玩法"的设计目标。涉及文件：`scripts/analyze_mechanics.py`、`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。
> - v1.10.0: **融合创新标签重构**：新增 `analyze_mechanics.py` 脚本，对 B 池 67 款游戏进行 LLM 融合玩法分析，生成真实的"融合了什么玩法"标签（形态融合、肉鸽融合、牌组构建等），替代原有的 Steam 标签频率统计。涉及文件：`scripts/analyze_mechanics.py`、`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。新增 `combinedMechanics.json` 数据文件。
> - v1.9.0: **特色标签优化**：基于 B 池游戏标签频率分析（68款），重新设计特色标签筛选系统。删除无效标签（形态融合、银河恶魔城），新增高价值信号（像素风格、探索冒险），修正肉鸽融合标签名（Rogue-lite/Rogue-like）。优化后特色标签在 B 池覆盖率从平均 5% 提升至 28%。涉及文件：`src/app/api/mode2/filter/route.ts`、`scripts/precompute.py`。
> - v1.8.2: **Bug修复**：修复模式1搜索去重逻辑优先保留测试版而非正式版的问题。当同一游戏同时存在正式版和测试版时，去重逻辑原本优先保留玩家数最多的版本，导致测试版被错误保留。修复：去重时优先判断是否为正式版/测试版，保留正式版；同为正式版或测试版时才比较玩家数。涉及文件：`src/app/api/games/search/route.ts`、`scripts/precompute.py`。
> - v1.8.1: **Bug修复**：修复模式2特色标签筛选失效问题。SQLite 数据库不存储 `featureTagOptions` 字段，导致从 SQLite 加载时该字段为空数组。新增 `loadFeatureTagOptionsFromJson()` 函数从 JSON 缓存补充读取，SQLite-first 架构更完整。
> - v1.8.0: **性能优化**：新增 `build-cache-db.py` 将 336MB JSON 转换为 SQLite 数据库，解决 Zeabur 部署时 OOM 问题。API 优先从 SQLite 查询，失败自动降级 JSON。`precompute.ts` 也支持生成 SQLite。`.gitattributes` 添加 `games-cache.db` LFS 追踪。
> - v1.7.1: **界面更新**：将首页标题从"回合制战斗分析工具"更改为"Steam全域游戏搜索"，统一产品名称
> - v1.7.0: **部署修复**：修复 Dockerfile 多阶段构建路径、public 目录复制、.dockerignore 排除配置、.gitattributes LFS 追踪、更新 zeabur.json 构建命令、新增 .env.deploy.example 统一环境变量模板
> - v1.6.1: **Docker构建修复**：模式2/对比页UI组件路径别名问题，新增 `fetch_regional_reviews.py` 区域评价采集脚本，`precompute.py` 支持区域数据预计算，模式2展示国内/海外评价对比
> - v1.6.0: **模式2重构**：新增"宝可梦Like标签"筛选选项，新增分析图表A/B/C池子分布统计
> - v1.5.4: **标签排重修复**：修复特色标签筛选时卡片重复显示标签问题
> - v1.5.3: **封面修复**：预计算优先使用JSON数据源，93,081个游戏封面恢复

## 项目简介

一个面向**游戏策划与开发者**的专业参考游戏研究工具，融合 AI 能力与 Steam 游戏数据，帮助用户在立项阶段寻找参考游戏、研究竞品、避免前人踩过的坑。

不同于普通的游戏搜索工具，本项目专注于**回合制战斗 + 宝可梦Like融合玩法**这个细分赛道，提供深度的竞品分析和设计参考。

- **模式1搜索**：关键词搜索 + AI 战斗系统分析
- **模式2宝可梦Like**：基于三池评分的专项筛选系统
- **游戏对比**：多款游戏综合对比分析

### 核心功能

- **数据规模**：本地数据库包含 12.5 万+ Steam 游戏
- **AI 分析**：通义千问/Qwen + OpenAI 双支持，支持模块化按需分析
- **宝可梦Like筛选**：A/B/C三池分类系统，基于威尔逊得分的智能排序
- **融合玩法标签**：LLM驱动的开放标签体系，108个特色标签持续聚类归类
- **区域评价**：国内/海外评价独立统计，支持威尔逊得分区域化
- **可视化**：雷达图/柱状图/流程图/截图画廊
- **对比分析**：综合评分 + 详细数据对比
- **SQLite优先**：解决大文件OOM问题，API查询毫秒级响应

### 目标用户

- **独立游戏开发者**：寻找立项参考，理解市场空白
- **游戏策划**：研究竞品设计，避免重复造轮子
- **游戏分析师**：研究宝可梦Like细分赛道的市场表现与设计趋势
- **游戏投资人**：快速了解赛道头部产品与创新方向

### 技术栈

| 层级 | 技术 |
|------|------|
| Next.js 14 | 框架 (App Router) |
| TypeScript | 类型安全 |
| Tailwind CSS | 样式 |
| Radix UI | UI 组件 |
| Recharts + Mermaid | 图表 |
| Zustand | 状态管理 |
| SWR | 数据获取 |
| Prisma + SQLite | 数据库 (解决大文件OOM) |
| 通义千问 + OpenAI | AI 分析 |

### 设计理念

**三池分级——不是找"最好的游戏"，而是找"最合适的参考"**

| 池子 | 定位 | 用途 |
|------|------|------|
| A池 | 神作参考池 | 告诉你要做成什么样才能成功 |
| B池 | 核心竞品池 | 告诉竞争对手是怎么做的 |
| C池 | 避坑指南池 | 告诉哪些设计会招来差评 |

**标签体系三端统一——消除配置散落问题**

- `manage_tags.py --export-config` 生成 `tag-config.json` 作为单一配置源
- Python预计算脚本和Next.js API路由共用同一套标签配置
- 彻底消除三处重复定义导致的版本不一致问题

**威尔逊得分优先——解决小样本失真问题**

- 传统好评率在样本量小时容易失真（如 5好评/1差评 = 83% 但仅6条评价）
- 威尔逊得分下界同时考虑好评数和总评价数，样本越大越接近真实好评率
- 区域威尔逊得分支持国内/海外独立排序

**开放标签+聚类架构——解决新兴玩法发现难题**

- LLM自由发明新标签（最多6个），不限制于Steam官方标签
- 定期聚类脚本将相似标签归入标准分类
- 解决旧体系无法发现"吃鸡""搜打撤"等新兴玩法的根本局限

---

## 项目结构

```
Steam全域游戏搜索/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 模式1首页
│   │   ├── mode2/page.tsx     # 模式2宝可梦Like筛选
│   │   ├── analysis/[id]/
│   │   │   ├── page.tsx       # 分析详情
│   │   │   └── loading.tsx    # 加载状态
│   │   ├── compare/page.tsx   # 游戏对比页
│   │   ├── api/              # API Routes
│   │   │   ├── games/        # 游戏搜索/详情API
│   │   │   │   ├── route.ts      # 兼容层（重定向到search）
│   │   │   │   ├── search/route.ts   # 核心搜索API
│   │   │   │   └── [id]/route.ts     # 游戏详情API
│   │   │   ├── mode2/filter/route.ts  # 模式2筛选API
│   │   │   └── analysis/
│   │   │       ├── generate/route.ts   # AI分析生成API
│   │   │       └── module/route.ts     # 单模块分析API
│   │   ├── layout.tsx        # 根布局
│   │   ├── globals.css       # 全局样式（CSS变量定义）
│   │   ├── not-found.tsx     # 404页面
│   │   └── icon.svg          # 网站图标
│   ├── components/
│   │   ├── ui/              # UI基础组件
│   │   │   ├── button.tsx, input.tsx, card.tsx
│   │   │   ├── badge.tsx, tabs.tsx, hero.tsx
│   │   ├── search/          # 搜索组件
│   │   │   ├── game-search.tsx, game-card.tsx
│   │   │   └── featured-games.tsx
│   │   ├── analysis/        # 分析组件
│   │   │   ├── modular-analysis.tsx, game-info.tsx
│   │   │   ├── categories.tsx
│   │   │   ├── core-gameplay.tsx, battle-system-view.tsx
│   │   │   ├── differentiation-view.tsx, negative-feedback.tsx
│   │   │   ├── design-suggestions.tsx, analysis-detail.tsx
│   │   ├── charts/          # 图表组件
│   │   │   ├── radar-chart.tsx, comparison-chart.tsx
│   │   │   └── battle-flow.tsx
│   │   └── media/           # 媒体组件（gallery.tsx）
│   ├── lib/
│   │   ├── db.ts            # Prisma ORM 数据库连接
│   │   ├── steam.ts         # Steam API 封装
│   │   ├── llm.ts           # LLM API 封装（通义千问/OpenAI/Ollama）
│   │   ├── analysis-engine.ts # 分析引擎
│   │   ├── tag-config.ts     # 标签配置
│   │   ├── steam-header-image.ts # Steam头图处理
│   │   └── utils.ts         # 工具函数
│   └── types/
│       └── game.ts          # 游戏类型定义
├── public/data/              # 数据文件（不纳入Git版本控制）
│   ├── games-index.json     # 游戏索引
│   ├── games-meta.json      # 游戏元数据
│   ├── games-cache.json     # 预计算缓存
│   ├── games-cache.db       # SQLite缓存数据库
│   ├── games.db             # 主数据库
│   ├── combinedMechanics.json # LLM融合玩法分析
│   ├── regional-reviews.json  # 区域评价数据
│   └── regional-reviews-state.json # 区域评价状态
├── scripts/                  # Python数据脚本
│   ├── precompute.py        # 预计算缓存生成
│   ├── backup-data.py      # 数据备份脚本
│   ├── steam_api.py        # Steam API调用封装
│   ├── db_utils.py         # 数据库工具函数
│   ├── data_utils.py       # 数据处理工具函数
│   ├── config.py           # 配置管理
│   ├── logging_utils.py    # 日志工具
│   ├── manage_tags.py      # 标签管理（导出tag-config.json）
│   ├── incremental_update.py # 增量数据更新
│   ├── unified_workflow.py  # 统一工作流
│   ├── fetch_p0_v2.py     # P0级数据采集
│   ├── scrape_tags_for_missing.py # 标签补采
│   ├── batch_generate_llm_tags.py # 批量LLM标签生成
│   ├── sync_json_to_sqlite.py # JSON转SQLite
│   ├── setup-scheduler.py # Windows定时任务设置
│   ├── run-weekly-update.bat # 周更批处理脚本
│   ├── update-data.ts     # 数据更新脚本（Node.js）
│   ├── tag-config.json    # 标签配置文件
│   ├── tag_merge_map.json  # 标签合并映射表
│   ├── tag_merge_cache.json # 标签合并缓存
│   ├── tag_clusters.json   # 标签聚类映射表
│   └── temp/              # 临时脚本目录
├── prisma/
│   └── schema.prisma        # Prisma Schema
├── docs/                    # 项目文档
│   ├── README.md           # 用户级README
│   ├── PROJECT.md          # 完整项目文档
│   ├── 模式2.md
│   ├── 标签采集思路.md
│   └── 池子创新标签质量审核报告.md
├── .cursor/rules/           # Cursor AI助手规则
│   ├── dev-rules.mdc, git-safety.mdc
│   ├── path-reminder.mdc, karpathy-guidelines.mdc
│   └── rules-index.mdc
├── package.json, tsconfig.json
├── next.config.js, tailwind.config.ts
├── Dockerfile               # 多阶段Docker构建
├── zeabur.toml, zbpack.json # 部署配置
├── .env.example, .dockerignore, .gitattributes
```

---

## 数据说明

数据来自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)：

- **12.5 万+** Steam 游戏
- **91.9%** 有描述信息
- **99.9%** 有封面图

### 数据分层架构

| 文件 | 大小 | 用途 | 加载时机 |
|------|------|------|----------|
| `games-index.json` | ~320MB | 游戏索引基础信息 | API详情页按需加载 |
| `games-meta.json` | ~342MB | 游戏完整描述 | 仅用户请求完整数据时 |
| `games-cache.json` | ~322MB | 预计算缓存（威尔逊得分/宝可梦Like标签/区域评价） | 预计算时使用 |
| `games-cache.db` | - | SQLite缓存数据库 | API查询优先使用，解决OOM |
| `combinedMechanics.json` | - | LLM融合玩法分析结果 | 预计算时加载 |
| `regional-reviews.json` | - | 国内/海外区域评价 | 预计算时加载 |

### 更新机制

- **每周日凌晨 2:00** 自动执行增量更新（Windows任务计划程序）
- 通过 Steam Store API 获取最新评价数据
- 更新 SQLite 数据库记录
- `run-weekly-update.bat` 一键执行完整周更流程

### 备份机制

- **自动备份**：每周日凌晨 2:00 执行（SteamDataBackup）
- **备份位置**：`D:\SteamDataBackup\`
- **保留期限**：最近4周
- **手动备份**：`python scripts/backup-data.py`

> **重要**：`public/data/` 文件夹总计约1.6GB，**不在Git版本控制中**，修改数据相关代码前务必先执行手动备份。

---

## 环境变量

参考 `.env.example` 配置：

```env
DATABASE_URL="file:./dev.db"

# 公共URL
NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# LLM 配置 (通义千问)
LLM_PROVIDER=qianwen
DASHSCOPE_API_KEY=your_api_key_here
LLM_MODEL_QIANWEN=qwen3.6-plus
LLM_BASE_URL_QIANWEN=https://dashscope.aliyuncs.com/compatible-mode/v1

# 或 OpenAI 配置
LLM_API_KEY=sk-...
LLM_BASE_URL_OPENAI=https://api.openai.com/v1
LLM_MODEL_OPENAI=gpt-4o-mini
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm start

# 清理 Next.js 缓存
npm run clean
```

---

## API 接口

### 1. GET /api/games

兼容性接口，将旧版请求参数重定向到 `/api/games/search`。

**请求参数**（自动转发）：

| 参数 | 说明 |
|------|------|
| keyword / q | 搜索关键词 |
| page / pageSize | 分页参数 |
| minRating / minReviews | 筛选条件 |
| sortBy / sortOrder | 排序参数 |
| minReleaseDate / maxReleaseDate | 日期范围 |
| excludeTestVersions | 排除测试版 |
| genre | 游戏类型 |

---

### 2. GET /api/games/search

游戏搜索接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 否 | 搜索关键词 |
| genre | string[] | 否 | 游戏类型筛选（支持多选） |
| minRating | number | 否 | 最低好评率 (0-100) |
| minReviews | number | 否 | 最低评价数 |
| sortBy | string | 否 | 排序：rating/reviews/date/name |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 (默认1) |
| pageSize | number | 否 | 每页数量 (默认20, 最大50) |
| minReleaseDate | string | 否 | 最早发布日期 (yyyy-MM-dd) |
| maxReleaseDate | string | 否 | 最晚发布日期 (yyyy-MM-dd) |
| excludeTestVersions | boolean | 否 | 排除测试版 (默认true) |
| excludeSuspiciousDelisted | boolean | 否 | 排除可疑下架游戏 (默认true) |

**特殊标签筛选**：支持 tags 和 genres 模糊匹配
- `回合` - Turn-Based, Turn-Based Strategy, Turn-Based Tactics, Turn-Based Combat
- `RPG` - RPG, JRPG, Action RPG, Adventure
- `SRPG` - Strategy RPG, Tactical RPG
- `策略` - Strategy, Grand Strategy, Real Time Tactics, Tactical, 4X
- `卡牌` - Card Game, Deckbuilding, Collectible Card Game

**返回数据结构**：
```typescript
{
  results: Game[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dbStats: { totalGames: number; loadedAt: string | null };
}
```

---

### 3. GET /api/games/:id

游戏详情接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 游戏 ID (AppId，URL路径参数) |
| full | boolean | 否 | 返回完整数据 (默认 false) |

**返回数据结构**：
```typescript
{
  source: "local";
  game: Game;
  analysis: null;
  loadedFrom?: { index: boolean; meta: boolean; descriptionLength: number }; // 仅当 full=true 时
}
```

---

### 4. GET /api/analysis/generate

AI 分析生成接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gameId | string | 否 | 游戏 ID（二选一） |
| gameName | string | 否 | 游戏名称（二选一） |

> 注意：gameId 和 gameName 二选一，至少提供其中一个。

---

### 5. GET /api/mode2/filter

模式2宝可梦Like筛选接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|
| pool | string[] | 否 | 池子类型（支持多选 `pool=A&pool=B`） |
| poolA_minRating | number | 否 | A池最低好评率 (默认40) |
| poolA_minReviews | number | 否 | A池最低评价数 (默认50) |
| poolA_minYear | number | 否 | A池最早发布年份 (默认2024) |
| poolB_minRating | number | 否 | B池最低好评率 (默认40) |
| poolB_minReviews | number | 否 | B池最低评价数 (默认50) |
| poolC_minRating | number | 否 | C池最低好评率 (默认40) |
| poolC_maxRating | number | 否 | C池最高好评率 (默认74) |
| poolC_minReviews | number | 否 | C池最低评价数 (默认50) |
| sortBy | string | 否 | 排序：wilson/rating/reviews/date |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 (默认24, 最大50) |
| yearsFilter | number | 否 | 发布年份筛选 |
| minReleaseDate | string | 否 | 最早发布日期 (yyyy-MM-dd) |
| maxReleaseDate | string | 否 | 最晚发布日期 (yyyy-MM-dd) |
| priceMin | number | 否 | 最低价格 (单位：分) |
| priceMax | number | 否 | 最高价格 (单位：分) |
| excludeTestVersions | boolean | 否 | 排除测试版 (默认true) |
| reviewSource | string | 否 | 评价来源：all/cn/overseas (默认all) |
| statsOnly | boolean | 否 | 仅返回统计数据 |
| modernTagFilter | string | 否 | 现代标签筛选：hasCore/hasModern |
| featureTagFilter | string[] | 否 | 特色标签筛选（支持多选） |
| tagSortBy | string | 否 | 标签排序：count/innovation (默认count) |

---

### 6. POST /api/analysis/module

单模块 AI 分析接口（按需分析单个模块）

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gameId | string | 是 | 游戏 ID |
| module | string | 是 | 分析模块类型 |

**module 可选值**：

| 值 | 说明 | 推荐池 |
|------|------|--------|
| verdict | 一句话总结 | A/B/C |
| coreGameplay | 核心玩法 | A/B/C |
| battleSystem | 战斗系统 | A/B |
| differentiation | 差异化创新 | B |
| negativeFeedback | 差评分析 | C |
| designSuggestions | 设计建议 | A/B/C |

**返回数据结构**：
```typescript
{
  gameId: string;
  module: string;
  result: any;
  generatedAt: string;
}
```

---

## 类型定义

### Game 类型

```typescript
interface Game {
  id: string;
  name: string;
  steamAppId: string;
  description: string;
  shortDescription?: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  categories?: string[];
  releaseDate: string | null;
  price: number;
  metacriticScore: number | null;
  steamReviews: SteamReviews | null;
  headerImage: string | null;
  screenshots: string[];
  estimatedOwners?: number;
  estimatedOwnersMin?: number;
  estimatedOwnersMax?: number;
  peakCCU?: number;
  isFree?: boolean;
  steamUrl?: string;
  searchMatchHints?: string[];
  // 宝可梦Like相关
  isPokemonLike?: boolean;
  pokemonLikeTags?: string[];
  // 威尔逊得分
  wilsonScore?: number;
  pool?: "A" | "B" | "C" | null;
  // 标签权重（预计算字段）
  coreTagCount?: number;
  secondaryTagCount?: number;
  modernTagCount?: number;
  tagWeight?: number;
  matchedCoreTags?: string[];
  matchedSecondaryTags?: string[];
  matchedModernTags?: string[];
  uniqueFeatureTags?: string[];
  differentiationLabels?: string[];
  // LLM融合玩法分析（预计算字段）
  llmMechanics?: string[];
  llmRawMechanics?: string[];
  llmMechanicsSummary?: string;
  // 测试版标识（预计算字段）
  isTestVersion?: boolean;
  testVersionType?: string;
  // 回合制标识（预计算字段）
  isTurnBased?: boolean;
  // 区域评价数据（预计算字段，来自 precompute.py 的 transform_game）
  cnReviews?: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  overseasReviews?: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
    reviewScoreDescription: string;
  } | null;
  // 区域威尔逊得分（预计算字段）
  cnWilsonScore?: number;
  overseasWilsonScore?: number;
}
```

### PokemonLikeAnalysis 类型

宝可梦Like游戏分析结果，包含核心玩法、战斗系统、差异化等维度的详细分析。

```typescript
interface PokemonLikeAnalysis {
  id: string;
  gameId: string;
  gameName: string;
  generatedAt: string;
  pool: "A" | "B" | "C" | null;  // 所属池子
  verdict: string;                // 整体评价
  coreGameplay: CoreGameplayResult;     // 核心玩法
  battleSystem: BattleSystemResult;     // 战斗系统
  differentiation: DifferentiationResult; // 差异化创新
  negativeFeedback: NegativeFeedbackResult; // 差评分析
  designSuggestions: DesignSuggestionsResult; // 设计建议
  referenceValue: ReferenceValue; // 参考价值
}

interface ReferenceValue {
  forPoolA: number;
  forPoolB: number;
  forPoolC: number;
  overallScore: number;
}
```

---

## 变更日志

### 2026-04-28 - v1.18.0

- **LLM标签全量采集完成 + 质量复审通过**：A池633款+B池94款全部完成，零失败。模式2标签质量复审综合评分8/10。详见《池子创新标签质量审核报告 v2.0.0》
- **修复**：批量采集脚本日志输出 UnicodeEncodeError 崩溃问题
- **池子条件放宽**：A池(633款)：好评率>=40%、评论数>=50、上线>=2024；B池(94款)：好评率>=40%、评论数>=50；C池(0款，因条件放宽被B池覆盖）

### 2026-04-28 - v1.16.0

- **翻译层彻底简化**：删除 `tag-translator.ts`（整个文件），删除 `page.tsx` 中200+行的 `TAG_TRANSLATIONS`，删除 `route.ts` 中60+行的 `TAG_CHINESE_NAMES`，合并翻译表为单一源。Python端：删除200+行的 `COMMON_TAG_TRANSLATIONS`，翻译完全交给LLM，Python只做验证（是否包含中文字符）。`mode2` 页面 JS 从 17.3kB 降至 15.4kB

### 2026-04-28 - v1.14.0

- **模式2英文标签翻译改进**：扩展 `tag-translator.ts` 的 `essentialTranslations` 翻译映射表（约200+个标签），新增 `cleanTag` 函数处理复杂格式标签（移除括号内容、中英混合标签）。扩展 `route.ts` 的 `TAG_CHINESE_NAMES` 映射表。扩展前端 `page.tsx` 的 `TAG_TRANSLATIONS` 映射表（约150+个标签），支持大小写不敏感匹配

### 2026-04-28 - v1.13.2

- **Bug修复：BLACKLIST_TAGS 过于严格导致游戏被误排除**：修复 B 池游戏数量为0的根本原因。问题：BLACKLIST_TAGS 包含 "Board Game"，使用子串匹配（`includes`），导致所有包含 "board game" 的游戏被排除在所有池子之外。修复：清理 BLACKLIST_TAGS，只保留 NSFW/Hentai 等真正有问题的标签，移除 Board Game / Grand Strategy / 4X Strategy / Text-Based 等过于宽泛的标签

### 2026-04-28 - v1.13.1

- **Bug修复：创新标签数量异常**：修复 featureTagOptions 只有10个标签的问题。根本原因：① INNOVATION_BLACKLIST 包含了大量创新玩法标签，② `precompute.py` 的 `calculate_feature_tag_options()` 使用硬编码的10个标签。修复：① 清理 INNOVATION_BLACKLIST，只保留品类标配标签；② 重写 `calculate_feature_tag_options()` 从 `combinedMechanics.json` 的 rawTagStats 动态加载所有标签；③ 重新运行预计算生成108个标签

### 2026-04-28 - v1.13.0

- **标签体系三端统一重构**：构建单一配置源 `manage_tags.py --export-config` 生成 `tag-config.json`，统一管理同义词映射（92条）、黑名单（87个）、核心标签（10个）、分组分类（22个）。消除 `manage_tags.py`、`precompute.py`、`route.ts` 三处重复定义

### 2026-04-28 - v1.12.1

- **聚类脚本 LLM 语义分析升级**：分11批调用 Gemini 对 207 个自由标签进行语义归类。聚类结果：41个归入标准分类、49个归入16个新分类（战斗策略/养成方式/叙事驱动/探索方式/多人社交等）、70个标记为噪声丢弃。人工审查回收 33 个高价值标签

### 2026-04-28 - v1.12.0

- **融合标签开放化**：融合玩法标签从"固定封闭标签"升级为"开放自由标签 + 定期聚类归类"双层架构。`analyze_mechanics.py` 允许 LLM 自由发明新标签（最多6个），新增 `cluster_tags.py` 聚类脚本将相似标签归入标准分类

### 2026-04-28 - v1.11.0

- **融合标签质量重构（Phase 1+2）**：第一性原理审查发现旧标签体系存在根本缺陷——66%游戏被标"探索冒险"（任何RPG标配）、52%被标"战棋策略"（核心玩法非融合玩法）、37%被标"像素风格"（美术≠机制）。重写 `analyze_mechanics.py` prompt，重新设计标签体系（丢弃探索冒险/战棋策略/像素风格，保留肉鸽融合/牌组构建/形态融合等具体机制标签），实现二次置信度验证（两模型交叉验证）

### 2026-04-28 - v1.10.0

- **融合创新标签重构**：新增 `analyze_mechanics.py` 脚本，对 B 池 67 款游戏进行 LLM 融合玩法分析，生成真实的"融合了什么玩法"标签（形态融合、肉鸽融合、牌组构建等），替代原有的 Steam 标签频率统计。新增 `combinedMechanics.json` 数据文件

### 2026-04-28 - v1.9.0

- **特色标签优化**：基于 B 池游戏标签频率分析（68款），重新设计特色标签筛选系统。优化后特色标签在 B 池覆盖率从平均 5% 提升至 28%

### 2026-04-28 - v1.8.2

- **Bug修复**：修复模式1搜索去重逻辑优先保留测试版而非正式版的问题。当同一游戏同时存在正式版和测试版时，去重逻辑原本优先保留玩家数最多的版本，导致测试版被错误保留。修复：去重时优先判断是否为正式版/测试版，保留正式版

### 2026-04-28 - v1.8.1

- **Bug修复**：修复模式2特色标签筛选失效问题。SQLite 数据库不存储 `featureTagOptions` 字段，导致从 SQLite 加载时该字段为空数组。新增 `loadFeatureTagOptionsFromJson()` 函数从 JSON 缓存补充读取

### 2026-04-28 - v1.8.0

- **性能优化**：新增 `build-cache-db.py` 将 336MB JSON 转换为 SQLite 数据库，解决 Zeabur 部署时 OOM 问题。API 优先从 SQLite 查询，失败自动降级 JSON

### 2026-04-17 - v1.7.1

- **界面更新**：将首页标题从"回合制战斗分析工具"更改为"Steam全域游戏搜索"，统一产品名称，提升品牌一致性

### 2026-04-17 - v1.6.1

- **修复**：模式2/对比页UI组件路径别名 `@/lib/utils` 在Docker构建时无法解析
- **新增**：`fetch_regional_reviews.py` 区域评价采集脚本，支持采集国内/海外评价
- **优化**：`precompute.py` 支持预计算 cnReviews、overseasReviews 及区域威尔逊得分
- **优化**：模式2前端根据选择显示国内/海外评价数据

### 2026-04-16 - v1.6.0

- **新增**：模式2重构，引入"宝可梦Like标签"筛选选项
- **新增**：`PokemonLikeAnalysis` 类型定义，包含完整的分析数据结构
- **新增**：4个分析维度展示组件：`core-gameplay`、`battle-system-view`、`differentiation-view`、`negative-feedback`、`design-suggestions`
- **新增**：`chatPokemonLikeAnalysis` LLM提示词，支持多维度分析输出
- **新增**：`analysis-detail` 页面展示完整分析结果
- **优化**：battle-mechanics、strategic-depth、innovation、analysis-narrative等图表
- **C池**：新增特色标签C档分类筛选

- **新增**：`scripts/unified_workflow.py` - 增量采集+标签补全+SQLite同步+预计算一键完成
- **优化**：采集效率从每周8小时优化到4小时，新增6-7倍加速
- **优化**：标签补全多线程并发采集
- **新增**：`run-weekly-update.bat` 周更脚本合集
- **更新**：`数据采集维护文档.md` 更新至 v1.6.0

### 2026-04-14 - Bug修复

- **修复**：修复 `mode2/filter` API 因 TDZ 问题 `isTestVersion` 未定义导致 API 500错误
- **清理**：清理临时文件 `temp_*.js`、`scripts/` 目录
- **清理**：清理遗留数据文件 `games.json`、`*-updated.json`
- **更新**：PROJECT.md 版本号更新

### 2026-04-10 - 数据优化

- **优化**：清理 `games-index.json` 中 `description` 字段重复数据
- **修复**：修复数据源问题
  - `games-index.json` (326 MB) - 原始数据
  - `games-meta.json` (342 MB) - 元数据

### 2026-04-10 - 初始数据导入

- 数据导入自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
- 覆盖率 93% 的 description 字段，1,320 个游戏描述待补充
