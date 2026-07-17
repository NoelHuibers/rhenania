// GamesEloContainerDetailed.tsx
import { and, eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db/index";
import { userPreferences } from "~/server/db/schema";
import { getEloStatsForUser } from "~/server/lib/elo-stats";
import EloDisabledCard from "./EloDisabledCard";
import { GamesElo } from "./GamesElo";

const ELO_KEY = "gamification.eloEnabled";

export default async function GamesEloContainerDetailed() {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view game statistics");
	}
	const userId = session.user.id;

	const prefRow = await db
		.select({ value: userPreferences.value })
		.from(userPreferences)
		.where(
			and(eq(userPreferences.userId, userId), eq(userPreferences.key, ELO_KEY)),
		)
		.limit(1);

	const eloEnabled =
		prefRow.length === 0
			? true
			: (JSON.parse(prefRow[0]?.value ?? "true") as boolean) === true;

	if (!eloEnabled) {
		return <EloDisabledCard />;
	}

	const { stats, eloHistory } = await getEloStatsForUser(userId);

	return <GamesElo userStats={stats} eloHistory={eloHistory} />;
}
