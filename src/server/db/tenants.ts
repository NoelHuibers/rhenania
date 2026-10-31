// tenants.ts — per-tenant DB clients.
//
// `getTenantDb(tenantId)` returns a drizzle instance bound to that tenant's
// Turso DB. `connect()` below is the only place that builds tenant clients.
// Clients are cached per process, but every call checks the tenant's
// current config (status and credentials, served by the tenant-config
// service): a suspended tenant gets no client, and a rotated URL or token
// replaces the cached client. Replaced clients are closed after a grace
// period so queries already running on them can finish.

import type { Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { getTenantConfig } from "~/server/lib/tenant-config";
import { createClient } from "./libsql";
import * as schema from "./schema";

/** A tenant's drizzle instance; `$client` is its libSQL client (batches). */
export type TenantDb = LibSQLDatabase<typeof schema> & { $client: Client };

type TenantConnection = {
	client: Client;
	db: TenantDb;
	url: string;
	authToken: string | null;
};

/** How long a replaced or suspended tenant's client stays open. */
export const RETIRED_CLIENT_GRACE_MS = 30_000;

const globalForTenantDb = globalThis as unknown as {
	tenantConnections: Map<string, TenantConnection> | undefined;
};

const connections: Map<string, TenantConnection> =
	globalForTenantDb.tenantConnections ?? new Map();
globalForTenantDb.tenantConnections = connections;

export class TenantNotFoundError extends Error {
	constructor(tenantId: string) {
		super(`Tenant not found: ${tenantId}`);
		this.name = "TenantNotFoundError";
	}
}

function retire(tenantId: string) {
	const connection = connections.get(tenantId);
	if (!connection) {
		return;
	}
	connections.delete(tenantId);
	const timer = setTimeout(
		() => connection.client.close(),
		RETIRED_CLIENT_GRACE_MS,
	);
	timer.unref?.();
}

async function connect(tenantId: string): Promise<TenantConnection> {
	const config = await getTenantConfig(tenantId);
	if (!config) {
		retire(tenantId);
		throw new TenantNotFoundError(tenantId);
	}
	if (config.status === "suspended") {
		retire(tenantId);
		throw new Error(`Tenant suspended: ${tenantId}`);
	}

	// No await from here on: concurrent callers see each other's client
	// instead of each creating (and leaking) one.
	const current = connections.get(tenantId);
	if (
		current &&
		current.url === config.db.url &&
		current.authToken === config.db.authToken
	) {
		return current;
	}
	retire(tenantId);

	const client = createClient({
		url: config.db.url,
		authToken: config.db.authToken ?? undefined,
	});
	const connection: TenantConnection = {
		client,
		db: drizzle(client, { schema }),
		url: config.db.url,
		authToken: config.db.authToken,
	};
	connections.set(tenantId, connection);
	return connection;
}

export async function getTenantDb(tenantId: string): Promise<TenantDb> {
	return (await connect(tenantId)).db;
}

/**
 * The raw libSQL `Client` behind `getTenantDb(tenantId)`. Used by the
 * `client` proxy in `./index.ts` to dispatch network calls to the right
 * tenant.
 */
export async function getTenantClient(tenantId: string): Promise<Client> {
	return (await connect(tenantId)).client;
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

/** Closes and forgets cached clients right away (one tenant or all). */
export function clearTenantDbCache(tenantId?: string) {
	const ids = tenantId ? [tenantId] : [...connections.keys()];
	for (const id of ids) {
		connections.get(id)?.client.close();
		connections.delete(id);
	}
}
