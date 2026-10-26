// GamesEloContainerDetailed.tsx
import { isEloEnabledForUser } from "~/server/actions/profile/preferences";
import { auth } from "~/server/auth";
import { getEloStatsForUser } from "~/server/lib/elo-stats";
import { EloDisabledCard } from "./EloDisabledCard";
import { GamesElo } from "./GamesElo";

export async function GamesEloContainerDetailed() {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view game statistics");
	}
	const userId = session.user.id;

	if (!(await isEloEnabledForUser(userId))) {
		return <EloDisabledCard />;
	}

	const { stats, eloHistory } = await getEloStatsForUser(userId);

	return <GamesElo userStats={stats} eloHistory={eloHistory} />;
}
