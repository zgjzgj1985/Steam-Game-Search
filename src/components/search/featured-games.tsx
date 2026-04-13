import { GameCard } from "./game-card";
import { Game } from "@/types/game";

interface FeaturedGamesProps {
  games: Game[];
}

export function FeaturedGames({ games }: FeaturedGamesProps) {
  if (games.length === 0) {
    return null;
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}
