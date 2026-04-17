FROM node:20-alpine

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache git git-lfs && git lfs install

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 复制 prisma schema
COPY prisma ./prisma

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
