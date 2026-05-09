// scripts/grant-tenant-admin.ts
//
// Bootstrap the first Admin in a tenant. Takes a control-DB user (by email)
// and a tenant (by slug), then atomically:
//   1. Inserts a `tenant_membership` row in the control DB.
//   2. Mirrors the user into the tenant DB's `user` table.
//   3. Looks up the tenant's "Admin" role and assigns it via `user_role`.
//
// All steps are idempotent — re-running on an already-bootstrapped pair
// reports each step as a no-op and exits cleanly.
//
// The user must already exist in the control DB (i.e. they've signed in to
// at least one tenant before, or were invited there). Use `pnpm grant-superadmin`
// for platform-level grants; this script is for tenant-scoped Admin.
//
//   pnpm tsx scripts/grant-tenant-admin.ts <email> <tenant-slug>

import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import {
	tenantMemberships,
	tenants,
	users as controlUsers,
} from "~/server/db/control-schema";
import { roles, userRoles } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { mirrorUserToTenant } from "~/server/lib/user-mirror";

function parseArgs() {
	const args = process.argv.slice(2);
	const [email, slug] = args;
	if (!email || !slug) {
		console.error(
			"Usage: pnpm tsx scripts/grant-tenant-admin.ts <email> <tenant-slug>",
		);
		process.exit(1);
	}
	return { email: email.toLowerCase(), slug };
}

async function main() {
	const { email, slug } = parseArgs();

	// 1. Resolve user.
	const [user] = await controlDb
		.select()
		.from(controlUsers)
		.where(eq(controlUsers.email, email))
		.limit(1);
	if (!user) {
		console.error(
			`No control-DB user with email '${email}'. Sign in to at least one tenant first.`,
		);
		process.exit(1);
	}
	console.log(`✓ user ${email} → ${user.id}`);

	// 2. Resolve tenant.
	const [tenant] = await controlDb
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (!tenant) {
		console.error(`No tenant with slug '${slug}'.`);
		process.exit(1);
	}
	if (tenant.status === "suspended") {
		console.error(`Tenant '${slug}' is suspended.`);
		process.exit(1);
	}
	console.log(`✓ tenant ${slug} → ${tenant.id}`);

	// 3. Membership in control DB.
	const [existingMembership] = await controlDb
		.select({ status: tenantMemberships.status })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, user.id),
				eq(tenantMemberships.tenantId, tenant.id),
			),
		)
		.limit(1);
	if (existingMembership) {
		console.log(`  membership: already exists (status=${existingMembership.status})`);
	} else {
		await controlDb.insert(tenantMemberships).values({
			userId: user.id,
			tenantId: tenant.id,
			status: "active",
		});
		console.log(`  membership: inserted`);
	}

	// 4. Mirror user into tenant DB.
	await mirrorUserToTenant(
		{
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			image: user.image,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		},
		tenant.id,
	);
	console.log(`  user mirror: upserted`);

	// 5. Find or assign Admin role in the tenant DB.
	const tdb = await getTenantDb(tenant.id);
	const [adminRole] = await tdb
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.name, "Admin"))
		.limit(1);
	if (!adminRole) {
		console.error(
			`  ⚠ tenant '${slug}' has no 'Admin' role — provisioning seed didn't run?`,
		);
		process.exit(1);
	}

	const [existingAssignment] = await tdb
		.select()
		.from(userRoles)
		.where(
			and(eq(userRoles.userId, user.id), eq(userRoles.roleId, adminRole.id)),
		)
		.limit(1);
	if (existingAssignment) {
		console.log(`  Admin role: already assigned`);
	} else {
		await tdb.insert(userRoles).values({
			userId: user.id,
			roleId: adminRole.id,
			assignedAt: new Date(),
		});
		console.log(`  Admin role: assigned`);
	}

	console.log(`\n✅ ${email} is now Admin in tenant '${slug}'.`);
	console.log(
		`   Sign in at the tenant's domain to use /admin/users for invites.`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
