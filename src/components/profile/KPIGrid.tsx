"use client";

import {
	Calendar,
	Swords,
	Target,
	TrendingDown,
	TrendingUp,
	Trophy,
} from "lucide-react";
import { StatTile } from "~/components/ui/stat-tile";
import { formatDate } from "~/lib/format";

type NullableDate = Date | string | null;

// Mirrors the unified `userStats` row shape (control DB). The legacy `id`
// column doesn't exist there — the row is keyed on `userId`.
export interface UserStats {
	userId: string;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	lastGameAt: NullableDate;
	peakElo: number;
	createdAt: Date | string;
	updatedAt: Date | string;
}

export interface KPIGridProps {
	userStats: UserStats;
	eloTrend: number;
	trendPercentage: number;
	winRate: number;
}

function formatLastGame(value: NullableDate) {
	if (!value) {
		return "Nie";
	}
	return formatDate(value, "short");
}

export function KPIGrid({
	userStats,
	eloTrend,
	trendPercentage: _trendPercentage,
	winRate,
}: KPIGridProps) {
	return (
		<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
			<StatTile
				icon={<Target />}
				label="Derzeitige Elo"
				value={
					<span className="flex items-baseline gap-2">
						{userStats.currentElo}
						{eloTrend !== 0 && (
							<span
								className={`inline-flex items-center font-medium text-sm ${
									eloTrend > 0 ? "text-success" : "text-destructive"
								}`}
							>
								{eloTrend > 0 ? (
									<TrendingUp aria-hidden="true" className="size-4" />
								) : (
									<TrendingDown aria-hidden="true" className="size-4" />
								)}
								<span className="sr-only">
									{eloTrend > 0 ? "steigend" : "fallend"}
								</span>
							</span>
						)}
					</span>
				}
			/>
			<StatTile
				icon={<Trophy />}
				label="Maximale Steilheit"
				value={userStats.peakElo}
			/>
			<StatTile
				icon={<Swords />}
				label="Anzahl Schnelle"
				value={userStats.totalGames}
			/>
			<StatTile
				icon={<Target />}
				label="Win Rate"
				value={`${winRate}%`}
				tone="success"
			>
				<div
					aria-hidden="true"
					className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
				>
					<div
						className="h-full rounded-full bg-success transition-all duration-500"
						style={{ width: `${winRate}%` }}
					/>
				</div>
			</StatTile>
			<StatTile
				icon={<Swords />}
				label="W / L"
				value={
					<>
						<span className="text-success">{userStats.wins}</span>
						<span className="mx-1 text-muted-foreground">/</span>
						<span className="text-destructive">{userStats.losses}</span>
					</>
				}
			/>
			<StatTile
				icon={<Calendar />}
				label="Letztes Schnelles"
				value={formatLastGame(userStats.lastGameAt)}
			/>
		</div>
	);
}
