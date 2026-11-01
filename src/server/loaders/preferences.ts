// preferences.ts — the signed-in member's switches on /profile.

import "server-only";

import type { auth } from "~/server/auth";
import { scopeOf } from "~/server/lib/tenant-scope";
import {
	isEloEnabled,
	type ProfilePreferences,
	profilePreferences,
} from "~/server/modules/preferences/service";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * The profile page's switches, in one query. Takes the page's session, so
 * the page's own check is the only one.
 */
export async function loadProfilePreferences(
	session: Session,
): Promise<ProfilePreferences> {
	return profilePreferences(await scopeOf(session.tenantId), session.user.id);
}

/** Whether the signed-in member takes part in ELO (the profile's ELO card). */
export async function loadEloEnabled(session: Session): Promise<boolean> {
	return isEloEnabled(await scopeOf(session.tenantId), session.user.id);
}
