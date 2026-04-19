import { Suspense } from "react";
import { ChallengeBanner } from "~/components/eloranking/ChallengeBanner";
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
				<div className="container mx-auto space-y-4 px-4 py-8">
					<ChallengeBanner />

					<div className="flex justify-end">
						<NewChallengeButton />
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
