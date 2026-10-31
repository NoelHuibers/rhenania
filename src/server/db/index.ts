// index.ts — the implicit tenant `db` (being retired, see
// docs/architecture/layering.md).
//
// The exported `client` and `db` look like a normal libSQL/drizzle pair, but
// every SQL call (`execute`, `batch`, `transaction`, ...) is intercepted and
// dispatched to the libSQL client of the current request's tenant, resolved
// from the request host.
//
// There is no fallback: outside a request the proxy throws
// `NoDbContextError` instead of quietly using the env-configured (production)
// database. Scripts that run code built on this proxy wrap it in
// `runWithScriptDb()` from `./script`, which opens the env DB explicitly.
// Importing this module opens no connection.
//
// New code should not import this module: take a `TenantDb` from
// `getTenantDb(id)` / `getCurrentTenantDb()` in `./tenants` instead.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

/** Thrown when the proxy `db` is used without a request or an explicit DB. */
export class NoDbContextError extends Error {
	constructor(cause: unknown) {
		super(
			"The tenant db proxy was used outside a request. Scripts must pick their database explicitly (getScriptDb / runWithScriptDb in ~/server/db/script).",
			{ cause },
		);
		this.name = "NoDbContextError";
	}
}

// An explicit database for code run outside a request (scripts, tests).
const explicitClient = new AsyncLocalStorage<Client>();

/** Runs `fn` with every proxy query going to `target`. */
export function runWithDb<T>(target: Client, fn: () => Promise<T>): Promise<T> {
	return explicitClient.run(target, fn);
}

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
	const explicit = explicitClient.getStore();
	if (explicit) {
		return explicit;
	}
	try {
		// Lazy-import to avoid a top-level cycle through tenants.ts <-> this file.
		const { headers } = await import("next/headers");
		await headers();
	} catch (error) {
		// Next.js signals dynamic rendering by throwing from `headers()`; let
		// those through. Anything else means there is no request.
		const { unstable_rethrow } = await import("next/navigation");
		unstable_rethrow(error);
		throw new NoDbContextError(error);
	}
	// Same host-based resolution as everywhere else; never a client header.
	const { getTenantId } = await import("~/server/lib/tenant-context");
	const tenantId = await getTenantId();
	if (!tenantId) {
		// In a request context but the host maps to no tenant: fail loudly
		// rather than guess a database.
		throw new Error(
			"Request reached the DB layer without a resolvable tenant host.",
		);
	}

	// The raw client behind `getTenantDb`, so drizzle's queries (built off
	// the proxy below) execute on the right network connection.
	const { getTenantClient } = await import("./tenants");
	return getTenantClient(tenantId);
}

// The proxy target holds no connection. It must not be a plain object:
// drizzle() would mistake one for a config object.
class TenantDispatchedClient {}

// libSQL `Client` proxy: intercepts the network methods and routes them to
// the resolved tenant's client.
export const client = new Proxy(new TenantDispatchedClient(), {
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
}) as unknown as Client;

export const db = drizzle(client, { schema });
