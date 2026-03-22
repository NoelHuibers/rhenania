"use client";

import { Target, TrendingUp, Trophy } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { getLeaderboard } from "~/server/actions/game/game";
import type { UserGameStats } from "~/server/actions/game/game";

const PAGE_SIZE = 10;

const getRankIcon = (rank: number) => {
	if (rank === 1)
		return <Trophy className="h-3 w-3 text-yellow-500 sm:h-4 sm:w-4" />;
	if (rank === 2)
		return <Trophy className="h-3 w-3 text-gray-400 sm:h-4 sm:w-4" />;
	if (rank === 3)
		return <Trophy className="h-3 w-3 text-amber-600 sm:h-4 sm:w-4" />;
	return (
		<span className="font-medium text-muted-foreground text-xs">#{rank}</span>
	);
};

const getEloColor = (elo: number) => {
	if (elo >= 1600) return "text-purple-500";
	if (elo >= 1400) return "text-blue-500";
	if (elo >= 1200) return "text-green-500";
	return "text-gray-500";
};

export function LeaderboardClient({
	initialPlayers,
}: {
	initialPlayers: UserGameStats[];
}) {
	const [players, setPlayers] = useState(initialPlayers);
	const [hasMore, setHasMore] = useState(initialPlayers.length === 20);
	const [loading, setLoading] = useState(false);

	async function loadMore() {
		setLoading(true);
		try {
			const next = await getLeaderboard(PAGE_SIZE, players.length);
			setPlayers((prev) => [...prev, ...next]);
			if (next.length < PAGE_SIZE) setHasMore(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-2 sm:space-y-3">
			{players.map((player, index) => {
				const rank = index + 1;
				const winRate = player.winRate;
				const isPeakElo = player.currentElo === player.peakElo;

				return (
					<div
						key={player.userId}
						className={`flex items-center justify-between rounded-lg border p-2 transition-colors hover:bg-muted/50 sm:p-3 ${
							rank <= 3 ? "bg-muted/30" : ""
						}`}
					>
						<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
							<div className="flex w-5 items-center justify-center sm:w-6">
								{getRankIcon(rank)}
							</div>

							<Avatar className="h-8 w-8">
								<AvatarImage
									src={player.avatar || "/placeholder.svg"}
									alt={player.userName || "Player Avatar"}
								/>
								<AvatarFallback>
									{(player.userName || "Unknown Player")
										.split(" ")
										.map((n) => n[0])
										.join("")}
								</AvatarFallback>
							</Avatar>

							<div className="min-w-0 flex-1">
								<div className="truncate font-medium text-xs sm:text-sm">
									{player.userName || "Unknown"}
								</div>
								<div className="text-[10px] text-muted-foreground sm:hidden sm:text-xs">
									{player.wins}-{player.losses} • {winRate.toFixed(0)}%
								</div>
								<div className="hidden text-muted-foreground text-xs sm:block">
									{player.totalGames} games • {player.wins}W-{player.losses}L •{" "}
									{winRate.toFixed(1)}% WR
								</div>
							</div>
						</div>

						<div className="flex items-center gap-1 sm:gap-3">
							<div className="text-right">
								<div
									className={`font-bold text-sm sm:text-lg ${getEloColor(player.currentElo)}`}
								>
									{player.currentElo}
								</div>
								<div className="flex items-center gap-0.5 text-[10px] text-muted-foreground sm:gap-1 sm:text-xs">
									<TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
									<span className="sm:hidden">{player.peakElo}</span>
									<span className="hidden sm:inline">
										Peak: {player.peakElo}
									</span>
									{isPeakElo && (
										<Target className="h-2.5 w-2.5 text-green-500 sm:h-3 sm:w-3" />
									)}
								</div>
							</div>
						</div>
					</div>
				);
			})}

			{hasMore && (
				<div className="pt-1 text-center">
					<Button
						variant="outline"
						size="sm"
						onClick={loadMore}
						disabled={loading}
					>
						{loading ? "Loading..." : "Show more"}
					</Button>
				</div>
			)}
		</div>
	);
}
