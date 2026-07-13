// scripts/check-memberships.ts — read-only: list control-DB users and their
// tenant memberships, flagging users with no membership anywhere (they would
// be blocked by the middleware membership gate).

import "dotenv/config";

import { controlDb } from "~/server/db/control";
import { tenantMemberships, tenants, users } from "~/server/db/control-schema";

async function main() {
	const allUsers = await controlDb
		.select({ id: users.id, email: users.email })
		.from(users);
	const allMemberships = await controlDb
		.select({
			userId: tenantMemberships.userId,
			tenantId: tenantMemberships.tenantId,
			status: tenantMemberships.status,
		})
		.from(tenantMemberships);
	const allTenants = await controlDb
		.select({ id: tenants.id, slug: tenants.slug })
		.from(tenants);
	const slugById = new Map(allTenants.map((t) => [t.id, t.slug]));

	const byUser = new Map<string, string[]>();
	for (const m of allMemberships) {
		const list = byUser.get(m.userId) ?? [];
		list.push(`${slugById.get(m.tenantId) ?? m.tenantId}:${m.status}`);
		byUser.set(m.userId, list);
	}

	console.log(`${allUsers.length} users, ${allMemberships.length} memberships`);
	let orphans = 0;
	for (const u of allUsers) {
		const ms = byUser.get(u.id);
		if (!ms || ms.length === 0) {
			orphans++;
			console.log(`NO MEMBERSHIP: ${u.email}`);
		}
	}
	const perTenant = new Map<string, number>();
	for (const m of allMemberships) {
		const slug = slugById.get(m.tenantId) ?? m.tenantId;
		perTenant.set(slug, (perTenant.get(slug) ?? 0) + 1);
	}
	for (const [slug, n] of perTenant) console.log(`${slug}: ${n} memberships`);
	const perStatus = new Map<string, number>();
	for (const m of allMemberships)
		perStatus.set(m.status, (perStatus.get(m.status) ?? 0) + 1);
	for (const [status, n] of perStatus) console.log(`status ${status}: ${n}`);
	console.log(
		orphans === 0
			? "✅ every user has at least one membership"
			: `⚠ ${orphans} user(s) without any membership`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
