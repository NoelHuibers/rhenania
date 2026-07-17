"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	getUserAchievements,
	type UserAchievementData,
} from "~/server/actions/profile/achievements";
import { AchievementCard, CATEGORIES } from "./achievement-ui";

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
