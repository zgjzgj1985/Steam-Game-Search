FROM node:20-alpine AS base

# =============================================
# 第一阶段：依赖安装（充分利用 Docker 缓存）
# =============================================
FROM base AS deps
WORKDIR /app

# 先复制 package 文件，安装依赖
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts && npm cache clean --force

# =============================================
# 第二阶段：Prisma Client 生成
# =============================================
FROM deps AS prisma
WORKDIR /app

# 复制生成的 node_modules（包含 npm ci 结果）
COPY --from=deps /app/node_modules ./node_modules
# 只复制 prisma 相关文件
COPY prisma ./prisma
# 生成 Prisma Client
RUN npx prisma generate

# =============================================
# 第三阶段：构建 Next.js 应用
# =============================================
FROM deps AS builder
WORKDIR /app

# 复制第一阶段的 node_modules
COPY --from=deps /app/node_modules ./node_modules
# 复制 Prisma Client（从 prisma 阶段）
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
# 复制源代码
COPY . .

# 构建 Next.js（standalone 模式会自动输出到 .next/standalone/）
RUN npm run build

# =============================================
# 第四阶段：生产运行环境
# =============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# 创建非 root 用户和组
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 确保数据目录存在
RUN mkdir -p /app/public/data && \
    chown -R nextjs:nodejs /app

# 从 builder 阶段复制 standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 从 builder 阶段复制 static 资源
COPY --from=builder --chown=nextjs:nodejs /app/.next/static .next/static/

# 从 builder 阶段复制 public 目录（包含 games-index.json 等数据文件）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000
ENV PORT=3000

# 启动命令
CMD ["node", "server.js"]
