# 回合制游戏战斗系统分析平台

## 项目概述

这是一个基于 AI 的回合制游戏战斗系统分析工具，用于分析 Steam 平台的回合制游戏，并通过 LLM 生成深度分析报告。

### 核心功能

- **游戏搜索**: 本地数据库包含 12.2 万 Steam 游戏
- **AI 分析**: 使用通义千问/Qwen 生成结构化战斗系统分析
- **可视化展示**: 雷达图、流程图、截图画廊
- **游戏对比**: 多游戏多维度比较

### 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 14 | 框架 (App Router) |
| TypeScript | 类型安全 |
| Tailwind CSS | 样式 |
| Prisma + SQLite | 数据库持久化 |
| Recharts | 图表 |
| Zustand | 状态管理 |
| SWR | 数据获取 |

---

## 项目结构

```
turn-based-analyzer/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes
│   │   │   ├── analysis/
│   │   │   │   └── generate/  # AI 分析生成
│   │   │   └── games/
│   │   │       ├── search/    # 游戏搜索
│   │   │       └── [id]/      # 游戏详情
│   │   ├── analysis/[id]/     # 分析详情页
│   │   ├── compare/           # 对比页
│   │   └── page.tsx           # 首页
│   ├── components/            # React 组件
│   │   ├── search/           # 搜索组件
│   │   ├── analysis/         # 分析组件
│   │   ├── charts/           # 图表组件
│   │   ├── media/            # 媒体组件
│   │   └── ui/               # UI 基础组件
│   ├── lib/                   # 工具库
│   │   ├── steam.ts          # Steam API
│   │   ├── llm.ts            # LLM API (通义千问/OpenAI)
│   │   ├── analysis-engine.ts # 分析引擎
│   │   ├── analysis-prompt.ts # 提示词
│   │   ├── db.ts             # Prisma 客户端
│   │   └── utils.ts          # 工具函数
│   └── types/
│       └── game.ts           # 类型定义
├── prisma/
│   └── schema.prisma         # 数据库 Schema
├── public/data/              # 静态数据
│   ├── games.json           # 原始数据 (~767 MB)
│   └── games-index.json    # 搜索索引 (~254 MB, 122,611 条)
└── package.json
```

---

## 数据流

### 搜索流程

```
用户输入 → GameSearch 组件
    ↓
调用 /api/games/search?q=...
    ↓
route.ts 加载 games.json (~767MB, 12.2 万游戏)
    ↓
JavaScript 内存过滤 + 排序
    ↓
分页返回结果
```

### 分析生成流程

```
用户选择游戏 → 点击"生成分析"
    ↓
调用 /api/analysis/generate?gameId=... 或 ?gameName=...
    ↓
route.ts 从 games.json 查找游戏
    ↓
调用 generateAnalysis() → LLM API
    ↓
返回 BattleAnalysis 结构化数据
    ↓
AnalysisDetail 组件渲染
```

---

## API 文档

### 1. GET /api/games/search

游戏搜索接口。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| q | string | 否 | 搜索关键词 |
| genre | string | 否 | 类型筛选 (可多次) |
| minRating | number | 否 | 最低好评率 (0-100) |
| minReviews | number | 否 | 最低评价数 |
| sortBy | string | 否 | 排序: rating/reviews/date/name |
| sortOrder | string | 否 | asc/desc |
| page | number | 否 | 页码 (默认1) |
| pageSize | number | 否 | 每页数量 (默认20, 最大50) |

**类型筛选值** (基于 tags 和 genres 字段):
- `回合制` - Turn-Based, Turn-Based Strategy, Turn-Based Tactics, Turn-Based Combat
- `RPG` - RPG, JRPG, Action RPG, Adventure
- `SRPG` - Strategy RPG, Tactical RPG
- `策略` - Strategy, Grand Strategy, Real Time Tactics, Tactical, 4X
- `卡牌` - Card Game, Deckbuilding, Collectible Card Game

**响应**:
```json
{
  "results": [...],
  "total": 1234,
  "page": 1,
  "pageSize": 20,
  "totalPages": 62,
  "query": "xcom",
  "genreFilters": ["回合制", "策略"],
  "incomplete": false,
  "dbStats": {
    "totalGames": 122611,
    "loadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 2. GET /api/games/:id

获取游戏详情。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 游戏 ID (AppId) 或名称 |
| full | boolean | 否 | 是否加载完整描述 (默认 false) |

**响应** (full=false，快速模式):
```json
{
  "source": "local",
  "game": {
    "id": "729790",
    "name": "XCOM 2",
    "shortDescription": "XCOM 2 is the sequel to XCOM: Enemy Unknown...",
    "description": "",
    ...
  },
  "analysis": null
}
```

**响应** (full=true，完整模式):
```json
{
  "source": "local",
  "game": {
    "id": "729790",
    "name": "XCOM 2",
    "shortDescription": "...",
    "description": "XCOM 2 is the sequel to XCOM: Enemy Unknown...",
    ...
  },
  "analysis": null,
  "loadedFrom": {
    "index": true,
    "meta": true,
    "descriptionLength": 3500
  }
}
```

---

### 3. GET /api/analysis/generate

生成游戏战斗系统分析。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gameId | string | 二选一 | 游戏 ID (优先) |
| gameName | string | 二选一 | 游戏名称 |

**响应**:
```json
{
  "game": { ... },
  "analysis": {
    "battleMechanics": {
      "turnSystem": "Traditional",
      "actionSystem": "Menu",
      "targetSystem": "Multi",
      "elements": { "hasElements": true, "elements": [...] },
      "statusEffects": [...],
      ...
    },
    "strategicDepth": {
      "positioning": { "hasPositioning": true, "gridSize": {...} },
      "synergies": { "hasSynergies": true, "types": [...] },
      "counterStrategies": [...],
      "replayabilityScore": 85
    },
    "innovationElements": [...],
    "overallScore": 82
  },
  "source": "local"
}
```

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
  _searchPool: string;
  _matchLabels: string[];
}
```

### BattleAnalysis 接口

```typescript
interface BattleAnalysis {
  id: string;
  gameId: string;
  battleMechanics: BattleMechanics;
  strategicDepth: StrategicDepth;
  innovationElements: InnovationElement[];
  overallScore: number;
  generatedAt: Date;
}

interface BattleMechanics {
  turnSystem: "ATB" | "Traditional" | "Side" | "RealTime" | "Hybrid" | "Unknown";
  actionSystem: "Menu" | "Card" | "Timed" | "Position" | "Combo" | "Mixed";
  targetSystem: "Single" | "Multi" | "All" | "Row" | "Column" | "Custom";
  damageFormula: string;
  critSystem: "Fixed" | "Rate" | "Stack" | "Skill" | "None";
  elements: { hasElements: boolean; elements: string[]; interactions?: [...] };
  statusEffects: StatusEffect[];
  ultimateSkills: boolean;
  comboSystem: boolean;
  breakGauge?: { name: string; max: number; gainMethod: string; usage: string };
  specialMechanics: string[];
}
```

---

## 组件说明

### 搜索组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `GameSearch` | `components/search/game-search.tsx` | 主搜索组件 |
| `GameCard` | `components/search/game-card.tsx` | 游戏卡片 |
| `FeaturedGames` | `components/search/featured-games.tsx` | 精选游戏 |

### 分析组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `AnalysisDetail` | `components/analysis/analysis-detail.tsx` | 分析详情主容器 |
| `GameInfo` | `components/analysis/game-info.tsx` | 游戏信息 |
| `BattleMechanicsView` | `components/analysis/battle-mechanics.tsx` | 战斗机制 |
| `StrategicDepthView` | `components/analysis/strategic-depth.tsx` | 策略深度 |
| `InnovationView` | `components/analysis/innovation.tsx` | 创新亮点 |

### 图表组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `RadarChart` | `components/charts/radar-chart.tsx` | 雷达图 |
| `BattleFlowChart` | `components/charts/battle-flow.tsx` | 战斗流程图 |
| `ComparisonChart` | `components/charts/comparison-chart.tsx` | 对比图 |

---

## 环境变量

创建 `.env` 文件:

```env
# LLM 配置 (通义千问)
LLM_PROVIDER=qianwen
DASHSCOPE_API_KEY=your_api_key_here
LLM_MODEL_QIANWEN=qwen3.6-plus
LLM_BASE_URL_QIANWEN=https://dashscope.aliyuncs.com/compatible-mode/v1

# 数据库
DATABASE_URL="file:./games.db"

# 可选: OpenAI 备选
# OPENAI_API_KEY=sk-...
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
npm run start

# 数据库操作
npm run db:push     # 推送 Schema
npm run db:generate # 生成 Client
npm run db:build    # 构建游戏数据库

# 清理
npm run clean       # 清理 Next.js 缓存
npm run dev:clean   # 清理后开发
npm run dev:fresh   # 停止后重新启动
```

---

## 数据库

### Prisma Schema

使用 SQLite 数据库，包含两个模型:

**Game** - 游戏信息
- id, name, steamAppId (唯一), description
- developers, publishers, genres, tags (JSON 字符串)
- releaseDate, price, metacriticScore
- headerImage, screenshots

**Analysis** - 分析结果
- gameId (外键，唯一)
- 战斗机制字段 (turnSystem, actionSystem, elements 等)
- 策略深度字段 (positioning, synergies, counterStrategies)
- overallScore (0-100)

### 当前数据源

**主数据**: `public/data/games.json`
- 122,611 条 Steam 游戏
- 来源: [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
- 93% 条目有完整 description（平均 1,320 字符）
- 99.9% 有 header_image 封面图
- 通过 `tags` 字段筛选回合制游戏 (~6,651 条)

**Prisma SQLite**: `games.db`
- 用于存储已生成的分析结果
- 可选使用

---

## LLM 分析维度

### 战斗机制
- 回合系统 (ATB/传统/时间轴/即时/混合)
- 行动系统 (菜单/卡牌/时机/站位/连击/混合)
- 目标系统 (单体/全体/行列等)
- 伤害公式
- 暴击系统
- 元素系统 (属性/相克)
- 状态效果
- 终极技能
- 连击系统
- Break Gauge

### 策略深度
- 站位系统 (网格/朝向/高度/地形)
- 协同系统 (元素/职业/站位等)
- 反制策略
- 难度设置
- 战术选项
- 重玩性评分

### 创新元素
- 机制创新
- 视觉创新
- 系统创新
- 叙事创新

---

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | Hero + 搜索 + 精选游戏 |
| `/analysis/[id]` | 分析详情 | 游戏分析展示 |
| `/compare` | 对比页 | 多游戏对比 |

---

## 已知限制

1. **游戏数据库**: 12.2 万游戏数据存储在 JSON 文件中，首次加载约 3-5 秒
2. **AI 分析**: 需要有效的 LLM API Key
3. **搜索**: 目前使用 JavaScript 内存过滤，适合中小规模查询
4. **截图**: 部分游戏可能没有 Steam 截图数据
5. **语言**: description 为英文原文，部分游戏可能有编码问题

---

## 数据来源

### FronkonGames/steam-games-dataset

来源: [Hugging Face Dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)

**数据规模**:
- 122,611 条 Steam 游戏
- 原始文件大小: 767 MB
- 索引文件大小: 254 MB (用于 API 搜索)

**索引文件策略**:
- `games.json` - 原始完整数据 (~767 MB)
- `games-index.json` - 精简索引 (~254 MB, 仅包含搜索必需字段)
- 搜索 API 使用 `games-index.json` 以确保性能

**字段完整性**:
| 字段 | 完整率 |
|------|--------|
| name | 100.00% |
| header_image | 99.93% |
| screenshots | 95.09% |
| short_description | 93.13% |
| genres | 93.14% |
| developers | 93.12% |
| price | 78.63% |

**回合制游戏筛选**:
- 通过 `tags` 字段筛选
- Turn-Related 游戏: ~7,681 条 (按 Turn-Based 等标签)
- 标签: Turn-Based Strategy, Turn-Based Tactics, Turn-Based Combat 等

---

## 更新日志

### 2026-04-10 - 索引文件缺陷修复（混合方案）

**问题描述**：原索引文件 `games-index.json` 缺少 `description` 字段，导致详情页无法显示完整游戏描述。

**解决方案**：采用混合方案（方案1 + 方案2）

1. **保留索引文件精简**：`games-index.json` (254 MB) - 用于搜索 API 快速响应
2. **新增 meta 文件**：`games-meta.json` (298 MB) - 仅含 description 字段

**数据统计**：
| 指标 | 数值 |
|------|------|
| 总游戏数 | 122,611 |
| 有描述 | 114,191 (93.1%) |
| 平均描述长度 | 1,230 字符 |
| 压缩比 | 2.6x |

**文件结构**：
```
public/data/
├── games.json      # 原始数据 (767 MB, 仅备份)
├── games-index.json  # 搜索索引 (254 MB)
└── games-meta.json   # 详情补充 (298 MB)
```

**API 改动**：
- `GET /api/games/:id` - 快速模式，仅返回基本信息
- `GET /api/games/:id?full=true` - 完整模式，合并 meta 数据

**新增脚本**：
- `scripts/build-games-meta.py` - 构建 meta 文件（使用 ijson 流式解析）

### 2026-04-10 - 新数据集接入
- **数据集切换完成**：
  - 搜索 API 已适配新数据集 `games-index.json`
  - 游戏详情 API 已适配
  - 生成精简索引文件 `games-index.json` (254 MB)
- **修复性能问题**：767 MB 原文件过大无法加载，改为加载精简索引
- **字段映射更新**：
  - `detailed_description` → `short_description` (描述来源)
  - `estimated_owners` 字符串解析为数值区间
  - `tags` 字典转为标签数组
- **类型筛选更新**：中文关键词 → 英文 tags 匹配

### 2026-04-10 - 项目清理
- 删除 37 个临时脚本（根目录 25 个 + scripts 目录 11 个）
- 删除残留数据文件 `steam-enriched.jsonl`
- 删除 `.cache` 目录
- **保留数据**: `public/data/games.json` (767 MB, 122,611 条游戏)
- 详情见下方"项目清理记录"

### 2026-04-10 - 数据集更换
- 替换为 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)
- 删除旧数据文件: games-database.json, games_raw.csv, steam-enriched.jsonl 等
- 新数据集包含 93% 完整 description，平均 1,320 字符

### 2026-04-09 - 数据补全
- 启动 Steam Store API 补数据计划
- 测试确认数据质量：description、genres_api、developers、headerImage 全部有效
- 成功率 95.5%（失败主要是 AppID 对应非游戏内容如工具/视频）
- **修复关键 Bug**：移除 `cc=cn` 参数（导致中国区未上架游戏返回 no_data）
- **并发调优**：4 线程无延迟，平衡速率与成功率
- **当前进度**（2026-04-09 15:40）：
  - 已抓取：15,119 条 / 34.72 MB
  - 成功率：68%
  - 速率：2.0/s
  - ETA：约 15 小时完成全量 11.5 万条

### 2024-xx-xx - 重构数据源
- 搜索 API 从 RAWG API 迁移到本地 JSON 数据库
- 移除对外部 API 的依赖
- 提升搜索响应速度和稳定性

### 2024-xx-xx - AI 分析功能
- 新增 LLM 驱动的战斗系统分析
- 支持通义千问/OpenAI
- 生成结构化分析报告

### 2024-xx-xx - 项目初始化
- Next.js 14 App Router
- Tailwind CSS 样式
- Recharts 图表
- Prisma 数据库

---

## 项目清理记录

### 2026-04-13 筛选功能完善

**新增功能**：
- `minRating` 参数：基于 Steam 评价数计算的好评率筛选
- `minReviews` 参数：基于总评价数筛选
- 前端滑块交互优化：添加数字输入框、快捷预设按钮

**API 改动**：
- `/api/games/search` 新增 `minRating` 和 `minReviews` 参数处理
- 筛选逻辑：好评率 = positive / (positive + negative) * 100

### 2026-04-10 临时脚本清理

**根目录已清理文件** (25 个):

| 文件名 | 类型 |
|--------|------|
| `analyze_*.py` | 分析脚本 (7 个) |
| `check_*.py` | 检查脚本 (5 个) |
| `debug*.py` | 调试脚本 (5 个) |
| `final*.py` | 最终版脚本 (3 个) |
| `monitor*.py` | 监控脚本 (3 个) |
| `test_vpn.py` | VPN 测试脚本 |

**scripts 目录已清理文件** (11 个):

| 文件名 | 类型 |
|--------|------|
| `enrich_steam*.py` | Steam API 补数据脚本 (6 个) |
| `*audit*.py` | 审计脚本 (2 个) |
| `process-steam-db.py` | 数据库处理 |
| `test_steam_api.py` | API 测试 |
| `quick_verify.py` | 快速验证 |

**已清理数据文件**:
- `public/data/steam-enriched.jsonl`
- `public/data/.cache/` 目录

---

## 当前项目状态

### 保留文件结构

```
turn-based-analyzer/
├── src/                      # Next.js 源代码
├── public/data/
│   ├── games.json           # 原始数据 (767 MB, 仅备份)
│   ├── games-index.json     # 搜索索引 (254 MB)
│   └── games-meta.json      # 详情补充 (298 MB)
├── scripts/
│   └── build-games-meta.py  # 构建 meta 文件脚本
├── prisma/
│   └── schema.prisma        # 数据库 Schema
├── package.json
└── PROJECT.md               # 项目文档
```

### 删除的脚本说明

以下脚本已无使用价值，因为数据集已更换为包含完整 description 的 Hugging Face 数据集：

- **补数据脚本**: `enrich_steam*.py` - 原用于补全 Steam API 数据，现已不需要
- **审计脚本**: `*audit*.py` - 原用于检查数据质量，现数据集已完整
- **分析脚本**: `analyze_*.py`, `check_*.py` - 临时调试脚本
- **监控脚本**: `monitor*.py` - 原用于监控补数据进度

### 下次清理待办

如无需保留，可进一步清理：
- `scripts/build-steam-db.ts` - 构建数据库脚本（数据集已更换）
- `scripts/clean-next.js` - Next.js 清理脚本
- `scripts/stop-next-dev.ps1` - 停止开发服务器脚本
