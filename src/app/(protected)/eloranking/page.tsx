import { Suspense } from "react";
import { LeaderboardSection } from "~/components/eloranking/leaderboard-section";
import { RecentGamesSection } from "~/components/eloranking/RecentGamesSection";
import { StatsOverview } from "~/components/eloranking/stats-overview";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";

export default function HomePage() {
	return (
		<SidebarLayout>
			<div className="min-h-screen bg-background">
				<SiteHeader title="Eloranking" />
				<div className="container mx-auto px-4 py-8">
					<div className="mb-8 text-center">
						<p className="text-lg text-muted-foreground">
							Zeig deine Dominanz an der Tasse!
						</p>
					</div>

					<Suspense
						fallback={<div className="text-center">Loading stats...</div>}
					>
						<StatsOverview />
					</Suspense>

					<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
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
		</SidebarLayout>
	);
}
