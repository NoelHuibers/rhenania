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
import {
	type TenantBranding,
	tenantDomains,
	tenants,
} from "~/server/db/control-schema";

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

export type TenantContext = {
	id: string;
	slug: string;
	displayName: string;
	branding: TenantBranding | null;
};

const tenantByIdCache = new Map<
	string,
	{ value: TenantContext; expiresAt: number }
>();
const TENANT_CACHE_TTL_MS = 60_000;

export async function getTenantById(id: string): Promise<TenantContext | null> {
	const cached = tenantByIdCache.get(id);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const [row] = await controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			displayName: tenants.displayName,
			branding: tenants.branding,
		})
		.from(tenants)
		.where(eq(tenants.id, id))
		.limit(1);

	if (!row) return null;
	const value: TenantContext = {
		id: row.id,
		slug: row.slug,
		displayName: row.displayName,
		branding: row.branding ?? null,
	};
	tenantByIdCache.set(id, {
		value,
		expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
	});
	return value;
}

export async function getCurrentTenant(): Promise<TenantContext | null> {
	const id = await getTenantId();
	if (!id) return null;
	return getTenantById(id);
}

/**
 * Returns the canonical origin (e.g. `https://hassia.vercel.app`) that the
 * CURRENT request is being served from. Use this when building outbound
 * URLs that the recipient will click — invitation/verification emails,
 * password resets, OAuth redirects — so the link lands on the same tenant
 * the request originated from. Falls back to BETTER_AUTH_URL if no request
 * context (scripts, cron, etc.).
 */
export async function getCurrentRequestOrigin(): Promise<string> {
	try {
		const h = await headers();
		const host =
			h.get("x-forwarded-host") ?? h.get("host");
		if (host) {
			const proto =
				h.get("x-forwarded-proto") ??
				(host.startsWith("localhost") || host.startsWith("127.")
					? "http"
					: "https");
			return `${proto}://${host}`;
		}
	} catch {
		// fall through
	}
	const fallback = process.env.BETTER_AUTH_URL ?? "";
	return fallback;
}

export async function requireCurrentTenant(): Promise<TenantContext> {
	const tenant = await getCurrentTenant();
	if (!tenant) {
		throw new Error(
			"No tenant in request context. Did the request bypass middleware?",
		);
	}
	return tenant;
}
