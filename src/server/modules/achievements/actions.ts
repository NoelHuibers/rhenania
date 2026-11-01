"use server";

// actions.ts — the achievements read of /profile (#33): check the caller,
// then one call to the achievements service. Tracking has no action of its
// own; the actions that cause an event (orders, games, the avatar, new
// accounts) call the service with their scope.

import { requireCaller } from "~/server/lib/authz";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as achievements from "./service";

export type { UserAchievementData } from "./service";

/** The caller's achievements; throws "Nicht angemeldet" if signed out. */
export async function getUserAchievements(): Promise<
	achievements.UserAchievementData[]
> {
	const { member, tenantId } = await requireCaller();
	return achievements.achievementsOf(await scopeOf(tenantId), member.id);
}
