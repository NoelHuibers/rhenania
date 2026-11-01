// elo-stats.ts — the ELO card of /profile.

import "server-only";

import type { auth } from "~/server/auth";
import { scopeOf } from "~/server/lib/tenant-scope";
import { eloStatsOf } from "~/server/modules/games/service";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * The signed-in member's unified ELO stats and their ELO history in this
 * Corps. Takes the page's session, so the page's own check is the only one.
 */
export async function loadEloStats(session: Session) {
	return eloStatsOf(await scopeOf(session.tenantId), session.user.id);
}
