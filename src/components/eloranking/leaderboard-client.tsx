"use client";

import { Target, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getGlobalLeaderboard } from "~/server/actions/game/cross-tenant-discovery";
import { getLeaderboard } from "~/server/actions/game/game";

export type LeaderboardScope = "global" | "internal";

export type LeaderboardEntry = {
	userId: string;
	userName: string | null;
	userEmail: string | null;
	avatar: string | null;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	winRate: number;
	peakElo: number;
	tenantSlug?: string;
	tenantName?: string;
};

const PAGE_SIZE = 10;
const INITIAL_SIZE = 20;

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

async function fetchPage(
	scope: LeaderboardScope,
	limit: number,
	offset: number,
): Promise<LeaderboardEntry[]> {
	if (scope === "global") {
		const rows = await getGlobalLeaderboard(limit, offset);
		return rows.map((r) => ({
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
	}
	const rows = await getLeaderboard(limit, offset);
	return rows.map((r) => ({
		userId: r.userId,
		userName: r.userName,
		userEmail: r.userEmail,
		avatar: r.avatar ?? null,
		currentElo: r.currentElo,
		totalGames: r.totalGames,
		wins: r.wins,
		losses: r.losses,
		winRate: r.winRate,
		peakElo: r.peakElo ?? r.currentElo,
	}));
}

export function LeaderboardClient({
	initialPlayers,
	initialScope = "global",
}: {
	initialPlayers: LeaderboardEntry[];
	initialScope?: LeaderboardScope;
}) {
	const [scope, setScope] = useState<LeaderboardScope>(initialScope);
	const [players, setPlayers] = useState(initialPlayers);
	const [hasMore, setHasMore] = useState(
		initialPlayers.length === INITIAL_SIZE,
	);
	const [loading, setLoading] = useState(false);
	const [isSwitching, startSwitch] = useTransition();
	const isFirstRender = useRef(true);

	// Load fresh data whenever the user toggles scope. Skip on first mount —
	// the SSR-rendered `initialPlayers` already cover that.
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}
		startSwitch(async () => {
			const next = await fetchPage(scope, INITIAL_SIZE, 0);
			setPlayers(next);
			setHasMore(next.length === INITIAL_SIZE);
		});
	}, [scope]);

	async function loadMore() {
		setLoading(true);
		try {
			const next = await fetchPage(scope, PAGE_SIZE, players.length);
			setPlayers((prev) => [...prev, ...next]);
			if (next.length < PAGE_SIZE) setHasMore(false);
		} finally {
			setLoading(false);
		}
	}

	const toggle = (
		<div
			className="inline-flex rounded-md border bg-muted/40 p-0.5"
			role="tablist"
		>
			<button
				type="button"
				role="tab"
				aria-selected={scope === "global"}
				onClick={() => setScope("global")}
				disabled={isSwitching}
				className={`rounded px-3 py-1 font-medium text-xs transition-colors ${
					scope === "global"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
				}`}
			>
				Global
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={scope === "internal"}
				onClick={() => setScope("internal")}
				disabled={isSwitching}
				className={`rounded px-3 py-1 font-medium text-xs transition-colors ${
					scope === "internal"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
				}`}
			>
				Intern
			</button>
		</div>
	);

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="flex items-center gap-2 text-base sm:text-lg">
						<Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
						ELO Leaderboard
					</CardTitle>
					{toggle}
				</div>
			</CardHeader>
			<CardContent className="space-y-3 px-2 pt-0 sm:px-6">
				<div
					className={`space-y-2 sm:space-y-3 ${isSwitching ? "opacity-60" : ""}`}
				>
					{players.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground text-sm">
							{scope === "global"
								? "Noch keine globalen Spiele gespielt."
								: "Noch keine internen Spiele gespielt."}
						</div>
					) : (
						players.map((player, index) => {
							const rank = index + 1;
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

										{(() => {
											const avatarAndName = (
												<>
													<Avatar className="h-8 w-8">
														<AvatarImage
															src={player.avatar || "/placeholder.svg"}
															alt={player.userName || "Player Avatar"}
														/>
														<AvatarFallback>
															{(player.userName || "?")
																.split(" ")
																.map((n) => n[0])
																.join("")
																.slice(0, 2)
																.toUpperCase()}
														</AvatarFallback>
													</Avatar>

													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-1.5">
															<span className="truncate font-medium text-xs group-hover:underline sm:text-sm">
																{player.userName || "Unknown"}
															</span>
															{player.tenantSlug ? (
																<Badge
																	variant="secondary"
																	className="shrink-0 font-mono text-[10px]"
																>
																	{player.tenantSlug}
																</Badge>
															) : null}
														</div>
														<div className="text-[10px] text-muted-foreground sm:hidden">
															{player.wins}-{player.losses} •{" "}
															{player.winRate.toFixed(0)}%
														</div>
														<div className="hidden text-muted-foreground text-xs sm:block">
															{player.totalGames} games • {player.wins}W-
															{player.losses}L • {player.winRate.toFixed(1)}% WR
														</div>
													</div>
												</>
											);

											// Foreign-tenant rows (global scope) carry a tenantSlug —
											// those users don't exist in this tenant's DB, so no link.
											return player.tenantSlug ? (
												<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
													{avatarAndName}
												</div>
											) : (
												<Link
													href={`/profile/${player.userId}`}
													className="group flex min-w-0 flex-1 items-center gap-2 sm:gap-3"
												>
													{avatarAndName}
												</Link>
											);
										})()}
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
						})
					)}
				</div>

				{hasMore && (
					<div className="pt-1 text-center">
						<Button
							variant="outline"
							size="sm"
							onClick={loadMore}
							disabled={loading || isSwitching}
						>
							{loading ? "Loading..." : "Show more"}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
