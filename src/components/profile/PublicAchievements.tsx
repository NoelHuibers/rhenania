"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { PublicAchievement } from "~/server/actions/profile/public-profile";
import { AchievementCard, CATEGORIES } from "./achievement-ui";

interface PublicAchievementsProps {
	achievements: PublicAchievement[];
	totalPoints: number;
}

export function PublicAchievements({
	achievements,
	totalPoints,
}: PublicAchievementsProps) {
	const [activeCategory, setActiveCategory] = useState<string>("all");

	const filtered =
		activeCategory === "all"
			? achievements
			: achievements.filter((a) => a.category === activeCategory);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Achievements</CardTitle>
					<div className="text-muted-foreground text-sm">
						<span className="font-semibold text-foreground">
							{achievements.length}
						</span>{" "}
						Achievements ·{" "}
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

				{filtered.length > 0 ? (
					<div className="grid grid-cols-1 gap-2">
						{filtered.map((a) => (
							<AchievementCard key={a.id} a={{ ...a, unlocked: true }} />
						))}
					</div>
				) : (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Keine Achievements in dieser Kategorie.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
