"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Game } from "@/types/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function ComparePage() {
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/games/search?${new URLSearchParams({ q: query })}`);
      const data = await res.json();
      setGames(data.results || []);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleGame = (game: Game) => {
    if (selected.find((g) => g.id === game.id)) {
      setSelected(selected.filter((g) => g.id !== game.id));
    } else if (selected.length < 4) {
      setSelected([...selected, game]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">游戏对比分析</h1>
            <p className="text-muted-foreground">搜索并选择2-4款游戏进行战斗系统对比</p>
          </div>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">搜索游戏</h2>
          <div className="flex gap-2">
            <Input
              placeholder="输入游戏名称..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? "搜索中..." : "搜索"}
            </Button>
          </div>
        </Card>

        {games.length > 0 && (
          <Card className="p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">搜索结果</h2>
            <div className="flex flex-wrap gap-3">
              {games.map((game) => {
                const isSelected = selected.find((g) => g.id === game.id);
                return (
                  <Button
                    key={game.id}
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => toggleGame(game)}
                    disabled={!isSelected && selected.length >= 4}
                  >
                    {isSelected ? "✓ " : "+ "}
                    {game.name}
                  </Button>
                );
              })}
            </div>
          </Card>
        )}

        {searched && games.length === 0 && !loading && (
          <Card className="p-6 mb-8">
            <p className="text-muted-foreground text-center">未找到游戏，请尝试其他关键词</p>
          </Card>
        )}

        {selected.length >= 2 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">已选择 {selected.length} 款游戏</h2>
            <p className="text-muted-foreground mb-4">
              对比分析功能需要配置 LLM API。完成配置后，这里将显示所选游戏的战斗系统对比图表。
            </p>
            <div className="flex flex-wrap gap-3">
              {selected.map((game) => (
                <Button
                  key={game.id}
                  variant="outline"
                  size="sm"
                  onClick={() => toggleGame(game)}
                >
                  ✕ {game.name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {selected.length > 0 && selected.length < 2 && (
          <Card className="p-6">
            <p className="text-muted-foreground text-center">请至少选择2款游戏进行对比</p>
          </Card>
        )}
      </div>
    </div>
  );
}
