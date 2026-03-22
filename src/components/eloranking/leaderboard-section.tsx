import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getLeaderboard } from "~/server/actions/game/game";
import { LeaderboardClient } from "./leaderboard-client";

export async function LeaderboardSection() {
	let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> | undefined;
	try {
		leaderboard = await getLeaderboard(20);
	} catch (error) {
		console.error("Failed to load leaderboard:", error);
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base sm:text-lg">
						<Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
						ELO Leaderboard
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="py-8 text-center text-muted-foreground">
						<p>Unable to load leaderboard data.</p>
						<p className="mt-2 text-sm">
							Please check your database connection.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!leaderboard || leaderboard.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base sm:text-lg">
						<Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
						ELO Leaderboard
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="py-8 text-center text-muted-foreground">
						<p>No players found.</p>
						<p className="mt-2 text-sm">
							Start playing some games to see the leaderboard!
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3 sm:pb-6">
				<CardTitle className="flex items-center gap-2 text-base sm:text-lg">
					<Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
					ELO Leaderboard
				</CardTitle>
			</CardHeader>
			<CardContent className="px-2 sm:px-6">
				<LeaderboardClient initialPlayers={leaderboard} />
			</CardContent>
		</Card>
	);
}
