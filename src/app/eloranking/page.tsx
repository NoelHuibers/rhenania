import { Suspense } from "react";
import { LeaderboardSection } from "~/components/eloranking/leaderboard-section";
import { RecentGamesSection } from "~/components/eloranking/recent-games-section";
import { StatsOverview } from "~/components/eloranking/stats-overview";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            🍺 Bierjungen ELO Leaderboard
          </h1>
          <p className="text-muted-foreground text-lg">
            Zeig deine Dominanz an der Tasse!
          </p>
        </div>

        <Suspense
          fallback={<div className="text-center">Loading stats...</div>}
        >
          <StatsOverview />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            <Suspense
              fallback={
                <div className="text-center">Loading leaderboard...</div>
              }
            >
              <LeaderboardSection />
            </Suspense>
          </div>

          <div className="lg:col-span-1">
            <Suspense
              fallback={
                <div className="text-center">Loading recent games...</div>
              }
            >
              <RecentGamesSection />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
