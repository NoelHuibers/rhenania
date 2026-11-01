// GamesEloContainerDetailed.tsx

import { auth } from "~/server/auth";
import { isEloEnabledForUser } from "~/server/lib/preferences";
import { loadEloStats } from "~/server/loaders/elo-stats";
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

	const { stats, eloHistory } = await loadEloStats(session);

	return <GamesElo userStats={stats} eloHistory={eloHistory} />;
}
