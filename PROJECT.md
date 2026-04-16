# Steam 全域游戏搜索

> **版本**: v1.6.0
> **更新日期**: 2026-04-16
>
> **版本变更说明**:
> - v1.6.0: **游戏分析功能完全重写**：从"通用回合制战斗系统分析"转向"宝可梦Like游戏专项评估"。新增核心玩法、差异化创新、差评分析、设计建议等分析模块；针对三池(A/B/C)提供差异化的分析侧重点；C池重点展示差评分析和避坑指南。
> - v1.5.4: **标签排重修复**：修复特色标签筛选时卡片上同时显示中英文重复标签的问题。

## 项目概述

一个基于 AI 的回合制游戏战斗系统分析工具，用于分析 Steam 平台的回合制游戏，并通过 LLM 生成深度分析报告。支持三种模式：

- **模式1（主页）**：游戏搜索 + AI 战斗系统分析
- **模式2（筛选器）**：宝可梦Like游戏三池筛选系统
- **游戏对比**：多游戏多维度对比

### 核心功能

- **游戏搜索**：本地数据库包含 12.3 万 Steam 游戏，支持好评率、评价数、类型、发售日期筛选
- **AI 分析**：使用通义千问/Qwen 生成结构化战斗系统分析
- **宝可梦Like筛选**：三池系统（神作参考池 / 核心竞品池 / 避坑指南池）
- **可视化展示**：雷达图、流程图、截图画廊
- **游戏对比**：多游戏多维度评分对比

### 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 14 | 框架 (App Router) |
| TypeScript | 类型安全 |
| Tailwind CSS | 样式 |
| Radix UI | UI 组件 |
| Recharts + Mermaid | 图表 |
| Zustand | 状态管理 |
| SWR | 数据获取 |

---

## 项目结构

```
Steam全域游戏搜索/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 首页（模式1）
│   │   ├── mode2/page.tsx     # 模式2：宝可梦Like筛选器
│   │   ├── analysis/[id]/     # 分析详情页
│   │   ├── compare/           # 对比页
│   │   └── api/              # API Routes
│   │       ├── games/        # 游戏搜索/详情 API
│   │       ├── mode2/filter/ # 模式2筛选 API
│   │       └── analysis/    # AI分析生成 API
│   ├── components/
│   │   ├── ui/              # UI基础组件
│   │   ├── search/          # 搜索组件
│   │   ├── analysis/        # 分析组件
│   │   ├── charts/          # 图表组件
│   │   └── media/           # 媒体组件
│   ├── lib/
│   │   ├── steam.ts         # Steam API
│   │   ├── llm.ts           # LLM API (通义千问/OpenAI)
│   │   └── utils.ts         # 工具函数
│   └── types/
│       └── game.ts          # 类型定义
├── public/data/              # 静态数据
│   ├── games-index.json    # 搜索索引 (311 MB, 125,095 条)
│   └── games-meta.json     # 详情补充 (342 MB)
├── prisma/
│   └── schema.prisma        # 数据库 Schema (可选)
└── package.json
```

---

## 数据源

数据来自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)（Hugging Face）：

- **12.5 万条** Steam 游戏
- **91.9%** 有评价数据
- **99.9%** 有 header_image 封面图

数据文件通过 Steam Store API 持续补充更新，使用统一工作流 `scripts/unified_workflow.py` 自动化执行（定时任务每周日02:00），包含增量采集、标签补全、SQLite同步、预计算缓存生成。

---

## 环境变量

创建 `.env` 文件：

```env
DATABASE_URL="file:./dev.db"

# 站点基础 URL
NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# LLM 配置 (通义千问)
LLM_PROVIDER=qianwen
DASHSCOPE_API_KEY=your_api_key_here
LLM_MODEL_QIANWEN=qwen3.6-plus
LLM_BASE_URL_QIANWEN=https://dashscope.aliyuncs.com/compatible-mode/v1

# 或 OpenAI 备选
LLM_API_KEY=sk-...
LLM_BASE_URL_OPENAI=https://api.openai.com/v1
LLM_MODEL_OPENAI=gpt-4o-mini
```

---

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 生产启动
npm start

# 清理 Next.js 缓存
npm run clean
```

---

## API 文档

### 1. GET /api/games/search

游戏搜索接口。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 否 | 搜索关键词 |
| genre | string | 否 | 类型筛选（可多次） |
| minRating | number | 否 | 最低好评率 (0-100) |
| minReviews | number | 否 | 最低评价数 |
| sortBy | string | 否 | 排序: rating/reviews/date/name |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 (默认1) |
| pageSize | number | 否 | 每页数量 (默认20, 最大50) |

**类型筛选值**（基于 tags 和 genres 字段）：
- `回合制` - Turn-Based, Turn-Based Strategy, Turn-Based Tactics, Turn-Based Combat
- `RPG` - RPG, JRPG, Action RPG, Adventure
- `SRPG` - Strategy RPG, Tactical RPG
- `策略` - Strategy, Grand Strategy, Real Time Tactics, Tactical, 4X
- `卡牌` - Card Game, Deckbuilding, Collectible Card Game

---

### 2. GET /api/games/:id

获取游戏详情。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 游戏 ID (AppId) 或名称 |
| full | boolean | 否 | 是否加载完整描述 (默认 false) |

---

### 3. GET /api/analysis/generate

生成游戏战斗系统分析。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gameId | string | 二选一 | 游戏 ID (优先) |
| gameName | string | 二选一 | 游戏名称 |

---

### 4. GET /api/mode2/filter

宝可梦Like游戏筛选 API。

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| pool | string | 池子筛选 (A/B/C，可多次) |
| poolA_minRating | number | A池好评率下限 (默认75) |
| poolA_minReviews | number | A池最低评价数 (默认50) |
| poolB_minRating | number | B池好评率下限 (默认75) |
| poolB_minReviews | number | B池最低评价数 (默认50) |
| poolC_minRating | number | C池好评率下限 (默认40) |
| poolC_maxRating | number | C池好评率上限 (默认74) |
| poolC_minReviews | number | C池最低评价数 (默认50) |
| sortBy | string | 排序: wilson/rating/reviews/date |
| sortOrder | string | asc/desc |
| page | number | 页码 |
| pageSize | number | 每页数量 |
| yearsFilter | number | 只显示最近N年内上线 |
| minReleaseDate | string | 最早发售日期 (yyyy-MM-dd) |
| maxReleaseDate | string | 最晚发售日期 (yyyy-MM-dd) |
| excludeTestVersions | boolean | 过滤测试版 (默认true) |
| statsOnly | boolean | 仅返回统计信息 |

---

## 核心类型

### Game 接口

```typescript
interface Game {
  id: string;
  name: string;
  steamAppId: string;
  description: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  categories: string[];
  tags: string[];
  releaseDate: string | null;
  isFree: boolean;
  price: number;
  metacriticScore: number | null;
  estimatedOwners: number;
  peakCCU: number;
  steamReviews: SteamReviews | null;
  headerImage: string | null;
  screenshots: string[];
  steamUrl: string;
  isTestVersion: boolean;
  isPokemonLike?: boolean;
  pokemonLikeTags?: string[];
  wilsonScore?: number;
  pool?: "A" | "B" | "C" | null;
}
```

### PokemonLikeAnalysis 接口

宝可梦Like游戏专项分析类型（服务于模式2的三池筛选系统）：

```typescript
interface PokemonLikeAnalysis {
  id: string;
  gameId: string;
  gameName: string;
  generatedAt: string;
  pool: "A" | "B" | "C" | null;  // 池子归属
  verdict: string;                // 一句话总结
  coreGameplay: CoreGameplay;     // 核心玩法描述
  battleSystem: BattleSystem;     // 战斗系统评估
  differentiation: Differentiation; // 差异化创新点
  negativeFeedback: NegativeFeedback; // 差评分析
  designSuggestions: DesignSuggestions; // 设计建议
  referenceValue: ReferenceValue; // 参考价值评分
}
```

---

## 更新日志

### 2026-04-16 - 游戏分析功能完全重写

- **重构**：游戏分析从"通用回合制战斗系统分析"转向"宝可梦Like游戏专项评估"
- **新增**：`PokemonLikeAnalysis` 类型定义，包含核心玩法、差异化创新、差评分析、设计建议等模块
- **新增**：4个新分析组件（`core-gameplay`、`battle-system-view`、`differentiation-view`、`negative-feedback`、`design-suggestions`）
- **新增**：`chatPokemonLikeAnalysis` LLM专用提示词，针对三池特点提供差异化分析
- **优化**：`analysis-detail` 组件重写，展示池子归属标识和参考价值评分
- **删除**：旧分析组件（battle-mechanics、strategic-depth、innovation、analysis-narrative）
- **C池重点**：差评分析和设计缺陷警示

- **新增**：`scripts/unified_workflow.py` - 合并增量采集+标签补全+SQLite同步+预计算为一条命令
- **优化**：多线程并发采集（详情8并发、标签4并发），约提升6-7倍速度
- **优化**：检查点机制，支持中断续传
- **简化**：`run-weekly-update.bat` 从3步简化为1步
- **更新**：`数据采集维护文档.md` 更新至 v1.5.2

### 2026-04-14 - Bug修复与项目清理

- **修复**：修复 `mode2/filter` API 的 TDZ 错误（`isTestVersion` 命名冲突导致 API 500）
- **清理**：删除所有临时脚本（`temp_*.js`、`scripts/` 目录）
- **清理**：删除过时数据文件（`games.json`、`*-updated.json`、备份文件）
- **更新**：精简 PROJECT.md 文档

### 2026-04-10 - 索引文件缺陷修复（混合方案）

- **问题**：原索引文件 `games-index.json` 缺少 `description` 字段
- **解决**：采用混合方案
  - `games-index.json` (326 MB) - 搜索索引
  - `games-meta.json` (342 MB) - 详情补充

### 2026-04-10 - 新数据集接入

- 切换到 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
- 新数据集包含 93% 完整 description，平均 1,320 字符
