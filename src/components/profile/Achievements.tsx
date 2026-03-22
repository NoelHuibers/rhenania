"use client";

import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import {
	getUserAchievements,
	type UserAchievementData,
} from "~/server/actions/profile/achievements";

const CATEGORIES = [
	{ key: "all", label: "Alle" },
	{ key: "drinking", label: "Trinken" },
	{ key: "games", label: "Spiele" },
	{ key: "financial", label: "Finanzen" },
	{ key: "time", label: "Zeit" },
	{ key: "special", label: "Besonderes" },
] as const;

const RARITY_STYLES: Record<string, string> = {
	common: "bg-muted text-muted-foreground",
	uncommon:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	rare: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	epic: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
	legendary:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const RARITY_LABELS: Record<string, string> = {
	common: "Common",
	uncommon: "Uncommon",
	rare: "Rare",
	epic: "Epic",
	legendary: "Legendary",
};

function AchievementCard({ a }: { a: UserAchievementData }) {
	const isSecret = a.isSecret && !a.unlocked;
	const progressPct =
		a.targetValue && a.targetValue > 0
			? Math.min(100, Math.round((a.currentValue / a.targetValue) * 100))
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
				{!a.unlocked && a.targetValue !== null && !isSecret && (
					<div className="space-y-0.5">
						<Progress value={progressPct} className="h-1.5" />
						<p className="text-[10px] text-muted-foreground">
							{a.currentValue} / {a.targetValue}
						</p>
					</div>
				)}
				{a.unlocked && a.unlockedAt && (
					<p className="text-[10px] text-muted-foreground">
						Freigeschaltet{" "}
						{new Intl.DateTimeFormat("de-DE").format(new Date(a.unlockedAt))}
					</p>
				)}
			</div>
		</div>
	);
}

export function Achievements() {
	const [data, setData] = useState<UserAchievementData[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeCategory, setActiveCategory] = useState<string>("all");

	useEffect(() => {
		getUserAchievements()
			.then(setData)
			.finally(() => setLoading(false));
	}, []);

	const filtered =
		activeCategory === "all"
			? data
			: data.filter((a) => a.category === activeCategory);

	const unlocked = filtered.filter((a) => a.unlocked);
	const inProgress = filtered.filter((a) => !a.unlocked && a.currentValue > 0);
	const locked = filtered.filter((a) => !a.unlocked && a.currentValue === 0);

	const totalPoints = data
		.filter((a) => a.unlocked)
		.reduce((sum, a) => sum + a.points, 0);
	const totalUnlocked = data.filter((a) => a.unlocked).length;

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Achievements</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse space-y-3">
						{[...Array(4)].map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<div key={i} className="h-16 rounded-lg bg-muted" />
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Achievements</CardTitle>
					<div className="text-muted-foreground text-sm">
						<span className="font-semibold text-foreground">
							{totalUnlocked}
						</span>
						/{data.length} ·{" "}
						<span className="font-semibold text-foreground">{totalPoints}</span>{" "}
						Punkte
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Category filter */}
				<div className="flex flex-wrap gap-2">
					{CATEGORIES.map((cat) => (
						<button
							type="button"
							key={cat.key}
							onClick={() => setActiveCategory(cat.key)}
							className={`rounded-full border px-3 py-1 text-xs transition-colors ${
								activeCategory === cat.key
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-transparent text-muted-foreground hover:border-foreground"
							}`}
						>
							{cat.label}
						</button>
					))}
				</div>

				{/* Unlocked */}
				{unlocked.length > 0 && (
					<div className="space-y-2">
						<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Freigeschaltet ({unlocked.length})
						</p>
						<div className="grid grid-cols-1 gap-2">
							{unlocked.map((a) => (
								<AchievementCard key={a.id} a={a} />
							))}
						</div>
					</div>
				)}

				{/* In progress */}
				{inProgress.length > 0 && (
					<div className="space-y-2">
						<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							In Bearbeitung ({inProgress.length})
						</p>
						<div className="grid grid-cols-1 gap-2">
							{inProgress.map((a) => (
								<AchievementCard key={a.id} a={a} />
							))}
						</div>
					</div>
				)}

				{/* Locked */}
				{locked.length > 0 && (
					<div className="space-y-2">
						<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Gesperrt ({locked.length})
						</p>
						<div className="grid grid-cols-1 gap-2">
							{locked.map((a) => (
								<AchievementCard key={a.id} a={a} />
							))}
						</div>
					</div>
				)}

				{filtered.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Keine Achievements in dieser Kategorie.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
