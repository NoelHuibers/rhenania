"use client";

import type { LucideIcon } from "lucide-react";
import {
	Calendar,
	Swords,
	Target,
	TrendingDown,
	TrendingUp,
	Trophy,
} from "lucide-react";

type NullableDate = Date | string | null;

export interface UserStats {
	id: string;
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

interface KPIStatCardProps {
	icon: LucideIcon;
	iconClassName?: string;
	label: string;
	children: React.ReactNode;
	trend?: "up" | "down" | null;
}

function KPIStatCard({
	icon: Icon,
	iconClassName,
	label,
	children,
}: KPIStatCardProps) {
	return (
		<div className="relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
			<div className="flex items-center gap-2">
				<span className="inline-flex h-6 w-6 items-center justify-center">
					<Icon className={`h-4 w-4 ${iconClassName ?? "text-primary"}`} />
				</span>
				<p className="font-medium text-muted-foreground text-xs">{label}</p>
			</div>
			<div className="mt-2">{children}</div>
		</div>
	);
}

function formatDateDE(value: NullableDate) {
	if (!value) return "Nie";
	const d = new Date(value);
	return d.toLocaleDateString("de-DE", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function KPIGrid({
	userStats,
	eloTrend,
	trendPercentage: _trendPercentage,
	winRate,
}: KPIGridProps) {
	return (
		<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
			{/* Aktuelle Elo */}
			<KPIStatCard icon={Target} label="Derzeitige Elo">
				<div className="flex items-baseline gap-2">
					<p className="font-bold text-2xl text-primary">
						{userStats.currentElo}
					</p>

					{eloTrend !== 0 && (
						<span
							className={`inline-flex items-center gap-1 font-medium text-sm ${
								eloTrend > 0 ? "text-green-600" : "text-red-600"
							}`}
						>
							{eloTrend > 0 ? (
								<TrendingUp className="h-4 w-4" />
							) : (
								<TrendingDown className="h-4 w-4" />
							)}
						</span>
					)}
				</div>
			</KPIStatCard>

			{/* Peak Elo */}
			<KPIStatCard
				icon={Trophy}
				iconClassName="text-yellow-500"
				label="Maximale Steilheit"
			>
				<p className="font-semibold text-xl">{userStats.peakElo}</p>
			</KPIStatCard>

			{/* Gesamtspiele */}
			<KPIStatCard
				icon={Swords}
				iconClassName="text-blue-500"
				label="Anzahl Schnelle"
			>
				<p className="font-semibold text-xl">{userStats.totalGames}</p>
			</KPIStatCard>

			{/* Win Rate */}
			<KPIStatCard
				icon={Target}
				iconClassName="text-green-600"
				label="Win Rate"
			>
				<p className="font-semibold text-green-600 text-xl">{winRate}%</p>
				<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-green-500 transition-all duration-500"
						style={{ width: `${winRate}%` }}
					/>
				</div>
			</KPIStatCard>

			{/* W / L */}
			<KPIStatCard
				icon={Swords}
				iconClassName="text-muted-foreground"
				label="W / L"
			>
				<p className="font-semibold text-xl">
					<span className="text-green-600">{userStats.wins}</span>
					<span className="mx-1 text-muted-foreground">/</span>
					<span className="text-red-600">{userStats.losses}</span>
				</p>
			</KPIStatCard>

			{/* Letztes Spiel */}
			<KPIStatCard
				icon={Calendar}
				iconClassName="text-purple-500"
				label="Letztes Schnelles"
			>
				<p className="font-medium text-sm">
					{formatDateDE(userStats.lastGameAt)}
				</p>
			</KPIStatCard>
		</div>
	);
}
