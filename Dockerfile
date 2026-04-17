FROM node:20

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y git-lfs python3 make g++ && git lfs install

# 先复制 package 文件和 prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装依赖
RUN npm ci --ignore-scripts --legacy-peer-deps

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 拉取 LFS 文件
RUN git lfs pull

# 验证关键依赖是否存在
RUN ls -la node_modules/tailwindcss node_modules/postcss node_modules/autoprefixer 2>&1 || echo "Missing dependencies detected"

# 检查 postcss.config.js 是否存在
RUN cat postcss.config.mjs 2>/dev/null || cat postcss.config.js 2>/dev/null || echo "No postcss config found"

# 构建 Next.js（分步骤执行以获取详细错误）
RUN npx next build --no-lint 2>&1

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
