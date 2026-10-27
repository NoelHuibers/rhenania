// user-mirror-reconcile.ts — bring a tenant's `user` mirror back in line
// with the control DB (#35).
//
// The live write paths (`user-mirror.ts`) are best effort across two
// databases: a tenant DB that is down during signup, or a crash between the
// control write and the mirror write, leaves a membership without a mirror
// row or a stale name/e-mail. `reconcileUserMirror` repairs one tenant:
//
//   - every membership (active, suspended or pending) gets a mirror row,
//   - name, e-mail, e-mail verification and image follow the control DB,
//   - rows of users who are no longer members stay where they are, because
//     orders, games and bills reference them. They are not refreshed either:
//     a Corps someone has left doesn't learn their new name or address.
//   - a non-member row holding an address the control DB now gives to a
//     member is released (see `releasedEmailSql`), otherwise the UNIQUE
//     e-mail would block the member's row.
//
// Idempotent; a dry run computes the same report without writing.

import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as controlSchema from "~/server/db/control-schema";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users as tenantUsers } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { type MirroredUser, upsertUserMirror } from "./user-mirror";

export type ControlDb = LibSQLDatabase<typeof controlSchema>;

/** Fields the mirror copies from the control DB and reconcile compares. */
export const MIRROR_FIELDS = [
	"name",
	"email",
	"emailVerified",
	"image",
] as const;
export type MirrorField = (typeof MIRROR_FIELDS)[number];

export type MirrorRow = Pick<MirroredUser, "id" | MirrorField>;

export type MirrorPlan = {
	insert: MirroredUser[];
	update: Array<{ user: MirroredUser; fields: MirrorField[] }>;
	/** Non-member rows whose e-mail a member needs. */
	release: Array<{ userId: string; email: string }>;
};

/** Pure diff of a tenant's members (control DB) against its mirror rows. */
export function planUserMirror(
	members: MirroredUser[],
	mirror: MirrorRow[],
): MirrorPlan {
	const rows = new Map(mirror.map((r) => [r.id, r]));
	const memberIds = new Set(members.map((m) => m.id));
	const memberEmails = new Set(members.map((m) => m.email));
	const plan: MirrorPlan = { insert: [], update: [], release: [] };

	for (const member of members) {
		const row = rows.get(member.id);
		if (!row) {
			plan.insert.push(member);
			continue;
		}
		const fields = MIRROR_FIELDS.filter((f) => row[f] !== member[f]);
		if (fields.length > 0) {
			plan.update.push({ user: member, fields });
		}
	}
	for (const row of mirror) {
		if (!memberIds.has(row.id) && memberEmails.has(row.email)) {
			plan.release.push({ userId: row.id, email: row.email });
		}
	}
	return plan;
}

/** Every membership of the tenant joined with its global identity. */
export async function loadTenantMembers(
	cdb: ControlDb,
	tenantId?: string,
): Promise<
	Array<{ tenantId: string; userId: string; user: MirroredUser | null }>
> {
	const rows = await cdb
		.select({
			tenantId: tenantMemberships.tenantId,
			userId: tenantMemberships.userId,
			user: controlUsers,
		})
		.from(tenantMemberships)
		.leftJoin(controlUsers, eq(controlUsers.id, tenantMemberships.userId))
		.where(tenantId ? eq(tenantMemberships.tenantId, tenantId) : undefined);
	return rows.map((r) => ({
		tenantId: r.tenantId,
		userId: r.userId,
		user: r.user
			? {
					id: r.user.id,
					name: r.user.name,
					email: r.user.email,
					emailVerified: r.user.emailVerified,
					image: r.user.image,
					createdAt: r.user.createdAt,
					updatedAt: r.user.updatedAt,
				}
			: null,
	}));
}

export type ReconcileReport = {
	tenantId: string;
	/** Memberships with an identity, i.e. rows the mirror must have. */
	members: number;
	inserted: string[];
	updated: Array<{ userId: string; fields: MirrorField[] }>;
	released: Array<{ userId: string; email: string }>;
	/** Memberships whose user no longer exists in the control DB. */
	missingIdentity: string[];
	/** False for a dry run: the report says what would change. */
	applied: boolean;
};

/** True when the tenant's mirror already matches the control DB. */
export const inSync = (r: ReconcileReport) =>
	r.inserted.length === 0 && r.updated.length === 0 && r.released.length === 0;

/**
 * Brings one tenant's mirror in line with the control DB and reports what it
 * changed (or, with `dryRun`, what it would change).
 */
export async function reconcileUserMirror(
	tdb: TenantDb,
	cdb: ControlDb,
	tenantId: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
): Promise<ReconcileReport> {
	const memberships = await loadTenantMembers(cdb, tenantId);
	const members = memberships.flatMap((m) => (m.user ? [m.user] : []));
	const mirror = await tdb
		.select({
			id: tenantUsers.id,
			name: tenantUsers.name,
			email: tenantUsers.email,
			emailVerified: tenantUsers.emailVerified,
			image: tenantUsers.image,
		})
		.from(tenantUsers);

	const plan = planUserMirror(members, mirror);
	if (!dryRun) {
		// One upsert per user; each releases a conflicting e-mail in its own
		// transaction, so swaps resolve in any order. A failure midway leaves
		// a consistent partial state the next run continues from.
		for (const user of [...plan.insert, ...plan.update.map((u) => u.user)]) {
			await upsertUserMirror(tdb, user);
		}
	}

	return {
		tenantId,
		members: members.length,
		inserted: plan.insert.map((u) => u.id),
		updated: plan.update.map((u) => ({ userId: u.user.id, fields: u.fields })),
		released: plan.release,
		missingIdentity: memberships.filter((m) => !m.user).map((m) => m.userId),
		applied: !dryRun,
	};
}
