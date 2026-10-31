// tenant-scope.ts — the explicit way into a tenant's data (#33).
//
// A TenantScope names the tenant, its database and the clock. Services and
// repos take one instead of reaching for the implicit proxy `db` or for
// `new Date()`, so a test can hand them a local libSQL file and a fixed
// `now`. `defineAction` builds the scope once per call for the tenant its
// guard checked the caller's membership in; scripts and tests build theirs
// with `tenantScope()`. Work on a
// second tenant (cross-Corps games) builds a second scope explicitly.
//
// See docs/architecture/layering.md.

import "server-only";

import { getTenantDb, type TenantDb } from "~/server/db/tenants";
import { requireTenantId } from "~/server/lib/tenant-context";

export type TenantScope = {
	readonly tenantId: string;
	/** The tenant's own database, never the proxy. */
	readonly db: TenantDb;
	/** The clock every time-dependent rule reads. */
	readonly now: () => Date;
};

const systemClock = () => new Date();

/** A scope over a database the caller already holds (tests, scripts). */
export function tenantScope(
	tenantId: string,
	db: TenantDb,
	now: () => Date = systemClock,
): TenantScope {
	return { tenantId, db, now };
}

/** The scope of `tenantId`, on its own database and the system clock. */
export async function scopeOf(tenantId: string): Promise<TenantScope> {
	return tenantScope(tenantId, await getTenantDb(tenantId));
}

/**
 * The scope of the current request's tenant, resolved from the host. Code
 * behind a guard takes the guard's tenant instead (`requireCaller`).
 */
export async function currentTenantScope(): Promise<TenantScope> {
	return scopeOf(await requireTenantId());
}
