// tenants.ts — per-tenant DB client resolver.
//
// `getTenantDb(tenantId)` returns a drizzle instance bound to that tenant's
// Turso DB (looked up in the control plane). Clients are cached per process.
//
// Step-1 caveat: domain code still imports the singleton `db` from ./index.ts
// (which is the Rhenania DB). New code paths should call `getTenantDb()`
// instead so the cutover is incremental.

import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { controlDb } from "./control";
import { tenants } from "./control-schema";
import * as schema from "./schema";

type TenantDb = LibSQLDatabase<typeof schema>;

type TenantDbCacheEntry = {
	client: Client;
	db: TenantDb;
	dbUrl: string;
};

const globalForTenantDb = globalThis as unknown as {
	tenantDbCache: Map<string, TenantDbCacheEntry> | undefined;
};

const tenantDbCache: Map<string, TenantDbCacheEntry> =
	globalForTenantDb.tenantDbCache ?? new Map();
globalForTenantDb.tenantDbCache = tenantDbCache;

export class TenantNotFoundError extends Error {
	constructor(tenantId: string) {
		super(`Tenant not found: ${tenantId}`);
		this.name = "TenantNotFoundError";
	}
}

export async function getTenantDb(tenantId: string): Promise<TenantDb> {
	const cached = tenantDbCache.get(tenantId);
	if (cached) return cached.db;

	const [tenant] = await controlDb
		.select({
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
			status: tenants.status,
		})
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);

	if (!tenant) throw new TenantNotFoundError(tenantId);
	if (tenant.status === "suspended") {
		throw new Error(`Tenant suspended: ${tenantId}`);
	}

	const existing = tenantDbCache.get(tenantId);
	if (existing && existing.dbUrl === tenant.dbUrl) return existing.db;

	const client = createClient({
		url: tenant.dbUrl,
		authToken: tenant.dbAuthToken ?? undefined,
	});
	const db = drizzle(client, { schema });

	tenantDbCache.set(tenantId, { client, db, dbUrl: tenant.dbUrl });
	return db;
}

export function clearTenantDbCache(tenantId?: string) {
	if (tenantId) {
		const entry = tenantDbCache.get(tenantId);
		entry?.client.close();
		tenantDbCache.delete(tenantId);
		return;
	}
	for (const entry of tenantDbCache.values()) entry.client.close();
	tenantDbCache.clear();
}
