import { Suspense } from "react";
import { LeaderboardSection } from "~/components/eloranking/leaderboard-section";
import { NewChallengeButton } from "~/components/eloranking/NewChallengeButton";
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
					<div className="flex justify-end">
						<NewChallengeButton />
					</div>

					<Suspense fallback={null}>
						<StatsOverview />
					</Suspense>

					<Suspense
						fallback={
							<div className="rounded-md border p-6 text-center text-muted-foreground text-sm">
								Lade Rangliste…
							</div>
						}
					>
						<LeaderboardSection />
					</Suspense>

					<Suspense fallback={null}>
						<RecentGamesSection />
					</Suspense>
				</div>
			</div>
		</SidebarLayout>
	);
}
