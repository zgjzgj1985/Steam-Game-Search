# Steam 全域游戏搜索

> **版本**: v1.27.0
> **更新日期**: 2026-05-11

> **版本历史**:
> - v1.27.0: **文档二次审核精简**：① 归档 `LLM语义分析方案.md`（从未实施）和 `数据采集维护文档.md` 到 `docs/archive/`；② 精简 `标签采集思路.md`（移除历史诊断章节，381行→236行）；③ 精简 `模式2.md`（移除原始设计章节，135行→54行）；④ 精简 `README.md` 项目结构章节。
> - v1.26.0: **文档全面审核与整合**：① 归档 `数据采集维护文档.md`（v1.12.0）至 `docs/archive/`；② 归档 `LLM语义分析方案.md`（从未实施）至 `docs/archive/`；③ 精简 `标签采集思路.md`，移除已修复的历史诊断内容；④ 归档早期变更日志（v1.0-v1.18）至 `CHANGELOG-HISTORY.md`；⑤ 修正 PROJECT.md 目录树，补充遗漏文件；⑥ 统一 docs/ 文件命名。
> - v1.25.0: **补充 NSFW 描述黑名单 + 回合制运行时兜底**：① 新增 `BLACKLIST_DESC_KEYWORDS`（16个NSFW成人内容描述关键词），`isBlacklisted()` 函数增加描述兜底检测，解决 Steam 标签不准确时仍有133个A池游戏含NSFW内容的问题。② JSON 缓存加载路径增加 `isTurnBased` 运行时兜底检测，解决预计算时描述关键词覆盖不足导致回合制游戏漏判的问题。涉及文件：`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`、`docs/PROJECT.md`、`docs/模式2.md`。
> - v1.24.0: **全面审核 A/B/C 池筛选规则，补充宝可梦Like描述关键词**：基于 B 池游戏描述分析，新增 6 个描述关键词：`creature collection`、`monster training`、`monster trainer`、`creature collecting`、`培养怪物`、`驯养`。涉及文件：`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。
> - v1.23.0: **A池筛选新增好评率 90% 档位和评论数 1500、2000 档位**：前端模式2页面 A 池好评率下拉新增 90% 选项，评论数下拉新增 1500、2000 选项。涉及文件：`src/app/mode2/page.tsx`。
> - v1.22.0: **分析结果持久化**：新增分析结果持久化存储功能。创建 `public/data/analyses.json` 作为分析结果存储文件；修改 `/api/analysis/module` POST 接口，分析完成后自动保存结果到 `analyses.json`；新增 `/api/analysis/:gameId` GET 接口，查询指定游戏的已保存分析结果；修改 `ModularAnalysis` 组件，进入分析页面时自动加载已保存的分析结果，并显示"已加载历史分析"标识；按钮文案根据状态动态变化（"一键分析"/"继续分析"/"分析完成"）。涉及文件：`public/data/analyses.json`（新增）、`src/app/api/analysis/module/route.ts`、`src/app/api/analysis/[gameId]/route.ts`（新增）、`src/components/analysis/modular-analysis.tsx`。
> - v1.21.0: **分析模块元数据增强**：为详细分析页面的6个分析模块增加信息来源标识、置信度标识及其他有价值信息。包括：更新 `Result` 接口添加 `AnalysisMetadata` 字段（sourceOfTruth、confidence、basedOnReviews、analysisDate、wordCount、keyInsights、dataQuality）；更新 LLM 提示词要求每个模块输出元数据；API层增加数据质量提示（根据评价数量自动判断置信度）；创建共享元数据展示组件 `analysis-metadata-badge.tsx`；升级6个展示组件（verdict、coreGameplay、battleSystem、differentiation、negativeFeedback、designSuggestions），增加置信度徽章、评价数量、数据质量标签。涉及文件：`src/types/game.ts`、`src/lib/llm.ts`、`src/app/api/analysis/module/route.ts`、`src/components/analysis/analysis-metadata-badge.tsx`（新增）、`src/components/analysis/modular-analysis.tsx`、`src/components/analysis/core-gameplay.tsx`、`src/components/analysis/battle-system-view.tsx`、`src/components/analysis/differentiation-view.tsx`、`src/components/analysis/negative-feedback.tsx`、`src/components/analysis/design-suggestions.tsx`。
> - v1.20.0: **文档全面审核与修复**：系统性审核 PROJECT.md，发现并修复大量陈旧内容。包括：API接口文档新增 `/api/games` 兼容层和 `/api/analysis/module` POST接口；修正 mode2/filter 默认值（poolA/B minRating=40→90）；补充缺失参数（poolA_minYear、priceMin/Max、modernTagFilter、featureTagFilter、tagSortBy、statsOnly）；更新 Game 类型定义（修正必填/可选、补充预计算字段、补充 cnReviews/overseasReviews）；更新项目结构目录树。
> - v1.19.0: **筛选机制重构 + 池子条件收紧**：威尔逊得分替代好评率作为池子排序基准；API默认值收紧至 A池≥90%/评论数≥2000、B池≥85%/评论数≥500。涉及文件：`scripts/precompute.py`、`src/app/api/mode2/filter/route.ts`。
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

*(以下目录结构由 scripts/doc_sync.py 自动生成，请勿手动修改)*

## 完整目录结构

<!-- AUTO_START:dir_tree -->
```
# 项目根目录
Steam全域游戏搜索/
├── src/                  # Next.js 源代码
├── public/               # 公开资源
├── scripts/              # Python/JS 脚本（36个）
├── prisma/               # Prisma Schema
├── docs/                 # 项目文档
├── docs/archive/         # 已归档文档
├── .cursor/rules/        # Cursor AI 规则
├── package.json
├── package-lock.json
├── next.config.js
├── tsconfig.json
├── .env.example
├── .gitignore
├── .gitattributes
│
├── src/
│   ├── app/                  # App Router 页面
│   ├── components/           # React 组件
│   ├── lib/                  # 核心业务逻辑
│   ├── types/                # TypeScript 类型
│   ├── config/               # 前端配置
│   ├── __tests__/            # 测试文件
```
<!-- AUTO_END:dir_tree -->

---
## 脚本列表

<!-- AUTO_START:scripts -->
```
# Python/JS 脚本（按功能分组）

# --- Python 脚本 ---
# 为指定游戏生成6模块分析
#   scripts\analyze_specific_games.py (122行)

# Steam Game Data Backup Script
#   scripts\backup-data.py (157行)

# A 池游戏 LLM 标签批量生成脚本
#   scripts\batch_generate_llm_tags.py (605行)

# 模式2批量LLM分析脚本 v2（高效并发版）
#   scripts\batch_mode2_analysis.py (752行)

# 模式2 宝可梦Like 轻量级批量判定脚本
#   scripts\batch_pokemon_like_judge.py (474行)

# Check Data
#   scripts\check_data.py (24行)

# 配置文件 - 统一定义所有脚本使用的路径和常量
#   scripts\config.py (47行)

# 将 HuggingFace parquet 数据集转换为 games-index.json 格式
#   scripts\convert_parquet.py (218行)

# 数据处理工具 - JSON加载保存、数据规范化、日期解析等
#   scripts\data_utils.py (426行)

# 数据库工具 - SQLite 数据库操作
#   scripts\db_utils.py (336行)

# 删除不满足条件的分析文档（精确匹配版）
#   scripts\delete_invalid_docs.py (145行)

# 文档自动同步脚本 - 自动扫描代码结构并同步到 PROJECT.md
#   scripts\doc_sync.py (1247行)

# 采集P0: 为2024+零评价有类型有标签的游戏批量获取评价数
#   scripts\fetch_p0_v2.py (180行)

# 从 analyses.json 生成宝可梦Like游戏详细分析文档
#   scripts\generate_analysis_docs.py (726行)

# 增量写入脚本 - 更新SQLite数据库中的游戏数据
#   scripts\incremental_update.py (97行)

# 日志工具 - 统一的日志输出函数
#   scripts\logging_utils.py (43行)

# 标签管理脚本
#   scripts\manage_tags.py (650行)

# 预计算缓存生成脚本
#   scripts\precompute.py (1119行)

# 重新生成缺失的文档
#   scripts\regenerate_missing_docs.py (283行)

# 重命名文档以正确匹配游戏名
#   scripts\rename_docs.py (62行)

# Steam 用户标签补全脚本（多线程版）
#   scripts\scrape_tags_for_missing.py (177行)

# 配置Windows定时任务 - 每周自动更新Steam游戏数据
#   scripts\setup-scheduler.py (100行)

# Steam API 工具 - Steam API 请求封装
#   scripts\steam_api.py (205行)

# SQLite 数据同步脚本
#   scripts\sync_json_to_sqlite.py (124行)

# SQLite 数据同步脚本 - 自包含版本，使用正确的项目路径
#   scripts\sync_to_sqlite_standalone.py (321行)

# Steam游戏数据统一工作流 - 一键完成全量更新
#   scripts\unified_workflow.py (838行)

# --- JavaScript 脚本 ---
# ============ 配置 ============
#   scripts\batch-analyze-mode2.ts (347行)

# 加载B池153款游戏数据
#   scripts\check_b_pool_analysis.js (61行)

# 威尔逊得分计算
#   scripts\filter_b_pool.js (268行)

# 获取项目根目录
#   scripts\fix-bio-collection.js (235行)

# 匹配 "#### 生物收集\ntrue\n" 模式（换行符可能是 \r\n 或 \n）
#   scripts\remove-true.js (68行)

# 1. 检查源文件是否存在
#   scripts\update-data.ts (59行)

```
<!-- AUTO_END:scripts -->
## API 接口

<!-- AUTO_START:api -->
### /analysis/[gameId]

**方法**: `GET` | **文件**: `src\app\api\analysis\[gameId]\route.ts`

获取游戏已保存的分析结果


### /analysis/generate

**方法**: `GET` | **文件**: `src\app\api\analysis\generate\route.ts`

分析生成 API


### /analysis/module

**方法**: `POST` | **文件**: `src\app\api\analysis\module\route.ts`

单模块分析 API


### /games/[id]

**方法**: `GET` | **文件**: `src\app\api\games\[id]\route.ts`

游戏详情 API（本地数据库 + 混合加载）


### /games

**方法**: `GET` | **文件**: `src\app\api\games\route.ts`

兼容旧版或外部脚本请求 GET /api/games?keyword=&page=…


### /games/search

**方法**: `GET` | **文件**: `src\app\api\games\search\route.ts`

本地游戏数据库搜索 API


### /mode2/analyze

**方法**: `POST/PUT` | **文件**: `src\app\api\mode2\analyze\route.ts`

模式2: 宝可梦Like语义分析API


### /mode2/filter

**方法**: `GET` | **文件**: `src\app\api\mode2\filter\route.ts`

模式2: 宝可梦Like游戏筛选API


<!-- AUTO_END:api -->

---

## 组件清单

<!-- AUTO_START:components -->
#### `analysis/`
- `Analysis Metadata Badge` - analysis metadata badge (127行)
- `Battle System View` - battle system view (142行)
- `Categories` - categories (39行)
- `Client Analysis Wrapper` - analysis wrapper (20行)
- `Core Gameplay` - core gameplay (124行)
- `Design Suggestions` - design suggestions (198行)
- `Differentiation View` - differentiation view (138行)
- `Game Info` - 游戏详情 Hero 区域 (220行)
- `Modular Analysis` - modular analysis (313行)
- `Negative Feedback` - negative feedback (150行)

#### `charts/`
- `Battle Flow` - battle flow (152行)
- `Comparison Chart` - comparison chart (71行)
- `Radar Chart` - 战斗系统评分雷达图组件 (83行)

#### `media/`
- `Gallery` - gallery (120行)

#### `search/`
- `Featured Games` - featured games (20行)
- `Game Card` - game card (344行)
- `Game Search` - game search (685行)

#### `ui/`
- `Badge` - badge (21行)
- `Button` - button (45行)
- `Card` - card (38行)
- `Expandable Section` - 内容块容器 (189行)
- `Hero` - hero (49行)
- `Input` - input (23行)
- `Rich Text` - 智能文本渲染器 (209行)
- `Tabs` - tabs (72行)

<!-- AUTO_END:components -->

---

## 核心库

<!-- AUTO_START:lib -->
- `analysis-engine.ts` - 生成宝可梦Like游戏专项分析 (261行)
- `analyze-cache.ts` - 模式2: LLM分析结果持久化缓存管理 (406行)
- `db.ts` - db (13行)
- `filter-cache.ts` - 模式2前端筛选缓存管理器 (707行)
- `llm.ts` - 单模块分析的提示词模板 (503行)
- `steam-header-image.ts` - 解析 Steam 商店头图 URL。 (21行)
- `steam.ts` - 受限制的 fetch：速率限制 + 429 自动重试 (903行)
- `tag-config.ts` - 标签配置模块（前端与后端共享） (201行)
- `utils.ts` - utils (6行)
<!-- AUTO_END:lib -->

---

## 类型定义

<!-- AUTO_START:types -->
- `game.ts` - 游戏基础数据类型 (331行)
<!-- AUTO_END:types -->

---

## 配置文件

<!-- AUTO_START:config -->
- `pokemonLikeKeywords.json` - pokemonLikeKeywords (173行)
<!-- AUTO_END:config -->

---

## 数据文件

<!-- AUTO_START:data -->
- `analyses.json` - 分析结果存储文件 (9.0 MB)
- `combinedMechanics.json` - combinedMechanics (1.5 MB)
- `games-cache.db` - 预计算缓存数据 (134.1 MB)
- `games-cache.db-shm` - 预计算缓存数据 (288.0 KB)
- `games-cache.db-wal` - 预计算缓存数据 (135.2 MB)
- `games-cache.json` - 预计算缓存数据 (348.7 MB)
- `games-index-filtered.json` - games-index-filtered (279.4 MB)
- `games-index.json` - 游戏索引文件 - 快速检索 (319.8 MB)
- `games-index.json.all_backup` - games-index.json (311.2 MB)
- `games-index.json.ext_backup` - games-index.json (311.1 MB)
- `games-index.json.incr_backup` - games-index.json (319.0 MB)
- `games-index.json.last_run` - games-index.json (65 B)
- `games-index.json.p0_backup` - games-index.json (310.9 MB)
- `games-index.json.regional_backup` - games-index.json (383.4 MB)
- `games-index.json.unified_backup` - games-index.json (319.8 MB)
- `games-meta.json` - 游戏元数据文件 - 完整描述 (326.8 MB)
- `games.db` - games (385.4 MB)
- `mode2-analysis-cache.json` - mode2-analysis-cache (202.2 KB)
- `pokemon-like-judge-cache.json` - pokemon-like-judge-cache (1.3 KB)
- `regional-reviews-checkpoint.json` - regional-reviews-checkpoint (17.8 MB)
- `regional-reviews-state.json` - regional-reviews-state (190 B)
- `regional-reviews.json` - regional-reviews (23.6 MB)
- `scraped-tags.json` - scraped-tags (757.5 KB)
- `tags-scrape-state.json` - tags-scrape-state (730.2 KB)
<!-- AUTO_END:data -->

---

## 页面清单

<!-- AUTO_START:pages -->
- `/` - 页面 (`src\app\page.tsx`, 92行)
- `/analysis/[id]` - 页面 (`src\app\analysis\[id]\page.tsx`, 68行)
- `/compare` - 页面 (`src\app\compare\page.tsx`, 129行)
- `/mode2` - A池 (`src\app\mode2\page.tsx`, 2259行)
<!-- AUTO_END:pages -->

---

## 统计摘要

<!-- AUTO_START:stats -->
## 统计摘要

| 类别 | 数量 | 行数/大小 |
|------|------|--------|
| 脚本 | 32 | 22421 行 |
| API 路由 | 8 | 4788 行 |
| 组件 | 25 | 3592 行 |
| 核心库 | 9 | 3021 行 |
| 类型定义 | 1 | 331 行 |
| 配置文件 | 1 | 173 行 |
| 页面 | 4 | 2548 行 |
| 数据文件 | 24 | 3938.6 MB |

> 生成时间: 2026-05-11 14:46:00
<!-- AUTO_END:stats -->