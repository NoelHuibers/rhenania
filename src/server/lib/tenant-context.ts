// tenant-context.ts — host -> tenant resolution + per-request access.
//
// Middleware ([proxy.ts]) calls `resolveTenantByHost(host)` to look up which
// tenant a request belongs to, then forwards the result as the `x-tenant-id`
// header. Server components and actions read it back via `getTenantId()` /
// `requireTenantId()`.
//
// Host lookups and tenant config are cached by the tenant-config service
// (`tenant-config.ts`), which also defines how fast changes propagate.

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import type { FeatureFlags } from "~/lib/features";
import { controlDb } from "~/server/db/control";
import {
	type TenantBranding,
	tenantMemberships,
} from "~/server/db/control-schema";
import { protocolForHost } from "~/server/lib/local-host";
import {
	getTenantConfig,
	invalidateHostLookups,
	invalidateTenantConfig,
	lookupTenantIdByHost,
} from "~/server/lib/tenant-config";

export const TENANT_HEADER = "x-tenant-id";

function normalizeHost(host: string): string {
	const noPort = host.split(":")[0] ?? host;
	return noPort.trim().toLowerCase();
}

export async function resolveTenantByHost(
	rawHost: string | null | undefined,
): Promise<string | null> {
	if (!rawHost) {
		return null;
	}
	const host = normalizeHost(rawHost);
	if (!host) {
		return null;
	}
	return lookupTenantIdByHost(host);
}

/** Forgets this instance's host lookups (hits and misses). */
export function clearTenantHostCache() {
	invalidateHostLookups();
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
	/** Per-tenant feature flags; every flag is off unless switched on. */
	features: FeatureFlags;
};

/** Drops the cached tenant so a change is visible on the next request. */
export function clearTenantCache(tenantId?: string) {
	invalidateTenantConfig(tenantId);
}

export async function getTenantById(id: string): Promise<TenantContext | null> {
	const config = await getTenantConfig(id);
	if (!config) {
		return null;
	}
	return {
		id: config.id,
		slug: config.slug,
		displayName: config.displayName,
		branding: config.branding,
		features: config.features,
	};
}

export async function getCurrentTenant(): Promise<TenantContext | null> {
	const id = await getTenantId();
	if (!id) {
		return null;
	}
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
		const host = h.get("x-forwarded-host") ?? h.get("host");
		if (host) {
			const proto = h.get("x-forwarded-proto") ?? protocolForHost(host);
			return `${proto}://${host}`;
		}
	} catch {
		// fall through
	}
	const fallback = process.env.BETTER_AUTH_URL ?? "";
	return fallback;
}

// Identity (sessions, users) is global across tenants, so "logged in" alone
// must never grant access to a tenant's data — membership in the CURRENT
// tenant is the fence. Cached per (tenant, user) with the same short TTL as
// host resolution; revocations apply within a minute.
const membershipCache = new Map<
	string,
	{ active: boolean; expiresAt: number }
>();
const MEMBERSHIP_CACHE_TTL_MS = 60_000;

export async function hasActiveMembership(
	userId: string,
	tenantId: string,
): Promise<boolean> {
	const key = `${tenantId}:${userId}`;
	const cached = membershipCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.active;
	}

	const [row] = await controlDb
		.select({ status: tenantMemberships.status })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.tenantId, tenantId),
			),
		)
		.limit(1);

	const active = row?.status === "active";
	membershipCache.set(key, {
		active,
		expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
	});
	return active;
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
