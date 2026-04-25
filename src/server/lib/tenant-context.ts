// tenant-context.ts — host -> tenant resolution + per-request access.
//
// Middleware ([proxy.ts]) calls `resolveTenantByHost(host)` to look up which
// tenant a request belongs to, then forwards the result as the `x-tenant-id`
// header. Server components and actions read it back via `getTenantId()` /
// `requireTenantId()`.
//
// Resolutions are cached in-process for a short TTL so steady-state traffic
// hits the control DB at most once per host per minute.

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { controlDb } from "~/server/db/control";
import { tenantDomains, tenants } from "~/server/db/control-schema";

export const TENANT_HEADER = "x-tenant-id";

const HOST_CACHE_TTL_MS = 60_000;

type CacheEntry = { tenantId: string | null; expiresAt: number };
const hostCache = new Map<string, CacheEntry>();

function normalizeHost(host: string): string {
	const noPort = host.split(":")[0] ?? host;
	return noPort.trim().toLowerCase();
}

export async function resolveTenantByHost(
	rawHost: string | null | undefined,
): Promise<string | null> {
	if (!rawHost) return null;
	const host = normalizeHost(rawHost);
	if (!host) return null;

	const cached = hostCache.get(host);
	if (cached && cached.expiresAt > Date.now()) return cached.tenantId;

	const [row] = await controlDb
		.select({ tenantId: tenantDomains.tenantId, status: tenants.status })
		.from(tenantDomains)
		.innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
		.where(eq(tenantDomains.hostname, host))
		.limit(1);

	const tenantId = row && row.status !== "suspended" ? row.tenantId : null;
	hostCache.set(host, { tenantId, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
	return tenantId;
}

export function clearTenantHostCache() {
	hostCache.clear();
}

export async function getTenantId(): Promise<string | null> {
	const h = await headers();
	return h.get(TENANT_HEADER);
}

export async function requireTenantId(): Promise<string> {
	const tenantId = await getTenantId();
	if (!tenantId) {
		throw new Error(
			"No tenant in request context. Did the request bypass middleware?",
		);
	}
	return tenantId;
}
