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
				<SiteHeader
					title="Eloranking"
					subtitle="Zeig deine Dominanz an der Tasse!"
				/>
				<div className="container mx-auto space-y-6 px-4 py-6">
					<Suspense fallback={null}>
						<StatsOverview />
					</Suspense>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						<div className="lg:col-span-2">
							<Suspense
								fallback={
									<div className="rounded-md border p-6 text-center text-muted-foreground text-sm">
										Lade Rangliste…
									</div>
								}
							>
								<LeaderboardSection />
							</Suspense>
						</div>
						<div className="lg:col-span-1">
							<Suspense fallback={null}>
								<RecentGamesSection />
							</Suspense>
						</div>
					</div>
				</div>
			</div>
		</SidebarLayout>
	);
}
