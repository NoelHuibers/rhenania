"use client";

import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";

export const CATEGORIES = [
	{ key: "all", label: "Alle" },
	{ key: "drinking", label: "Trinken" },
	{ key: "games", label: "Spiele" },
	{ key: "financial", label: "Finanzen" },
	{ key: "time", label: "Zeit" },
	{ key: "special", label: "Besonderes" },
] as const;

export const RARITY_STYLES: Record<string, string> = {
	common: "bg-muted text-muted-foreground",
	uncommon:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	rare: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	epic: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
	legendary:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export const RARITY_LABELS: Record<string, string> = {
	common: "Common",
	uncommon: "Uncommon",
	rare: "Rare",
	epic: "Epic",
	legendary: "Legendary",
};

// Superset of the own-profile (with progress) and public-profile
// (unlocked-only) achievement shapes.
export type AchievementCardData = {
	id: string;
	name: string;
	description: string;
	category: "drinking" | "games" | "social" | "financial" | "time" | "special";
	icon: string | null;
	points: number;
	rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
	unlocked: boolean;
	unlockedAt: Date | null;
	unlockPercent: number;
	isSecret?: boolean;
	targetValue?: number | null;
	currentValue?: number;
};

export function AchievementCard({ a }: { a: AchievementCardData }) {
	const isSecret = (a.isSecret ?? false) && !a.unlocked;
	const targetValue = a.targetValue ?? null;
	const currentValue = a.currentValue ?? 0;
	const progressPct =
		targetValue && targetValue > 0
			? Math.min(100, Math.round((currentValue / targetValue) * 100))
			: 0;

	return (
		<div
			className={`flex gap-3 rounded-lg border p-4 transition-opacity ${
				a.unlocked ? "opacity-100" : "opacity-50"
			}`}
		>
			<div className="w-9 shrink-0 text-center text-2xl">
				{isSecret ? "🔒" : (a.icon ?? "🏆")}
			</div>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-start justify-between gap-2">
					<p className="font-medium text-sm leading-tight">
						{isSecret ? "???" : a.name}
					</p>
					<div className="flex shrink-0 items-center gap-1">
						<span className="text-muted-foreground text-xs">+{a.points}</span>
						<Badge
							className={`px-1.5 py-0 text-[10px] ${RARITY_STYLES[a.rarity]}`}
						>
							{RARITY_LABELS[a.rarity]}
						</Badge>
					</div>
				</div>
				<p className="text-muted-foreground text-xs leading-tight">
					{isSecret ? "Geheimes Achievement" : a.description}
				</p>
				{!a.unlocked && targetValue !== null && !isSecret && (
					<div className="space-y-0.5">
						<Progress value={progressPct} className="h-1.5" />
						<p className="text-[10px] text-muted-foreground">
							{currentValue} / {targetValue}
						</p>
					</div>
				)}
				{a.unlocked && a.unlockedAt && (
					<p className="text-[10px] text-muted-foreground">
						Freigeschaltet{" "}
						{new Intl.DateTimeFormat("de-DE").format(new Date(a.unlockedAt))}
					</p>
				)}
				{!isSecret && (
					<p className="text-[10px] text-muted-foreground">
						{a.unlockPercent} % haben dies freigeschaltet
					</p>
				)}
			</div>
		</div>
	);
}
