import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnalysisDetail } from "@/components/analysis/analysis-detail";
import { Game, BattleAnalysis } from "@/types/game";
import { Button } from "@/components/ui/button";

function getRequestBaseUrl(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const local =
      host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = local ? "http" : (h.get("x-forwarded-proto") ?? "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

/**
 * URL 里 `[id]` 是站点 slug（如 octopath-2），而 Steam API 需要数字 App ID。
 */
function resolveGenerateQuery(id: string): URLSearchParams {
  const params = new URLSearchParams();
  if (/^\d+$/.test(id)) {
    params.set("gameId", id);
    return params;
  }
  params.set("gameName", id.replace(/-/g, " "));
  return params;
}

async function fetchAnalysisData(
  id: string
): Promise<{ game: Game; analysis: BattleAnalysis } | null> {
  try {
    const base = getRequestBaseUrl();
    const q = resolveGenerateQuery(id);
    const res = await fetch(`${base}/api/analysis/generate?${q.toString()}`, {
      cache: "no-store",
    });

    if (res.ok) {
      return (await res.json()) as { game: Game; analysis: BattleAnalysis };
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
  const data = await fetchAnalysisData(params.id);

  if (!data) {
    notFound();
  }

  const { game, analysis } = data;

  return (
    <div>
      <div className="container mx-auto px-4 py-4">
        <Link href="/">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Button>
        </Link>
      </div>

      <AnalysisDetail game={game} analysis={analysis} />
    </div>
  );
}
