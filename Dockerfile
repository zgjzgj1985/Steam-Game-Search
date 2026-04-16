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

# 复制 standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 复制静态文件（如果存在）
RUN if [ -d "/app/.next/static" ]; then \
        mkdir -p .next/static && \
        cp -r /app/.next/static/. .next/static/; \
    fi

# 复制 public 目录（如果存在）
RUN if [ -d "/app/public" ]; then \
        mkdir -p public && \
        cp -r /app/public/. public/; \
    fi

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
