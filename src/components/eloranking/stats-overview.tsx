import { GamepadIcon, TrendingUp, Trophy, Users } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { StatTile } from "~/components/ui/stat-tile";
import { getGlobalPeakEloHolder } from "~/server/actions/game/cross-tenant-discovery";
import { getLeaderboard, getRecentGames } from "~/server/actions/game/game";

function StatTileSkeleton() {
	return (
		<div className="space-y-2 rounded-2xl border bg-card p-4 shadow-xs">
			<Skeleton className="h-3 w-16" />
			<Skeleton className="h-6 w-14" />
		</div>
	);
}

export function StatsOverviewSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
			<StatTileSkeleton />
			<StatTileSkeleton />
			<StatTileSkeleton />
			<StatTileSkeleton />
		</div>
	);
}

function lastNameOf(fullName: string | null): string {
	if (!fullName) {
		return "Unbekannt";
	}
	const parts = fullName.trim().split(/\s+/);
	const last = parts[parts.length - 1];
	if (!last) {
		return "Unbekannt";
	}
	return last.charAt(0).toUpperCase() + last.slice(1);
}

export async function StatsOverview() {
	let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> | undefined;
	let peakHolder: Awaited<ReturnType<typeof getGlobalPeakEloHolder>> = null;
	try {
		[leaderboard, , peakHolder] = await Promise.all([
			getLeaderboard(100),
			getRecentGames(50),
			getGlobalPeakEloHolder(),
		]);
	} catch (error) {
		console.error("Failed to load stats:", error);
		return (
			<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
				<StatTile icon={<Users />} label="Spieler" value="–" />
				<StatTile icon={<GamepadIcon />} label="Spiele" value="–" />
				<StatTile icon={<TrendingUp />} label="Corps ELO" value="–" />
				<StatTile
					icon={<Trophy />}
					label="Rekord ELO"
					value="–"
					tone="warning"
				/>
			</div>
		);
	}

	const players = leaderboard ?? [];
	const totalPlayers = players.length;
	const totalGames = Math.round(
		players.reduce((sum, p) => sum + p.totalGames, 0) / 2,
	);
	const averageElo =
		totalPlayers > 0
			? Math.round(
					players.reduce((sum, p) => sum + p.currentElo, 0) / totalPlayers,
				)
			: 1200;

	const recordElo = peakHolder?.peakElo ?? 1200;
	const recordMeta = peakHolder ? (
		<span className="flex min-w-0 items-center gap-1">
			<span className="truncate font-medium text-foreground">
				{lastNameOf(peakHolder.name)}
			</span>
			{peakHolder.tenantSlug ? (
				<Badge
					variant="secondary"
					className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase"
				>
					{peakHolder.tenantSlug}
				</Badge>
			) : null}
		</span>
	) : undefined;

	return (
		<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
			<StatTile icon={<Users />} label="Spieler" value={totalPlayers} />
			<StatTile icon={<GamepadIcon />} label="Spiele" value={totalGames} />
			<StatTile icon={<TrendingUp />} label="Corps ELO" value={averageElo} />
			<StatTile
				icon={<Trophy />}
				label="Rekord ELO"
				value={recordElo}
				hint={recordMeta}
				tone="warning"
			/>
		</div>
	);
}
