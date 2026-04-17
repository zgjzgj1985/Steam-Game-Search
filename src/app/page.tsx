import { GameSearch } from "@/components/search/game-search";
import { FeaturedGames } from "@/components/search/featured-games";
import { AnalysisCategories } from "@/components/analysis/categories";
import { Hero } from "../components/ui/hero";
import { steamService } from "@/lib/steam";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export default async function Home() {
  let featuredGames: Awaited<ReturnType<typeof steamService.getTopTurnBasedGames>> = [];
  try {
    featuredGames = await withTimeout(steamService.getTopTurnBasedGames(6), 12_000, []);
  } catch {
    featuredGames = [];
  }

  const featuredGamesList = featuredGames.map((g) => ({
    id: g.appid.toString(),
    name: g.name,
    steamAppId: g.appid.toString(),
    description: g.description,
    developers: g.developers,
    publishers: g.publishers,
    genres: g.genres,
    tags: g.tags,
    releaseDate: g.release_date ?? "",
    price: g.price,
    metacriticScore: g.metacritic_score,
    steamReviews: null,
    headerImage: g.header_image,
    capsuleImage: g.capsule_image,
    screenshots: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  return (
    <main className="min-h-screen w-full min-w-0">
      <Hero />

      <section className="container mx-auto px-4 py-16 w-full min-w-0">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">搜索回合制游戏</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            输入游戏名称，搜索Steam上的回合制游戏，获取详细战斗系统分析
          </p>
        </div>
        <GameSearch />
      </section>

      {featuredGamesList.length > 0 && (
        <section className="container mx-auto w-full min-w-0 bg-muted/50 px-4 py-16">
          <FeaturedGames games={featuredGamesList} />
        </section>
      )}

      <section className="w-full min-w-0 border-y border-[#2a475e]/50 bg-[#171a21] py-16">
        <div className="container mx-auto w-full min-w-0 px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold text-[#c7d5e0]">分析维度</h2>
            <p className="mx-auto max-w-2xl text-[#8f98a0]">
              从多个维度全面评估回合制游戏的战斗系统
            </p>
          </div>
          <AnalysisCategories />
        </div>
      </section>

      <footer className="w-full min-w-0 border-t py-12">
        <div className="container mx-auto w-full min-w-0 px-4 text-center text-muted-foreground">
          <p>回合制战斗分析工具 - 深入分析回合制游戏的战斗系统</p>
          <p className="mt-2 text-sm">
            数据来源：Steam Store API
          </p>
        </div>
      </footer>
    </main>
  );
}
