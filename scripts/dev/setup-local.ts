// scripts/dev/setup-local.ts — (re)create the local databases in `.data/`.
//
//   pnpm db:local:reset
//
// Deletes and recreates `.data/{control,rhenania,hassia}.db`, applies all
// migrations, and seeds two tenants with demo users and drinks (see
// `seed-data.ts`). Only ever touches local files: the environment comes from
// `local-env.ts`, which blanks every credential from `.env`.

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { DATA_DIR, LOCAL_DB, localEnv, MAIL_OUTBOX, ROOT } from "./local-env";
import { DEV_PASSWORD, SEED_TENANTS, SEED_USERS } from "./seed-data";

Object.assign(process.env, localEnv());

const tenantFile: Record<string, string> = {
	rhenania: LOCAL_DB.rhenania,
	hassia: LOCAL_DB.hassia,
};

async function migrated(file: string, folder: string): Promise<Client> {
	const client = createClient({ url: `file:${file}` });
	await migrate(drizzle(client), { migrationsFolder: path.join(ROOT, folder) });
	return client;
}

async function main() {
	for (const file of Object.values(LOCAL_DB)) {
		for (const suffix of ["", "-wal", "-shm", "-journal"]) {
			rmSync(`${file}${suffix}`, { force: true });
		}
	}
	rmSync(MAIL_OUTBOX, { recursive: true, force: true });
	mkdirSync(DATA_DIR, { recursive: true });

	// Imported after the environment is pinned to local files.
	const bcrypt = (await import("bcryptjs")).default;
	const control = await import("~/server/db/control-schema");
	const tenant = await import("~/server/db/schema");
	const { seedTenantDefaults } = await import("~/server/lib/tenant-seed");

	const controlClient = await migrated(LOCAL_DB.control, "drizzle/control");
	const cdb = drizzle(controlClient, { schema: control });
	const tenantDbs = new Map<
		string,
		ReturnType<typeof drizzle<typeof tenant>>
	>();
	const clients: Client[] = [controlClient];

	for (const t of SEED_TENANTS) {
		const file = tenantFile[t.slug];
		if (!file) throw new Error(`No local DB file for ${t.slug}`);
		const client = await migrated(file, "drizzle");
		clients.push(client);
		const tdb = drizzle(client, { schema: tenant });
		tenantDbs.set(t.id, tdb);

		await cdb.insert(control.tenants).values({
			id: t.id,
			slug: t.slug,
			displayName: t.displayName,
			status: "active",
			dbUrl: `file:${file}`,
		});
		for (const [i, hostname] of t.hostnames.entries()) {
			await cdb.insert(control.tenantDomains).values({
				tenantId: t.id,
				hostname,
				isPrimary: i === 0,
				isCustom: false,
			});
		}
		await cdb.insert(control.tenantAuthConfig).values({
			tenantId: t.id,
			emailPasswordEnabled: true,
			microsoftEnabled: false,
		});
		for (const key of t.features) {
			await cdb
				.insert(control.tenantFeatures)
				.values({ tenantId: t.id, key, enabled: true });
		}

		await seedTenantDefaults(tdb);
		await tdb
			.update(tenant.kasseConfig)
			.set({ markupPercent: t.markupPercent });
		await tdb.update(tenant.semesterConfig).set({ name: "Lokales Semester" });
		for (const d of t.drinks) {
			await tdb.insert(tenant.drinks).values({
				id: d.id,
				name: d.name,
				price: d.price,
				isCurrentlyAvailable: d.available ?? true,
			});
		}
	}

	const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
	for (const u of SEED_USERS) {
		const user = {
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: true,
			image: null,
		};
		await cdb.insert(control.users).values(user);
		await cdb.insert(control.accounts).values({
			userId: u.id,
			accountId: u.id,
			providerId: "credential",
			password: passwordHash,
		});
		if (u.superAdmin) {
			await cdb
				.insert(control.superAdmins)
				.values({ userId: u.id, grantedBy: "seed", reason: "local dev" });
		}
		for (const m of u.memberships) {
			await cdb
				.insert(control.tenantMemberships)
				.values({ userId: u.id, tenantId: m.tenantId, status: "active" });
			const tdb = tenantDbs.get(m.tenantId);
			if (!tdb) throw new Error(`Unknown tenant ${m.tenantId}`);
			await tdb.insert(tenant.users).values(user);
			for (const roleName of m.roles) {
				const role = await tdb.query.roles.findFirst({
					where: (r, { eq }) => eq(r.name, roleName),
				});
				if (!role) throw new Error(`Role ${roleName} missing in ${m.tenantId}`);
				await tdb
					.insert(tenant.userRoles)
					.values({ userId: u.id, roleId: role.id });
			}
		}
	}

	for (const client of clients) client.close();

	console.log(
		`Local databases ready in ${path.relative(ROOT, DATA_DIR) || "."}/`,
	);
	console.log("  http://localhost:3000        → Rhenania");
	console.log(
		"  http://hassia.localhost:3000 → Hassia (markup + billing flags on)",
	);
	console.log(`  Password for every user: ${DEV_PASSWORD}`);
	for (const u of SEED_USERS) {
		const roles = u.memberships
			.map(
				(m) =>
					`${m.tenantId.replace("tenant-", "")}: ${m.roles.join(", ") || "Mitglied"}`,
			)
			.join(" | ");
		console.log(
			`  ${u.email.padEnd(22)} ${roles}${u.superAdmin ? " | superadmin" : ""}`,
		);
	}
	console.log(`  Mails are written to ${path.relative(ROOT, MAIL_OUTBOX)}/`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
