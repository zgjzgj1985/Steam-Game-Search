import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ModularAnalysis } from "@/components/analysis/modular-analysis";
import { Game } from "@/types/game";
import { Button } from "@/components/ui/button";

function getRequestBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// 缓存 1 小时
export const revalidate = 60 * 60;

async function fetchGameData(id: string): Promise<Game | null> {
  try {
    const base = getRequestBaseUrl();
    // 使用 /api/games/:id 直接获取游戏详情
    const res = await fetch(`${base}/api/games/${encodeURIComponent(id)}`, {
      cache: "force-cache",
    });

    if (res.ok) {
      const data = await res.json();
      return data.game || data.games?.[0] || data.results?.[0] || null;
    }
  } catch {
    // API 不可用时静默降级
  }

  return null;
}

interface PageProps {
  params: { id: string };
}

export default async function AnalysisPage({ params }: PageProps) {
  const game = await fetchGameData(params.id);

  if (!game) {
    notFound();
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <Link href="/mode2">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            返回模式2
          </Button>
        </Link>
      </div>

      <ModularAnalysis game={game} />
    </div>
  );
}
