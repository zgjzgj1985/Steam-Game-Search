/**
 * 解析 Steam 商店头图 URL。
 * 本地 JSON 中 headerImage 常为空或误存为评测文案等非 URL，此时用官方 CDN 规则回退。
 */
export function resolveSteamHeaderImageUrl(game: {
  headerImage: string | null | undefined;
  steamAppId: string | null | undefined;
  id: string;
}): string | null {
  const raw = game.headerImage?.trim();
  if (raw && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    return raw;
  }
  const appId =
    game.steamAppId?.trim() ||
    (/^\d+$/.test(String(game.id)) ? String(game.id) : "");
  if (!appId || !/^\d+$/.test(appId)) return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}
