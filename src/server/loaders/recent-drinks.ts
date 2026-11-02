// recent-drinks.ts — the "Zuletzt bestellt" shortcuts on /trinken (#74).

import "server-only";

import type { auth } from "~/server/auth";
import { scopeOf } from "~/server/lib/tenant-scope";
import { recentDrinkIds } from "~/server/modules/drinks/service";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * Ids of the signed-in member's most ordered available drinks of the last
 * 30 days. Takes the page's session, so the user id never comes from the
 * client and the page's own check is the only one.
 */
export async function loadRecentDrinkIds(session: Session): Promise<string[]> {
	return recentDrinkIds(await scopeOf(session.tenantId), session.user.id);
}
