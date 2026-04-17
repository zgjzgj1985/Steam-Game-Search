# Zeabur 部署指南

## 前置准备

### 1. GitHub 仓库

确保代码已推送到 GitHub，远程仓库已配置：
```
origin  https://github.com/zgjzgj1985/Steam-Game-Search.git (fetch)
```

### 2. Git LFS 配置

项目已配置 Git LFS 追踪大型数据文件：
- `public/data/games.db`
- `public/data/games-*.json`

## 部署步骤

### 步骤 1：登录 Zeabur

1. 访问 [zeabur.com](https://zeabur.com)
2. 使用 GitHub 账号登录

### 步骤 2：创建项目

1. 点击 "New Project"
2. 选择 "Deploy from GitHub"
3. 授权 GitHub 访问（如果尚未授权）
4. 选择仓库 `Steam-Game-Search`

### 步骤 3：配置环境变量

在 Zeabur 控制台中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 生产环境 |
| `DATABASE_URL` | `file:./dev.db` | SQLite 数据库 |
| `NEXT_PUBLIC_BASE_URL` | `https://your-app.zeabur.app` | 你的 Zeabur 应用地址 |
| `LLM_PROVIDER` | `openrouter` | LLM 提供商 |
| `LLM_API_KEY` | `sk-...` | OpenRouter API Key |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | API 地址 |
| `LLM_MODEL` | `google/gemini-2.5-pro-preview` | 模型名称 |
| `LLM_MAX_TOKENS` | `32768` | 最大 tokens |

### 步骤 4：等待构建

Zeabur 会自动检测 Next.js 项目并开始构建。

**注意**：由于数据文件较大（约 2.6GB 通过 Git LFS 管理），首次构建可能需要较长时间。

### 步骤 5：访问应用

构建完成后，Zeabur 会提供一个 `.zeabur.app` 子域名。

## 故障排除

### 构建超时

如果构建超时（约 15 分钟），可能是因为 LFS 文件下载时间过长。

**解决方案**：
1. 在本地运行 `git lfs fetch --all` 预下载所有 LFS 文件
2. 然后再次推送到 GitHub

### 冷启动慢

由于数据文件较大，首次加载可能较慢。建议添加加载动画。

### LLM API 错误

确保 `LLM_API_KEY` 有效且额度充足。OpenRouter 提供免费模型（如 gemini-flash）。

## 自定义域名（可选）

1. 在 Zeabur 控制台进入项目设置
2. 点击 "Domains"
3. 添加你的自定义域名
4. 配置 DNS 记录

## 数据文件说明

| 文件 | 大小 | 说明 |
|------|------|------|
| `games.db` | ~1.6 GB | Steam 游戏数据库 |
| `games-index.json` | ~800 MB | 游戏索引数据 |
| `games-cache.json` | ~200 MB | 缓存数据 |

这些文件通过 Git LFS 管理，在构建时会自动下载。
