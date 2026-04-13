import { NextRequest, NextResponse } from "next/server";

/**
 * 兼容旧版或外部脚本请求 GET /api/games?keyword=&page=…
 * 转发到实际实现 /api/games/search
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const forward = new URLSearchParams();
  const q = searchParams.get("keyword") || searchParams.get("q");
  if (q) forward.set("q", q);
  for (const key of [
    "page",
    "pageSize",
    "minRating",
    "minReviews",
    "sortBy",
    "sortOrder",
  ]) {
    const v = searchParams.get(key);
    if (v) forward.set(key, v);
  }
  searchParams.getAll("genre").forEach((g) => forward.append("genre", g));

  const target = new URL(request.url);
  target.pathname = "/api/games/search";
  target.search = forward.toString();
  return NextResponse.redirect(target, 307);
}
