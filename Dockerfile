FROM node:20

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y git-lfs python3 make g++ && git lfs install

# 先复制 package 文件和 prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装依赖（包括 devDependencies）
RUN npm ci --include=dev

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 拉取 LFS 文件
RUN git lfs pull

# 构建 Next.js
RUN npm run build

# 生产环境
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y git-lfs

# 复制构建产物
COPY --from=0 /app/.next/standalone ./
COPY --from=0 /app/.next/static ./.next/static/
COPY --from=0 /app/public ./public

# 复制 node_modules（包含 Prisma Client 等运行时依赖）
# 注意：必须完整复制 node_modules，因为 Prisma 需要 .prisma 目录中的引擎二进制文件
COPY --from=0 /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000

# 容器启动时执行数据库迁移（确保 schema 最新）
CMD ["node", "server.js"]
