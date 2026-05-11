# 历史版本变更记录

> **说明**：v1.0 - v1.18 的变更记录已归档至此。最新变更请参阅 [PROJECT.md](./PROJECT.md) 中的「变更日志」章节。

---

## v1.18.0 - 2026-04-28

- **LLM标签全量采集完成 + 质量复审通过**：A池633款+B池94款全部完成，零失败。模式2标签质量复审综合评分8/10。详见《池子创新标签质量审核报告 v2.0.0》
- **修复**：批量采集脚本日志输出 UnicodeEncodeError 崩溃问题
- **池子条件（预计算阶段）**：A池(633款)：好评率≥40%、评论数≥50、上线≥2024；B池(94款)：好评率≥40%、评论数≥50

## v1.16.0 - 2026-04-28

- **翻译层彻底简化**：删除 `tag-translator.ts`（整个文件），删除 `page.tsx` 中200+行的 `TAG_TRANSLATIONS`，删除 `route.ts` 中60+行的 `TAG_CHINESE_NAMES`，合并翻译表为单一源。Python端：删除200+行的 `COMMON_TAG_TRANSLATIONS`，翻译完全交给LLM，Python只做验证（是否包含中文字符）。`mode2` 页面 JS 从 17.3kB 降至 15.4kB

## v1.14.0 - 2026-04-28

- **模式2英文标签翻译改进**：扩展 `tag-translator.ts` 的 `essentialTranslations` 翻译映射表（约200+个标签），新增 `cleanTag` 函数处理复杂格式标签（移除括号内容、中英混合标签）。扩展 `route.ts` 的 `TAG_CHINESE_NAMES` 映射表。扩展前端 `page.tsx` 的 `TAG_TRANSLATIONS` 映射表（约150+个标签），支持大小写不敏感匹配

## v1.13.2 - 2026-04-28

- **Bug修复：BLACKLIST_TAGS 过于严格导致游戏被误排除**：修复 B 池游戏数量为0的根本原因。问题：BLACKLIST_TAGS 包含 "Board Game"，使用子串匹配（`includes`），导致所有包含 "board game" 的游戏被排除在所有池子之外。修复：清理 BLACKLIST_TAGS，只保留 NSFW/Hentai 等真正有问题的标签，移除 Board Game / Grand Strategy / 4X Strategy / Text-Based 等过于宽泛的标签

## v1.13.1 - 2026-04-28

- **Bug修复：创新标签数量异常**：修复 featureTagOptions 只有10个标签的问题。根本原因：① INNOVATION_BLACKLIST 包含了大量创新玩法标签，② `precompute.py` 的 `calculate_feature_tag_options()` 使用硬编码的10个标签。修复：① 清理 INNOVATION_BLACKLIST，只保留品类标配标签；② 重写 `calculate_feature_tag_options()` 从 `combinedMechanics.json` 的 rawTagStats 动态加载所有标签；③ 重新运行预计算生成108个标签

## v1.13.0 - 2026-04-28

- **标签体系三端统一重构**：构建单一配置源 `manage_tags.py --export-config` 生成 `tag-config.json`，统一管理同义词映射（92条）、黑名单（87个）、核心标签（10个）、分组分类（22个）。消除 `manage_tags.py`、`precompute.py`、`route.ts` 三处重复定义

## v1.12.1 - 2026-04-28

- **聚类脚本 LLM 语义分析升级**：分11批调用 Gemini 对 207 个自由标签进行语义归类。聚类结果：41个归入标准分类、49个归入16个新分类（战斗策略/养成方式/叙事驱动/探索方式/多人社交等）、70个标记为噪声丢弃。人工审查回收 33 个高价值标签

## v1.12.0 - 2026-04-28

- **融合标签开放化**：融合玩法标签从"固定封闭标签"升级为"开放自由标签 + 定期聚类归类"双层架构。`analyze_mechanics.py` 允许 LLM 自由发明新标签（最多6个），新增 `cluster_tags.py` 聚类脚本将相似标签归入标准分类

## v1.11.0 - 2026-04-28

- **融合标签质量重构（Phase 1+2）**：第一性原理审查发现旧标签体系存在根本缺陷——66%游戏被标"探索冒险"（任何RPG标配）、52%被标"战棋策略"（核心玩法非融合玩法）、37%被标"像素风格"（美术≠机制）。重写 `analyze_mechanics.py` prompt，重新设计标签体系（丢弃探索冒险/战棋策略/像素风格，保留肉鸽融合/牌组构建/形态融合等具体机制标签），实现二次置信度验证（两模型交叉验证）

## v1.10.0 - 2026-04-28

- **融合创新标签重构**：新增 `analyze_mechanics.py` 脚本，对 B 池 67 款游戏进行 LLM 融合玩法分析，生成真实的"融合了什么玩法"标签（形态融合、肉鸽融合、牌组构建等），替代原有的 Steam 标签频率统计。新增 `combinedMechanics.json` 数据文件

## v1.9.0 - 2026-04-28

- **特色标签优化**：基于 B 池游戏标签频率分析（68款），重新设计特色标签筛选系统。优化后特色标签在 B 池覆盖率从平均 5% 提升至 28%

## v1.8.2 - 2026-04-28

- **Bug修复**：修复模式1搜索去重逻辑优先保留测试版而非正式版的问题。当同一游戏同时存在正式版和测试版时，去重逻辑原本优先保留玩家数最多的版本，导致测试版被错误保留。修复：去重时优先判断是否为正式版/测试版，保留正式版

## v1.8.1 - 2026-04-28

- **Bug修复**：修复模式2特色标签筛选失效问题。SQLite 数据库不存储 `featureTagOptions` 字段，导致从 SQLite 加载时该字段为空数组。新增 `loadFeatureTagOptionsFromJson()` 函数从 JSON 缓存补充读取

## v1.8.0 - 2026-04-28

- **性能优化**：新增 `build-cache-db.py` 将 336MB JSON 转换为 SQLite 数据库，解决 Zeabur 部署时 OOM 问题。API 优先从 SQLite 查询，失败自动降级 JSON

## v1.7.1 - 2026-04-17

- **界面更新**：将首页标题从"回合制战斗分析工具"更改为"Steam全域游戏搜索"，统一产品名称，提升品牌一致性

## v1.6.1 - 2026-04-17

- **修复**：模式2/对比页UI组件路径别名 `@/lib/utils` 在Docker构建时无法解析
- **新增**：`fetch_regional_reviews.py` 区域评价采集脚本，支持采集国内/海外评价
- **优化**：`precompute.py` 支持预计算 cnReviews、overseasReviews 及区域威尔逊得分
- **优化**：模式2前端根据选择显示国内/海外评价数据

## v1.6.0 - 2026-04-16

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

## Bug修复 - 2026-04-14

- **修复**：修复 `mode2/filter` API 因 TDZ 问题 `isTestVersion` 未定义导致 API 500错误
- **清理**：清理临时文件 `temp_*.js`、`scripts/` 目录
- **清理**：清理遗留数据文件 `games.json`、`*-updated.json`
- **更新**：PROJECT.md 版本号更新

## 数据优化 - 2026-04-10

- **优化**：清理 `games-index.json` 中 `description` 字段重复数据
- **修复**：修复数据源问题
  - `games-index.json` (326 MB) - 原始数据
  - `games-meta.json` (342 MB) - 元数据

## 初始数据导入 - 2026-04-10

- 数据导入自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
- 覆盖率 93% 的 description 字段，1,320 个游戏描述待补充
