import { Card, CardContent } from "~/components/ui/card";
import { getGlobalLeaderboard } from "~/server/actions/game/cross-tenant-discovery";
import { LeaderboardClient, type LeaderboardEntry } from "./leaderboard-client";

export async function LeaderboardSection() {
	let initial: LeaderboardEntry[] = [];
	let loadFailed = false;
	try {
		const rows = await getGlobalLeaderboard(20);
		initial = rows.map((r) => ({
			userId: r.userId,
			userName: r.name,
			userEmail: r.email,
			avatar: null,
			currentElo: r.currentElo,
			totalGames: r.totalGames,
			wins: r.wins,
			losses: r.losses,
			winRate: r.winRate,
			peakElo: r.peakElo,
			tenantSlug: r.tenantSlug,
			tenantName: r.tenantName,
		}));
	} catch (error) {
		console.error("Failed to load leaderboard:", error);
		loadFailed = true;
	}

	if (loadFailed) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					<p>Unable to load leaderboard data.</p>
					<p className="mt-2 text-sm">Please check your database connection.</p>
				</CardContent>
			</Card>
		);
	}

	return <LeaderboardClient initialPlayers={initial} initialScope="global" />;
}
