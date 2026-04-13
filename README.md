# Steam 全域游戏搜索

一个用于搜索、分析和比较 Steam 游戏战斗系统的 Web 应用。

## 功能特点

### 游戏搜索
- 本地数据库包含 12.2 万 Steam 游戏
- 按好评率、评价数、类型、发售日期筛选
- 按好评率、评价数、发售日期、名称排序
- 展示游戏基本信息、评分和截图

### 战斗系统分析
从多个维度评估回合制游戏的战斗系统：
- 战斗机制：回合系统、行动选择、元素交互、状态效果
- 策略深度：站位系统、协同机制、反制策略
- 创新要素：特色机制、差异化设计

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
|-----|------|
| 前端框架 | Next.js 14 (App Router) |
| UI组件 | Tailwind CSS + Radix UI |
| 状态管理 | Zustand |
| 数据获取 | SWR |
| 可视化 | Recharts + Mermaid |
| 数据源 | 本地 JSON 数据库 |

## 快速开始

### 环境要求
- Node.js 18+
- npm

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
steam-game-analyzer/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 首页
│   │   ├── analysis/[id]/     # 分析详情页
│   │   └── compare/           # 对比页面
│   ├── components/
│   │   ├── ui/                # UI组件
│   │   ├── search/            # 搜索组件
│   │   ├── analysis/          # 分析组件
│   │   ├── charts/            # 图表组件
│   │   └── media/             # 媒体组件
│   ├── lib/
│   │   ├── steam.ts           # Steam API
│   │   ├── llm.ts             # LLM API
│   │   ├── analysis-engine.ts  # 分析引擎
│   │   └── utils.ts           # 工具函数
│   └── types/
│       └── game.ts            # 类型定义
├── public/data/
│   ├── games.json            # 原始数据 (备份)
│   ├── games-index.json      # 搜索索引 (254 MB)
│   └── games-meta.json       # 详情补充 (298 MB)
├── prisma/
│   └── schema.prisma          # 数据库模型
└── package.json
```

## 数据来源

游戏数据主要来自 [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset)：
- 122,611 条 Steam 游戏
- 93% 条目有完整 description（平均 1,320 字符）

## 环境变量

创建 `.env` 文件：

```env
# LLM 配置 (通义千问)
LLM_PROVIDER=qianwen
DASHSCOPE_API_KEY=your_api_key_here
LLM_MODEL_QIANWEN=qwen3.6-plus
LLM_BASE_URL_QIANWEN=https://dashscope.aliyuncs.com/compatible-mode/v1

# 数据库
DATABASE_URL="file:./games.db"
```

## 许可证

MIT License