import type { LucideIcon } from "lucide-react";
import { GamepadIcon, TrendingUp, Trophy, Users } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { getLeaderboard, getRecentGames } from "~/server/actions/game/game";
import { getCurrentTenant } from "~/server/lib/tenant-context";

type StatTone = "blue" | "violet" | "emerald" | "amber";

const toneStyles: Record<StatTone, { chip: string; value: string }> = {
	blue: {
		chip: "bg-blue-500/10 text-blue-500",
		value: "text-foreground",
	},
	violet: {
		chip: "bg-violet-500/10 text-violet-500",
		value: "text-foreground",
	},
	emerald: {
		chip: "bg-emerald-500/10 text-emerald-500",
		value: "text-foreground",
	},
	amber: {
		chip: "bg-amber-500/10 text-amber-500",
		value: "text-amber-500",
	},
};

function StatCard({
	icon: Icon,
	label,
	value,
	caption,
	tone,
}: {
	icon: LucideIcon;
	label: string;
	value: string | number;
	caption: string;
	tone: StatTone;
}) {
	const styles = toneStyles[tone];
	return (
		<Card className="transition-colors hover:bg-muted/30">
			<CardContent className="flex items-center gap-3 p-4">
				<div
					className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${styles.chip}`}
				>
					<Icon className="h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-muted-foreground text-xs">
						{label}
					</p>
					<p className={`font-bold text-2xl leading-tight ${styles.value}`}>
						{value}
					</p>
					<p className="truncate text-[11px] text-muted-foreground">
						{caption}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function StatCardSkeleton() {
	return (
		<Card>
			<CardContent className="flex items-center gap-3 p-4">
				<Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-16" />
					<Skeleton className="h-3 w-28" />
				</div>
			</CardContent>
		</Card>
	);
}

export function StatsOverviewSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</div>
	);
}

export async function StatsOverview() {
	const tenant = await getCurrentTenant();
	const corpsName = tenant?.displayName ?? "Corps";

	let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> | undefined;
	try {
		[leaderboard] = await Promise.all([
			getLeaderboard(100),
			getRecentGames(50),
		]);
	} catch (error) {
		console.error("Failed to load stats:", error);
		return (
			<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
				<StatCard
					icon={Users}
					label="Spieler"
					value="–"
					caption="Daten nicht verfügbar"
					tone="blue"
				/>
				<StatCard
					icon={GamepadIcon}
					label="Spiele"
					value="–"
					caption="Daten nicht verfügbar"
					tone="violet"
				/>
				<StatCard
					icon={TrendingUp}
					label="Corps ELO"
					value="–"
					caption="Daten nicht verfügbar"
					tone="emerald"
				/>
				<StatCard
					icon={Trophy}
					label="Top ELO"
					value="–"
					caption="Daten nicht verfügbar"
					tone="amber"
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
	const highestElo =
		totalPlayers > 0 ? Math.max(...players.map((p) => p.currentElo)) : 1200;

	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
			<StatCard
				icon={Users}
				label="Spieler"
				value={totalPlayers}
				caption="Ranked Bierjungen"
				tone="blue"
			/>
			<StatCard
				icon={GamepadIcon}
				label="Spiele"
				value={totalGames}
				caption="Insgesamt gespielt"
				tone="violet"
			/>
			<StatCard
				icon={TrendingUp}
				label="Corps ELO"
				value={averageElo}
				caption={`Durchschnitt ${corpsName}`}
				tone="emerald"
			/>
			<StatCard
				icon={Trophy}
				label="Top ELO"
				value={highestElo}
				caption="Aktueller Champion"
				tone="amber"
			/>
		</div>
	);
}
