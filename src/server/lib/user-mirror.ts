// user-mirror.ts — keep tenant-DB `users` rows in sync with the control DB.
//
// The control DB owns the user identity. Tenant DBs hold a denormalized copy
// of `users` (same shape) so existing joins stay simple and FK references on
// tenant tables (orders.userId, games.player1Id, etc.) keep working.
//
// Usage:
//   - On user create: call `mirrorUserToTenant(user, currentTenantId)`.
//   - On user update: call `mirrorUserToAllMemberTenants(user)` — fans out.
//   - Profile edits (name, avatar): `updateUserIdentity(userId, patch)`
//     writes the control DB and fans out in one step.
//   - On membership create: call `mirrorUserToTenant(user, newTenantId)`.

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users as tenantUsers } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";

export type MirroredUser = {
	id: string;
	name: string | null;
	email: string;
	emailVerified: boolean;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export async function mirrorUserToTenant(
	user: MirroredUser,
	tenantId: string,
): Promise<void> {
	const tdb = await getTenantDb(tenantId);

	await tdb
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
		});
}

export async function mirrorUserToAllMemberTenants(
	user: MirroredUser,
): Promise<void> {
	const memberships = await controlDb
		.select({ tenantId: tenantMemberships.tenantId })
		.from(tenantMemberships)
		.where(eq(tenantMemberships.userId, user.id));

	await Promise.all(
		memberships.map((m) =>
			mirrorUserToTenant(user, m.tenantId).catch((err) => {
				console.error(
					`Failed to mirror user ${user.id} to tenant ${m.tenantId}:`,
					err,
				);
			}),
		),
	);
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
