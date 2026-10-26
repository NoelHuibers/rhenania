// scripts/lib/tenants.ts — shared tenant lookup for ops/diag scripts.

import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";

export type TenantRow = typeof tenants.$inferSelect;

export async function findTenantBySlug(slug: string): Promise<TenantRow> {
	const [tenant] = await controlDb
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (!tenant) {
		throw new Error(`No tenant '${slug}'`);
	}
	return tenant;
}

export function openTenantClient(tenant: TenantRow): Client {
	return createClient({
		url: tenant.dbUrl,
		authToken: tenant.dbAuthToken ?? undefined,
	});
}

/** Looks up a tenant by slug and opens a raw libSQL client to its DB. */
export async function openTenant(
	slug: string,
): Promise<{ tenant: TenantRow; client: Client }> {
	const tenant = await findTenantBySlug(slug);
	return { tenant, client: openTenantClient(tenant) };
}
