// control-repo.ts — accounts and memberships in the control DB (#33).
//
// The global identity (name, e-mail address, sessions, sign-in accounts,
// cross-Corps stats) and the memberships that tie it to a Corps. No
// caller checks, no rules. A failed query throws.

import "server-only";

import { and, eq } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import {
	accounts,
	users as controlUsers,
	sessions,
	tenantMemberships,
	userStats,
} from "~/server/db/control-schema";

/** Whether the person has a membership (of any status) in the Corps. */
export async function isMemberOf(
	userId: string,
	tenantId: string,
): Promise<boolean> {
	const [membership] = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.tenantId, tenantId),
			),
		)
		.limit(1);
	return !!membership;
}

/** The identity's e-mail address, or null if there is no such identity. */
export async function identityEmail(userId: string): Promise<string | null> {
	const [current] = await controlDb
		.select({ email: controlUsers.email })
		.from(controlUsers)
		.where(eq(controlUsers.id, userId))
		.limit(1);
	return current?.email ?? null;
}

export async function renameIdentity(userId: string, name: string, at: Date) {
	await controlDb
		.update(controlUsers)
		.set({ name, updatedAt: at })
		.where(eq(controlUsers.id, userId));
}

/** The identity row, or null. */
export async function identity(userId: string) {
	const [row] = await controlDb
		.select()
		.from(controlUsers)
		.where(eq(controlUsers.id, userId))
		.limit(1);
	return row ?? null;
}

export async function deleteMembership(userId: string, tenantId: string) {
	await controlDb
		.delete(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.tenantId, tenantId),
			),
		);
}

/** Whether the person is still a member of any Corps. */
export async function hasAnyMembership(userId: string): Promise<boolean> {
	const [remaining] = await controlDb
		.select({ tenantId: tenantMemberships.tenantId })
		.from(tenantMemberships)
		.where(eq(tenantMemberships.userId, userId))
		.limit(1);
	return !!remaining;
}

/** Deletes the identity with its sessions, accounts and cross-Corps stats. */
export async function deleteIdentity(userId: string) {
	await controlDb.delete(sessions).where(eq(sessions.userId, userId));
	await controlDb.delete(accounts).where(eq(accounts.userId, userId));
	// Cross-Corps stats only go when the identity does.
	await controlDb.delete(userStats).where(eq(userStats.userId, userId));
	await controlDb.delete(controlUsers).where(eq(controlUsers.id, userId));
}
