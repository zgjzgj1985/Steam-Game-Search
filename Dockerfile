FROM node:20-alpine AS base

# 安装依赖阶段
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# 构建阶段
FROM deps AS builder
WORKDIR /app
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建 Next.js
RUN npm run build

# 生产阶段
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 确保数据目录存在（Volume 挂载点）
RUN mkdir -p /app/public/data

# 复制 standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 静态文件已包含在 standalone 输出中

# public 目录由 Volume 挂载提供，无需复制

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
