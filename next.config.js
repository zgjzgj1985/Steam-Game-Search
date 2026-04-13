const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 将 webpack 文件缓存放到 ASCII 子路径，减轻 Windows + 非 ASCII 项目路径下偶发的静态资源 404
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: "filesystem",
        cacheDirectory: path.join(__dirname, "node_modules", ".cache", "webpack"),
      };
    }
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