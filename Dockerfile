FROM node:20

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y git-lfs python3 make g++ && git lfs install

# 先复制 package 文件和 prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装依赖
RUN npm ci --ignore-scripts --legacy-peer-deps

# 显式安装所有 CSS 相关依赖
RUN npm install tailwindcss postcss autoprefixer --save-dev --legacy-peer-deps

# 验证 CSS 依赖是否正确安装
RUN node -e "require('tailwindcss'); console.log('tailwindcss OK');" && \
    node -e "require('postcss'); console.log('postcss OK');" && \
    node -e "require('autoprefixer'); console.log('autoprefixer OK');"

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 拉取 LFS 文件
RUN git lfs pull

# 重新构建原生模块
RUN npm rebuild

# 检查 postcss.config.js 是否可读
RUN cat postcss.config.js

# 构建 Next.js（捕获详细错误）
RUN npm run build 2>&1 || (echo "BUILD FAILED"; exit 1)

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
