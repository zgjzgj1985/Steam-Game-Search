"use client";

import { ModularAnalysis } from "@/components/analysis/modular-analysis";
import { Game } from "@/types/game";
import { useRouter } from "next/navigation";

interface ClientAnalysisWrapperProps {
  game: Game;
}

export function ClientAnalysisWrapper({ game }: ClientAnalysisWrapperProps) {
  const router = useRouter();

  const handleMarkRead = (gameId: string) => {
    // 标记完成后，刷新模式2页面以更新已读状态
    router.push("/mode2");
  };

  return <ModularAnalysis game={game} onMarkRead={handleMarkRead} />;
}
