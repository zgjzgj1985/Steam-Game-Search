FROM node:20

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y git-lfs python3 make g++ && git lfs install

# 先复制 package 文件和 prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装依赖（跳过 postinstall，使用 --legacy-peer-deps 避免依赖冲突）
RUN npm ci --ignore-scripts --legacy-peer-deps && npm cache clean --force

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 拉取 LFS 文件
RUN git lfs pull

# 重新构建原生模块（确保兼容性）
RUN npm rebuild

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

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
