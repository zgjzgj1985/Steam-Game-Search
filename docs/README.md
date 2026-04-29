# Steam 全域游戏搜索

一个面向**游戏策划与开发者**的专业参考游戏研究工具，融合 AI 能力与 Steam 游戏数据，帮助用户在立项阶段寻找参考游戏、研究竞品、避免踩坑。

不同于普通的游戏搜索工具，本项目专注于**回合制战斗 + 宝可梦Like融合玩法**这个细分赛道，提供深度的竞品分析和设计参考。

## 功能特点

### 模式1：游戏搜索

- 本地数据库包含 12.5 万+ Steam 游戏
- 按好评率、评价数、类型、发售日期筛选
- 按好评率、评价数、发售日期、名称排序
- 展示游戏基本信息、评分和截图
- AI 战斗系统深度分析

### 模式2：宝可梦Like游戏筛选

基于三池评分的专项筛选系统：

| 池子 | 定位 | 用途 |
|------|------|------|
| A池 | 神作参考池 | 告诉你要做成什么样才能成功 |
| B池 | 核心竞品池 | 告诉竞争对手是怎么做的 |
| C池 | 避坑指南池 | 告诉哪些设计会招来差评 |

**六维分析模块**：
- 一句话总结：快速了解游戏定位
- 核心玩法：生物收集、捕捉方式、进化系统、队伍构建
- 战斗系统：回合制机制、属性克制、技能设计
- 差异化创新：融合玩法、成功原因、市场定位
- 差评分析：玩家主要抱怨、设计缺陷警告
- 设计建议：值得学习的优点、需要避开的坑

**融合玩法标签**：LLM驱动的开放标签体系，108个特色标签，支持按创新程度/小众程度筛选

**区域评价**：国内/海外评价独立统计，理解不同市场偏好

### 可视化展示

- 雷达图：多维度评分对比
- 柱状图：游戏对比分析
- 流程图：战斗流程展示
- 截图画廊：游戏素材展示

### 游戏对比

- 选择多款游戏进行对比
- 综合评分对比
- 详细数据对比

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 14 (App Router) |
| UI组件 | Tailwind CSS + Radix UI |
| 状态管理 | Zustand |
| 数据获取 | SWR |
| 可视化 | Recharts + Mermaid |
| 数据存储 | SQLite + JSON 缓存 |
| AI分析 | 通义千问 + OpenAI |

---

## 项目结构

```
Steam全域游戏搜索/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 模式1首页
│   │   ├── mode2/page.tsx     # 模式2宝可梦Like筛选
│   │   ├── analysis/[id]/     # 分析详情
│   │   ├── compare/           # 游戏对比
│   │   └── api/              # API Routes
│   │       ├── games/        # 游戏搜索/详情API
│   │       ├── mode2/filter/ # 模式2筛选API
│   │       └── analysis/     # AI分析API
│   ├── components/
│   │   ├── ui/              # UI基础组件
│   │   ├── search/         # 搜索组件
│   │   ├── analysis/       # 分析组件
│   │   ├── charts/         # 图表组件
│   │   └── media/          # 媒体组件
│   ├── lib/                # 工具库
│   │   ├── steam.ts, llm.ts, utils.ts
│   │   └── analysis-engine.ts, tag-config.ts
│   └── types/
│       └── game.ts         # 游戏类型定义
├── public/data/              # 数据文件 (约1.6GB，不纳入Git)
│   ├── games-index.json    # 游戏索引
│   ├── games-meta.json     # 游戏元数据
│   ├── games-cache.json    # 预计算缓存
│   ├── games-cache.db      # SQLite缓存
│   └── combinedMechanics.json # LLM融合玩法分析
├── scripts/                  # Python数据脚本
│   ├── precompute.py        # 预计算缓存生成
│   ├── backup-data.py       # 数据备份
│   ├── manage_tags.py      # 标签管理
│   ├── unified_workflow.py  # 统一工作流
│   └── *.json              # 标签配置文件
├── prisma/
│   └── schema.prisma        # Prisma Schema
├── package.json
└── next.config.js
```

---

## 快速开始

### 环境要求

- Node.js 18+
- npm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm start
```

### 清理缓存

```bash
npm run clean
```

---

## 环境变量

复制 `.env.example` 到 `.env` 并配置：

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

## 数据维护

详见 [PROJECT.md](./PROJECT.md) 中的「数据说明」和「变更日志」部分。

### 数据来源

数据来自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)：

- **12.5 万+** Steam 游戏
- **91.9%** 有描述信息
- **99.9%** 有封面图

每周日凌晨 2:00 自动执行增量更新，通过 Steam Store API 获取最新评价数据，更新 SQLite 数据库记录。
