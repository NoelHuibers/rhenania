"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ChipGroup } from "~/components/ui/chip-group";
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
				<ChipGroup
					aria-label="Kategorie"
					value={activeCategory}
					onValueChange={setActiveCategory}
					options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
				/>

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
