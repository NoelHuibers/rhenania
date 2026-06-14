// index.ts — singleton tenant DB client + drizzle instance.
//
// The exported `client` and `db` look like a normal libSQL/drizzle pair, but
// they're wrapped in a **per-request tenant proxy**: every actual SQL call
// (`execute`, `batch`, `transaction`) is intercepted, the current request's
// tenant is resolved from the `x-tenant-id` header set by middleware, and the
// query is dispatched to that tenant's libSQL client.
//
// Outside a request context (one-shot scripts, CLI tools), the proxy falls
// back to the env-configured Rhenania connection, preserving existing script
// behaviour without code changes.
//
// Net effect: every existing `import { db } from "~/server/db"` call site
// becomes tenant-aware automatically. New code can also use
// `getCurrentTenantDb()` from `./tenants` for explicitness, which costs the
// same.

import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "~/env";
import { createClient } from "./libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	fallbackClient: Client | undefined;
};

// Direct connection to the configured Rhenania DB. Used as the fallback when
// no tenant is in scope (scripts, build-time prerendering, etc.).
export const fallbackClient =
	globalForDb.fallbackClient ??
	createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
if (env.NODE_ENV !== "production") globalForDb.fallbackClient = fallbackClient;

// Methods on the libSQL `Client` that touch the network. The proxy intercepts
// these and dispatches to the right tenant's client per call.
const TENANT_DISPATCHED_METHODS = new Set([
	"execute",
	"batch",
	"transaction",
	"executeMultiple",
	"sync",
	"migrate",
]);

async function resolveCurrentClient(): Promise<Client> {
	// Lazy-import to avoid a top-level cycle through tenants.ts <-> this file.
	let tenantId: string | null = null;
	try {
		const { headers } = await import("next/headers");
		const h = await headers();
		tenantId = h.get("x-tenant-id");
	} catch {
		// Not in a request context (script / build-time) — fall through.
		return fallbackClient;
	}
	if (!tenantId) return fallbackClient;

	const { getTenantDb: _getTenantDb } = await import("./tenants");
	// `getTenantDb` returns the drizzle instance, not the raw client. We want
	// the raw client so drizzle's queries (built off the proxy below) execute
	// on the right network connection.
	void _getTenantDb;
	const { resolveTenantClient } = await import("./tenants");
	return resolveTenantClient(tenantId);
}

// libSQL `Client` proxy: passes through property access; intercepts the
// network methods and routes them to the resolved tenant's client.
export const client: Client = new Proxy(fallbackClient, {
	get(target, prop, receiver) {
		if (typeof prop === "string" && TENANT_DISPATCHED_METHODS.has(prop)) {
			return async (...args: unknown[]) => {
				const real = await resolveCurrentClient();
				const fn = (real as unknown as Record<string, unknown>)[prop];
				if (typeof fn !== "function") {
					throw new Error(
						`libSQL client has no method '${prop}' (tenant dispatch)`,
					);
				}
				return (fn as (...a: unknown[]) => unknown).apply(real, args);
			};
		}
		return Reflect.get(target, prop, receiver);
	},
});

export const db = drizzle(client, { schema });
