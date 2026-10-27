// user-mirror.ts — keep tenant-DB `users` rows in sync with the control DB.
//
// The control DB owns the user identity. Tenant DBs hold a denormalized copy
// of `users` (same shape) so existing joins stay simple and FK references on
// tenant tables (orders.userId, games.player1Id, etc.) keep working.
//
// The mirror is a projection: every write here is idempotent, retried a few
// times on failure and logged when it finally fails. Whatever still drifts
// (a tenant DB down during signup, a crash between the control write and the
// mirror write) is repaired by `reconcileUserMirror` in
// `user-mirror-reconcile.ts` (`pnpm ops:reconcile-user-mirror`).
//
// Usage:
//   - On user create: call `mirrorUserToTenant(user, currentTenantId)`.
//   - On user update: call `mirrorUserToAllMemberTenants(user)` — fans out.
//   - Profile edits (name, avatar): `updateUserIdentity(userId, patch)`
//     writes the control DB and fans out in one step.
//   - On membership create: call `mirrorUserToTenant(user, newTenantId)`.

import { and, eq, ne, sql } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users as tenantUsers } from "~/server/db/schema";
import { getTenantDb, type TenantDb } from "~/server/db/tenants";
import { log } from "~/server/lib/log";

export type MirroredUser = {
	id: string;
	name: string | null;
	email: string;
	emailVerified: boolean;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
};

/** Pauses between attempts of one mirror write (3 attempts in total). */
export const MIRROR_RETRY_DELAYS_MS = [100, 500];

/**
 * E-mail a mirror row gets when the control DB has given its address to
 * another user. Unique per row and never deliverable (RFC 2606 `.invalid`).
 */
export const releasedEmailSql = sql<string>`'released+' || ${tenantUsers.id} || '@user-mirror.invalid'`;

/**
 * Writes the mirror row into an already opened tenant DB. Idempotent.
 *
 * `user.email` is UNIQUE in the tenant DB, but the control DB can hand an
 * address to another user (e-mail change, swap between two accounts). Any
 * other row still holding the address is stale by definition, so it is
 * released in the same transaction instead of wedging the write.
 */
export async function upsertUserMirror(
	tdb: TenantDb,
	user: MirroredUser,
): Promise<void> {
	await tdb.batch([
		tdb
			.update(tenantUsers)
			.set({ email: releasedEmailSql })
			.where(
				and(eq(tenantUsers.email, user.email), ne(tenantUsers.id, user.id)),
			),
		tdb
			.insert(tenantUsers)
			.values({
				id: user.id,
				name: user.name,
				email: user.email,
				emailVerified: user.emailVerified,
				image: user.image,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			})
			.onConflictDoUpdate({
				target: tenantUsers.id,
				set: {
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					image: user.image,
					updatedAt: user.updatedAt,
				},
			}),
	]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirrors one identity into one tenant DB, retrying transient failures.
 * Logs and rethrows when every attempt failed.
 */
export async function mirrorUserToTenant(
	user: MirroredUser,
	tenantId: string,
): Promise<void> {
	try {
		// Not retried: an unknown or suspended tenant won't heal in 500 ms.
		const tdb = await getTenantDb(tenantId);
		for (let attempt = 0; ; attempt++) {
			try {
				await upsertUserMirror(tdb, user);
				return;
			} catch (error) {
				const delay = MIRROR_RETRY_DELAYS_MS[attempt];
				if (delay === undefined) {
					throw error;
				}
				await log.warn("user mirror write failed, retrying", {
					mirroredUserId: user.id,
					mirrorTenantId: tenantId,
					attempt: attempt + 1,
					err: error,
				});
				await sleep(delay);
			}
		}
	} catch (error) {
		await log.error("user mirror write failed", {
			mirroredUserId: user.id,
			mirrorTenantId: tenantId,
			err: error,
		});
		throw error;
	}
}

/**
 * Mirrors an identity into every tenant it is a member of. A failing tenant
 * doesn't stop the others; it is logged and returned so callers can tell.
 */
export async function mirrorUserToAllMemberTenants(
	user: MirroredUser,
): Promise<{ failedTenantIds: string[] }> {
	const memberships = await controlDb
		.select({ tenantId: tenantMemberships.tenantId })
		.from(tenantMemberships)
		.where(eq(tenantMemberships.userId, user.id));

	const results = await Promise.allSettled(
		memberships.map((m) => mirrorUserToTenant(user, m.tenantId)),
	);
	return {
		failedTenantIds: memberships
			.filter((_, i) => results[i]?.status === "rejected")
			.map((m) => m.tenantId),
	};
}

/**
 * Changes profile fields on the global identity (the source of truth) and
 * fans the result out to every tenant mirror. Writing only a mirror would be
 * undone by the next fan-out. Returns null if the identity does not exist.
 */
export async function updateUserIdentity(
	userId: string,
	patch: { name?: string | null; image?: string | null },
): Promise<MirroredUser | null> {
	const [user] = await controlDb
		.update(controlUsers)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(controlUsers.id, userId))
		.returning();
	if (!user) {
		return null;
	}
	const mirrored: MirroredUser = {
		id: user.id,
		name: user.name,
		email: user.email,
		emailVerified: user.emailVerified,
		image: user.image,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
	await mirrorUserToAllMemberTenants(mirrored);
	return mirrored;
}
