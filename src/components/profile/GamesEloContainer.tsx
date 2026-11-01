// GamesEloContainerDetailed.tsx

import { auth } from "~/server/auth";
import { loadEloStats } from "~/server/loaders/elo-stats";
import { loadEloEnabled } from "~/server/loaders/preferences";
import { EloDisabledCard } from "./EloDisabledCard";
import { GamesElo } from "./GamesElo";

export async function GamesEloContainerDetailed() {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view game statistics");
	}
	if (!(await loadEloEnabled(session))) {
		return <EloDisabledCard />;
	}

	const { stats, eloHistory } = await loadEloStats(session);

	return <GamesElo userStats={stats} eloHistory={eloHistory} />;
}
