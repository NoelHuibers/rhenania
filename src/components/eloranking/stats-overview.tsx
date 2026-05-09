import type { LucideIcon } from "lucide-react";
import { GamepadIcon, TrendingUp, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { getGlobalPeakEloHolder } from "~/server/actions/game/cross-tenant-discovery";
import { getLeaderboard, getRecentGames } from "~/server/actions/game/game";

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
	meta,
	tone,
}: {
	icon: LucideIcon;
	label: ReactNode;
	value: string | number;
	meta?: ReactNode;
	tone: StatTone;
}) {
	const styles = toneStyles[tone];
	return (
		<Card className="gap-0 py-3 transition-colors hover:bg-muted/30 sm:py-3.5">
			<CardContent className="flex items-center gap-3 px-3 sm:px-4">
				<div
					className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${styles.chip}`}
				>
					<Icon className="h-4 w-4 sm:h-5 sm:w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1.5 truncate font-medium text-[11px] text-muted-foreground sm:text-xs">
						{label}
					</div>
					<div className="flex min-w-0 items-baseline gap-2">
						<p
							className={`font-bold text-lg leading-tight ${styles.value} sm:text-2xl`}
						>
							{value}
						</p>
						{meta ? (
							<div className="flex min-w-0 items-baseline gap-1 truncate text-[11px] text-muted-foreground">
								{meta}
							</div>
						) : null}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function StatCardSkeleton() {
	return (
		<Card className="gap-0 py-3 sm:py-3.5">
			<CardContent className="flex items-center gap-3 px-3 sm:px-4">
				<Skeleton className="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-5 w-14 sm:h-6 sm:w-16" />
				</div>
			</CardContent>
		</Card>
	);
}

export function StatsOverviewSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</div>
	);
}

function lastNameOf(fullName: string | null): string {
	if (!fullName) return "Unbekannt";
	const parts = fullName.trim().split(/\s+/);
	const last = parts[parts.length - 1];
	if (!last) return "Unbekannt";
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
				<StatCard icon={Users} label="Spieler" value="–" tone="blue" />
				<StatCard icon={GamepadIcon} label="Spiele" value="–" tone="violet" />
				<StatCard
					icon={TrendingUp}
					label="Corps ELO"
					value="–"
					tone="emerald"
				/>
				<StatCard icon={Trophy} label="Rekord ELO" value="–" tone="amber" />
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
		<>
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
		</>
	) : undefined;

	return (
		<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
			<StatCard icon={Users} label="Spieler" value={totalPlayers} tone="blue" />
			<StatCard
				icon={GamepadIcon}
				label="Spiele"
				value={totalGames}
				tone="violet"
			/>
			<StatCard
				icon={TrendingUp}
				label="Corps ELO"
				value={averageElo}
				tone="emerald"
			/>
			<StatCard
				icon={Trophy}
				label="Rekord ELO"
				value={recordElo}
				meta={recordMeta}
				tone="amber"
			/>
		</div>
	);
}
