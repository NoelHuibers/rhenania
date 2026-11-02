// service.ts — the Corps' members and their roles (/admin) (#33).
//
// Role assignments live in the Corps' DB; the identity (name, e-mail
// address) and the memberships in the control DB, mirrored into every
// Corps the person belongs to. An Admin may only act on members of their
// own Corps: identity is global, so without that check an Admin of one
// Corps could edit or delete accounts of another. Every function takes
// the TenantScope it works in; failures the user should read are
// DomainErrors.

import "server-only";

import { ActionError } from "~/server/lib/define-action";
import { NotFoundError, ValidationError } from "~/server/lib/domain-error";
import { forgetMembership } from "~/server/lib/tenant-context";
import type { TenantScope } from "~/server/lib/tenant-scope";
import { seedDefaultRoles } from "~/server/lib/tenant-seed";
import { mirrorUserToAllMemberTenants } from "~/server/lib/user-mirror";
import * as control from "./control-repo";
import * as repo from "./repo";

export type UserWithRoles = {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: boolean | null;
	image: string | null;
	roles: Array<{
		id: string;
		name: string;
		description: string | null;
	}>;
};

export type Role = {
	id: string;
	name: string;
	description: string | null;
	userCount: number;
};

export interface UserRole {
	id: string;
	name: string;
	description: string | null;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Every member with their roles. */
export async function usersWithRoles({
	db,
}: TenantScope): Promise<UserWithRoles[]> {
	const rows = await repo.usersWithRoleRows(db);
	// Group users and their roles
	const userMap = new Map<string, UserWithRoles>();
	for (const row of rows) {
		let user = userMap.get(row.id);
		if (!user) {
			user = {
				id: row.id,
				name: row.name,
				email: row.email,
				emailVerified: row.emailVerified,
				image: row.image,
				roles: [],
			};
			userMap.set(row.id, user);
		}
		if (row.roleId && row.roleName) {
			user.roles.push({
				id: row.roleId,
				name: row.roleName,
				description: row.roleDescription,
			});
		}
	}
	return Array.from(userMap.values());
}

/** Every role with its member count, Admin first, then by name. */
export async function rolesWithUserCount({ db }: TenantScope): Promise<Role[]> {
	const rows = await repo.rolesWithUserCount(db);
	return rows.sort((a, b) => {
		if (a.name === "Admin") {
			return -1;
		}
		if (b.name === "Admin") {
			return 1;
		}
		return a.name.localeCompare(b.name);
	});
}

/** The member's roles. */
export function rolesOf({ db }: TenantScope, userId: string) {
	return repo.rolesOf(db, userId);
}

// ─── Roles ───────────────────────────────────────────────────────────────────

/** Adds the default roles; existing ones keep their description. */
export async function initializeRoles({ db }: TenantScope) {
	// One statement for the shared default list (also used when a tenant
	// is provisioned).
	await seedDefaultRoles(db);
}

/** Assigns the role if the member doesn't hold it, removes it otherwise. */
export async function toggleRole(
	{ db }: TenantScope,
	userId: string,
	roleId: string,
) {
	if (await repo.hasRole(db, userId, roleId)) {
		await repo.unassignRole(db, userId, roleId);
	} else {
		// A concurrent toggle may have assigned it meanwhile; the insert
		// skips an existing assignment (#250).
		await repo.assignRole(db, roleId, [userId]);
	}
}

/**
 * Makes `userIds` the role's holders: adds the members not yet assigned,
 * removes the ones no longer selected.
 */
export async function setRoleHolders(
	{ db }: TenantScope,
	roleId: string,
	userIds: string[],
) {
	const currentIds = new Set(await repo.holdersOf(db, roleId));
	const nextIds = new Set(userIds);

	const toAdd = userIds.filter((id) => !currentIds.has(id));
	const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

	if (toAdd.length > 0) {
		await repo.assignRole(db, roleId, toAdd);
	}
	for (const userId of toRemove) {
		await repo.unassignRole(db, userId, roleId);
	}
}

// ─── Members ─────────────────────────────────────────────────────────────────

/** Refuses a person who is no member of the scope's Corps. */
async function assertMemberOfTenant(userId: string, tenantId: string) {
	if (!(await control.isMemberOf(userId, tenantId))) {
		throw new NotFoundError(
			"Diese Person ist kein Mitglied dieses Corps.",
			"NOT_A_MEMBER",
		);
	}
}

/**
 * Renames a member (the e-mail address is theirs to change): writes the
 * control-DB source of truth, then mirrors it to every Corps the person
 * belongs to.
 */
export async function updateUser(
	tenant: TenantScope,
	userId: string,
	data: { name?: string; email?: string },
) {
	await assertMemberOfTenant(userId, tenant.tenantId);

	const email = await control.identityEmail(userId);
	if (email === null) {
		throw new NotFoundError("Benutzer nicht gefunden");
	}
	// The email is the login identity across every Corps; a tenant admin
	// must not be able to redirect it (password reset would follow).
	if (
		data.email !== undefined &&
		data.email.trim().toLowerCase() !== email.toLowerCase()
	) {
		throw new ActionError(
			"Die E-Mail-Adresse kann nur von der Person selbst geändert werden.",
			"FORBIDDEN",
		);
	}
	const name = data.name?.trim();
	if (name === undefined) {
		return;
	}
	if (name.length === 0 || name.length > 255) {
		throw new ValidationError("Ungültiger Name");
	}

	await control.renameIdentity(userId, name, tenant.now());

	const refreshed = await control.identity(userId);
	if (refreshed) {
		await mirrorUserToAllMemberTenants({
			id: refreshed.id,
			name: refreshed.name,
			email: refreshed.email,
			emailVerified: refreshed.emailVerified,
			image: refreshed.image,
			createdAt: refreshed.createdAt,
			updatedAt: refreshed.updatedAt,
		});
	}
}

/**
 * Removes a member from the scope's Corps: their data there, the mirror
 * row and the membership. The global identity (control DB user, accounts,
 * sessions, cross-Corps stats) is only deleted with the last membership;
 * one Corps' Admin must not destroy it while other memberships exist.
 */
export async function deleteUser(tenant: TenantScope, userId: string) {
	const { db, tenantId } = tenant;
	await assertMemberOfTenant(userId, tenantId);
	await repo.deleteMemberData(db, userId);

	// Control DB: remove the membership for THIS tenant only.
	await control.deleteMembership(userId, tenantId);
	forgetMembership(userId, tenantId);

	// Last membership gone → delete the global identity as before.
	if (!(await control.hasAnyMembership(userId))) {
		await control.deleteIdentity(userId);
	}
}
