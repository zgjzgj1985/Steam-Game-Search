# Steam 全域游戏搜索

> **版本**: v1.7.0
> **更新日期**: 2026-04-17

> **版本历史**:
> - v1.7.0: **部署修复**：修复 Dockerfile 多阶段构建路径、public 目录复制、.dockerignore 排除配置、.gitattributes LFS 追踪、更新 zeabur.json 构建命令、新增 .env.deploy.example 统一环境变量模板
> - v1.6.1: **Docker构建修复**：模式2/对比页UI组件路径别名问题，新增 `fetch_regional_reviews.py` 区域评价采集脚本，`precompute.py` 支持区域数据预计算，模式2展示国内/海外评价对比
> - v1.6.0: **模式2重构**：新增"宝可梦Like标签"筛选选项，新增分析图表A/B/C池子分布统计
> - v1.5.4: **标签排重修复**：修复特色标签筛选时卡片重复显示标签问题
> - v1.5.3: **封面修复**：预计算优先使用JSON数据源，93,081个游戏封面恢复

## 项目简介

一个融合 AI 能力与 Steam 游戏数据的回合制游戏分析工具，提供 LLM 驱动的战斗系统深度分析。

- **模式1搜索**：关键词搜索 + AI 战斗系统分析
- **模式2宝可梦Like**：基于三池评分的专项筛选系统
- **游戏对比**：多款游戏综合对比分析

### 核心功能

- **数据规模**：本地数据库包含 12.3 万+ Steam 游戏
- **AI 分析**：通义千问/Qwen + OpenAI 双支持
- **宝可梦Like筛选**：A/B/C三池分类系统
- **区域评价**：国内/海外评价独立统计
- **可视化**：雷达图/柱状图/流程图/截图画廊
- **对比分析**：综合评分 + 详细数据对比

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

---

## 项目结构

```
Steam全域游戏搜索/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 模式1首页
│   │   ├── mode2/page.tsx     # 模式2宝可梦Like筛选
│   │   ├── analysis/[id]/     # 分析详情
│   │   ├── compare/           # 对比页
│   │   └── api/              # API Routes
│   │       ├── games/        # 游戏搜索/详情API
│   │       ├── mode2/filter/ # 模式2筛选API
│   │       └── analysis/     # AI分析API
│   ├── components/
│   │   ├── ui/              # UI基础组件
│   │   ├── search/          # 搜索组件
│   │   ├── analysis/        # 分析组件
│   │   ├── charts/          # 图表组件
│   │   └── media/           # 媒体组件
│   ├── lib/
│   │   ├── steam.ts         # Steam API封装
│   │   ├── llm.ts           # LLM API封装
│   │   └── utils.ts         # 工具函数
│   └── types/
│       └── game.ts          # 游戏类型定义
├── public/data/              # 数据文件
│   ├── games-index.json    # 游戏索引 (320MB, 125,095款)
│   ├── games-meta.json     # 游戏元数据 (342MB)
│   └── games-cache.json    # 预计算缓存 (322MB)
├── prisma/
│   └── schema.prisma        # Prisma Schema
├── package.json
└── next.config.js
```

---

## 数据说明

数据来自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)：

- **12.5 万+** Steam 游戏
- **91.9%** 有描述信息
- **99.9%** 有封面图

每周日凌晨 2:00 自动执行增量更新，通过 Steam Store API 获取最新评价数据，更新 SQLite 数据库记录。

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

### 1. GET /api/games/search

游戏搜索接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 否 | 搜索关键词 |
| genre | string | 否 | 游戏类型筛选 |
| minRating | number | 否 | 最低好评率 (0-100) |
| minReviews | number | 否 | 最低评价数 |
| sortBy | string | 否 | 排序：rating/reviews/date/name |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 (默认1) |
| pageSize | number | 否 | 每页数量 (默认20, 最大50) |

**特殊标签筛选**：支持 tags 和 genres 模糊匹配
- `回合` - Turn-Based, Turn-Based Strategy, Turn-Based Tactics, Turn-Based Combat
- `RPG` - RPG, JRPG, Action RPG, Adventure
- `SRPG` - Strategy RPG, Tactical RPG
- `策略` - Strategy, Grand Strategy, Real Time Tactics, Tactical, 4X
- `卡牌` - Card Game, Deckbuilding, Collectible Card Game

---

### 2. GET /api/games/:id

游戏详情接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 游戏 ID (AppId) |
| full | boolean | 否 | 返回完整数据 (默认 false) |

---

### 3. GET /api/analysis/generate

AI 分析生成接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gameId | string | 是 | 游戏 ID |
| gameName | string | 是 | 游戏名称 |

---

### 4. GET /api/mode2/filter

模式2宝可梦Like筛选接口

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|
| pool | string | 否 | 池子类型 (A/B/C组合) |
| poolA_minRating | number | 否 | A池最低好评率 (默认75) |
| poolA_minReviews | number | 否 | A池最低评价数 (默认50) |
| poolB_minRating | number | 否 | B池最低好评率 (默认75) |
| poolB_minReviews | number | 否 | B池最低评价数 (默认50) |
| poolC_minRating | number | 否 | C池最低好评率 (默认40) |
| poolC_maxRating | number | 否 | C池最高好评率 (默认74) |
| poolC_minReviews | number | 否 | C池最低评价数 (默认50) |
| sortBy | string | 否 | 排序：wilson/rating/reviews/date |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| yearsFilter | number | 否 | 发布年份筛选 |
| minReleaseDate | string | 否 | 最早发布日期 (yyyy-MM-dd) |
| maxReleaseDate | string | 否 | 最晚发布日期 (yyyy-MM-dd) |
| excludeTestVersions | boolean | 否 | 排除测试版 (默认true) |
| reviewSource | string | 否 | 评价来源：all/cn/overseas (默认all) |
| statsOnly | boolean | 否 | 仅返回统计数据 |

---

## 类型定义

### Game 类型

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
  // 区域评价数据
  cnReviews?: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
  } | null;
  overseasReviews?: {
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    reviewScore: number;
  } | null;
  headerImage: string | null;
  screenshots: string[];
  steamUrl: string;
  isTestVersion: boolean;
  isPokemonLike?: boolean;
  pokemonLikeTags?: string[];
  wilsonScore?: number;
  // 区域威尔逊得分
  cnWilsonScore?: number;
  overseasWilsonScore?: number;
  pool?: "A" | "B" | "C" | null;
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
  coreGameplay: CoreGameplay;     // 核心玩法
  battleSystem: BattleSystem;     // 战斗系统
  differentiation: Differentiation; // 差异化创新
  negativeFeedback: NegativeFeedback; // 差评分析
  designSuggestions: DesignSuggestions; // 设计建议
  referenceValue: ReferenceValue; // 参考价值
}
```

---

## 变更日志

### 2026-04-17 - v1.7.0

- **部署修复**：全面审查并修复部署方案
- **修复**：Dockerfile 多阶段构建路径错误（`/app/.next/standalone` → `/app/.next/standalone/`）
- **修复**：Dockerfile 未复制 public 目录问题，确保数据文件正确包含在容器中
- **修复**：`.dockerignore` 错误排除 `public/data/*.json` 配置
- **修复**：`.gitattributes` LFS 追踪模式 `games-*.json` 与实际文件名不匹配
- **更新**：`zeabur.json` 添加 `git lfs pull` 命令，确保构建时拉取 LFS 文件
- **新增**：`.env.deploy.example` 统一部署环境变量模板
- **更新**：`ZEABUR_DEPLOY.md` 完整部署文档

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
