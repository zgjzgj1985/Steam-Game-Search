FROM node:20-alpine

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache git git-lfs && git lfs install

# 先复制 package 文件和 prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装依赖（跳过 postinstall）
RUN npm ci --ignore-scripts && npm cache clean --force

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 拉取 LFS 文件
RUN git lfs pull

# 构建 Next.js
RUN npm run build

# 生产环境
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache git git-lfs

# 复制构建产物
COPY --from=0 /app/.next/standalone ./
COPY --from=0 /app/.next/static ./.next/static/
COPY --from=0 /app/public ./public

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
