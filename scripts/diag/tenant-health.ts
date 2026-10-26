// scripts/diag/tenant-health.ts — read-only health check of a tenant DB.
// Usage: pnpm diag:tenant-health [slug]

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import {
	tenantAuthConfig,
	tenantDomains,
	tenantMemberships,
} from "~/server/db/control-schema";
import { findTenantBySlug, openTenantClient } from "../lib/tenants";

const slug = process.argv[2] ?? "hassia";

async function main() {
	const tenant = await findTenantBySlug(slug);
	console.log(
		`tenant: ${tenant.slug} (${tenant.displayName}) status=${tenant.status}`,
	);
	console.log(`branding: ${JSON.stringify(tenant.branding)}`);

	const domains = await controlDb
		.select()
		.from(tenantDomains)
		.where(eq(tenantDomains.tenantId, tenant.id));
	console.log(
		`domains: ${domains.map((d) => `${d.hostname}${d.isPrimary ? "*" : ""}`).join(", ")}`,
	);

	const [auth] = await controlDb
		.select()
		.from(tenantAuthConfig)
		.where(eq(tenantAuthConfig.tenantId, tenant.id))
		.limit(1);
	console.log(
		auth
			? `auth: emailPassword=${auth.emailPasswordEnabled} microsoft=${auth.microsoftEnabled} azureConfigured=${Boolean(auth.azureClientId)}`
			: "auth: NO tenantAuthConfig row!",
	);

	const memberships = await controlDb
		.select()
		.from(tenantMemberships)
		.where(eq(tenantMemberships.tenantId, tenant.id));
	console.log(
		`memberships: ${memberships.length} (${memberships.map((m) => m.status).join(",")})`,
	);

	const client = openTenantClient(tenant);

	const tables = [
		"role",
		"user_role",
		"user",
		"drink",
		"kasse_type",
		"event_type",
		"venue",
		"homepage_section",
		"homepage_images",
		"event",
		"semester_config",
		"member",
		"order",
		"bill",
		"inventory_item",
		"fuchsen_item",
		"etatplan",
	];
	for (const t of tables) {
		try {
			const rs = await client.execute(
				`SELECT count(*) AS c FROM "${t.replace(/"/g, "")}"`,
			);
			console.log(`  ${t}: ${rs.rows[0]?.c}`);
		} catch (err) {
			console.log(
				`  ${t}: ERROR ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
			);
		}
	}

	// role names — pages gate on specific role names existing
	try {
		const rs = await client.execute(`SELECT name FROM "role" ORDER BY name`);
		console.log(`roles: ${rs.rows.map((r) => r.name).join(", ")}`);
	} catch {
		/* covered above */
	}

	client.close();
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
