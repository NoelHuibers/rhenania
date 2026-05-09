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

// `requireTenantId` is imported lazily in `getCurrentTenantDb` to avoid
// circular module loading — tenant-context.ts imports from this module
// transitively via the type definition.
async function _requireTenantId(): Promise<string> {
	const { requireTenantId } = await import("~/server/lib/tenant-context");
	return requireTenantId();
}

/**
 * Convenience wrapper for request-scoped code: resolves the current request's
 * tenant from the middleware-set `x-tenant-id` header and returns that
 * tenant's drizzle instance. Throws if called outside a request context (use
 * `getTenantDb(id)` directly in scripts).
 */
export async function getCurrentTenantDb(): Promise<TenantDb> {
	const tenantId = await _requireTenantId();
	return getTenantDb(tenantId);
}

/**
 * Returns the raw libSQL `Client` for a tenant. Used by the `client` proxy
 * exported from `./index.ts` to dispatch network calls to the right tenant.
 */
export async function resolveTenantClient(tenantId: string): Promise<Client> {
	const cached = tenantDbCache.get(tenantId);
	if (cached) return cached.client;

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

	const client = createClient({
		url: tenant.dbUrl,
		authToken: tenant.dbAuthToken ?? undefined,
	});
	const db = drizzle(client, { schema });
	tenantDbCache.set(tenantId, { client, db, dbUrl: tenant.dbUrl });
	return client;
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
