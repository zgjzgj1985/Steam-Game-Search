/**
 * 解析 Steam 商店头图 URL。
 * 本地 JSON 中 headerImage 常为空或误存为评测文案等非 URL，此时用官方 CDN 规则回退。
 * 仅返回有效 URL 或 null，避免传入 Image 组件时出现 src="" 的渲染错误。
 */
export function resolveSteamHeaderImageUrl(game: {
  headerImage: string | null | undefined;
  steamAppId: string | null | undefined;
  id: string;
}): string | null {
  const raw = game.headerImage?.trim();
  // 必须是以 http/https 开头的有效 URL，空字符串和乱码都拒绝
  if (raw && raw.length > 10 && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    return raw;
  }
  const appId =
    game.steamAppId?.trim() ||
    (/^\d+$/.test(String(game.id)) ? String(game.id) : "");
  if (!appId || !/^\d+$/.test(appId)) return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}
