const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // 将 better-sqlite3 标记为外部包，避免 Next.js 尝试打包原生模块
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },

  // 将 webpack 文件缓存放到 ASCII 子路径，减轻 Windows + 非 ASCII 项目路径下偶发的静态资源 404
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: "filesystem",
        cacheDirectory: path.join(__dirname, "node_modules", ".cache", "webpack"),
      };
      // 开发环境启用大小写敏感检查，捕获 Windows 开发但 Linux 构建时的大小写问题
      // 使用 try-catch 延迟加载，避免生产构建报错
      try {
        const CaseSensitivePathsPlugin = require("case-sensitive-paths-webpack-plugin");
        config.plugins.push(new CaseSensitivePathsPlugin());
      } catch {
        // 生产环境忽略
      }
    }
    // 显式配置路径别名，确保 Docker 构建时正确解析
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
  images: {
    // 远程 Steam 截图常有 404，走优化接口会刷 500；直连浏览器加载更稳
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "steamcdn-a.akamaihd.net",
      },
      {
        protocol: "https",
        hostname: "media.steampowered.com",
      },
      {
        protocol: "https",
        hostname: "cdn.akamai.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "shared.akamai.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
      },
    ],
  },
};

module.exports = nextConfig;