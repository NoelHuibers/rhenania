import { GamepadIcon, TrendingUp, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getLeaderboard, getRecentGames } from "~/server/actions/game/game";

export async function StatsOverview() {
	let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> | undefined,
		_recentGames: Awaited<ReturnType<typeof getRecentGames>> | undefined;
	try {
		[leaderboard, _recentGames] = await Promise.all([
			getLeaderboard(100), // Get more players for stats
			getRecentGames(50), // Get more games for stats
		]);
	} catch (error) {
		console.error("Failed to load stats:", error);
		// Return fallback stats
		return (
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Total Players</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">--</div>
						<p className="text-muted-foreground text-xs">
							Database connection needed
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Total Games</CardTitle>
						<GamepadIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">--</div>
						<p className="text-muted-foreground text-xs">
							Database connection needed
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Average ELO</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">--</div>
						<p className="text-muted-foreground text-xs">
							Database connection needed
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Highest ELO</CardTitle>
						<Trophy className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">--</div>
						<p className="text-muted-foreground text-xs">
							Database connection needed
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const totalPlayers = leaderboard?.length || 0;
	const totalGames =
		leaderboard?.reduce((sum, player) => sum + player.totalGames, 0) / 2 || 0; // Divide by 2 since each game involves 2 players
	const averageElo =
		totalPlayers > 0
			? Math.round(
					leaderboard.reduce((sum, player) => sum + player.currentElo, 0) /
						totalPlayers,
				)
			: 1200;
	const highestElo =
		leaderboard?.length > 0
			? Math.max(...leaderboard.map((player) => player.currentElo))
			: 1200;

	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Players</CardTitle>
					<Users className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{totalPlayers}</div>
					<p className="text-muted-foreground text-xs">
						Ranked Bierjungen Spieler
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Games</CardTitle>
					<GamepadIcon className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{Math.round(totalGames)}</div>
					<p className="text-muted-foreground text-xs">Games played overall</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Average ELO</CardTitle>
					<TrendingUp className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{averageElo}</div>
					<p className="text-muted-foreground text-xs">Community skill level</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Highest ELO</CardTitle>
					<Trophy className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl text-purple-500">{highestElo}</div>
					<p className="text-muted-foreground text-xs">Current champion</p>
				</CardContent>
			</Card>
		</div>
	);
}
