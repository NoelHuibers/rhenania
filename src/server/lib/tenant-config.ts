// tenant-config.ts — the one per-instance cache of tenant configuration.
//
// It answers the questions every request asks the control DB:
//   - which tenant does this host belong to (hits and misses)?
//   - what is that tenant's name, status, branding, flags, DB credentials,
//     Graph mail config, domains and Microsoft login?
// `tenant-context.ts` (host resolution, TenantContext), `db/tenants.ts`
// (tenant DB clients), `mailer.ts` and `auth/index.ts` (one Better Auth
// instance per tenant) all read through here instead of keeping caches of
// their own.
//
// Consistency
// -----------
// - Writes made on this instance call `invalidateTenantConfig()`, so they
//   are visible on the very next lookup here.
// - Every write that changes cached config also bumps
//   `control_tenant.configVersion` in the same batch
//   (`commitTenantConfigChange`). Each instance reads the fingerprint
//   `max(configVersion):count(*)` at most once per
//   TENANT_CONFIG_REVALIDATE_MS and drops its whole cache when it changed.
//   Other instances therefore see a suspension, a new domain or a flag
//   change within that interval. Misses are cached the same way, so a
//   domain added after a failed lookup resolves as soon as the bump is seen.
// - Entries also expire after TENANT_CONFIG_MAX_AGE_MS. That only matters
//   for writes that skip the bump (manual SQL, ops scripts).
//
// Why a version check every 5 s and not a plain short TTL: a TTL short
// enough to make suspensions effective quickly would reload every host and
// tenant every few seconds (two queries per tenant), while the fingerprint
// is one tiny query per instance per interval, however many tenants and
// hosts are cached. Why not check it on every request: it would add a
// control-DB round trip to every request, which is what the cache is for.
// The cost of the interval is that another instance may serve the old
// config for up to 5 s after a superadmin change.

import { asc, count, desc, eq, max, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
	defaultFeatureFlags,
	type FeatureFlags,
	resolveFeatureFlags,
} from "~/lib/features";
import { controlDb } from "~/server/db/control";
import {
	type TenantBranding,
	tenantAuthConfig,
	tenantDomains,
	tenantFeatures,
	tenants,
} from "~/server/db/control-schema";
import { logLine } from "~/server/lib/log";

/** How often an instance checks whether any tenant config changed. */
export const TENANT_CONFIG_REVALIDATE_MS = 5_000;
/** Upper bound for an entry, for writes that do not bump the version. */
export const TENANT_CONFIG_MAX_AGE_MS = 60_000;
/** Hosts come from request headers; don't let random ones grow the map. */
const MAX_HOST_ENTRIES = 1_000;

export type TenantStatus = (typeof tenants.$inferSelect)["status"];

export type GraphMailConfig = {
	clientId: string;
	clientSecret: string;
	azureTenantId: string;
	senderEmail: string;
};

/** The Corps' Entra app for "Mit Microsoft anmelden". */
export type MicrosoftLoginConfig = {
	clientId: string;
	clientSecret: string;
	azureTenantId: string;
};

/** Server-only: contains DB credentials and the Azure client secret. */
export type TenantConfig = {
	id: string;
	slug: string;
	displayName: string;
	status: TenantStatus;
	branding: TenantBranding | null;
	features: FeatureFlags;
	db: { url: string; authToken: string | null };
	graphMail: GraphMailConfig | null;
	/** Every domain of the tenant, primary first. */
	hostnames: string[];
	/** Null unless Microsoft login is enabled and fully configured. */
	microsoftLogin: MicrosoftLoginConfig | null;
};

type Entry<T> = { value: T; loadedAt: number };

const state = {
	hosts: new Map<string, Entry<string | null>>(),
	tenants: new Map<string, Entry<TenantConfig | null>>(),
	fingerprint: null as string | null,
	checkedAt: Number.NEGATIVE_INFINITY,
	fingerprintFailing: false,
	revalidating: null as Promise<void> | null,
	// Bumped on every invalidation; a load that started before it is not
	// stored, so an in-flight read can't put stale config back.
	generation: 0,
};

function fresh<T>(entry: Entry<T> | undefined): entry is Entry<T> {
	return (
		entry !== undefined &&
		Date.now() - entry.loadedAt < TENANT_CONFIG_MAX_AGE_MS
	);
}

function dropEntries() {
	state.generation++;
	state.hosts.clear();
	state.tenants.clear();
}

async function readFingerprint(): Promise<string> {
	const [row] = await controlDb
		.select({ version: max(tenants.configVersion), tenants: count() })
		.from(tenants);
	return `${row?.version ?? 0}:${row?.tenants ?? 0}`;
}

async function revalidate(): Promise<void> {
	if (Date.now() - state.checkedAt < TENANT_CONFIG_REVALIDATE_MS) {
		return;
	}
	state.revalidating ??= (async () => {
		try {
			const fingerprint = await readFingerprint();
			if (fingerprint !== state.fingerprint) {
				dropEntries();
				state.fingerprint = fingerprint;
			}
			state.fingerprintFailing = false;
		} catch (error) {
			// E.g. the control migration adding `configVersion` hasn't run yet.
			// Degrade to a plain TTL of one revalidation interval.
			if (!state.fingerprintFailing) {
				// Without request context: the context lookup reads this cache.
				logLine("error", "tenant config version check failed", {
					err: error,
				});
			}
			state.fingerprintFailing = true;
			dropEntries();
			state.fingerprint = null;
		} finally {
			state.checkedAt = Date.now();
			state.revalidating = null;
		}
	})();
	await state.revalidating;
}

/**
 * Tenant id for an already normalised host (lowercase, no port), or null
 * for unknown hosts and suspended tenants. Pending tenants resolve.
 */
export async function lookupTenantIdByHost(
	host: string,
): Promise<string | null> {
	await revalidate();
	const cached = state.hosts.get(host);
	if (fresh(cached)) {
		return cached.value;
	}

	const generation = state.generation;
	const [row] = await controlDb
		.select({ tenantId: tenantDomains.tenantId, status: tenants.status })
		.from(tenantDomains)
		.innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
		.where(eq(tenantDomains.hostname, host))
		.limit(1);
	const tenantId = row && row.status !== "suspended" ? row.tenantId : null;

	if (generation === state.generation) {
		if (state.hosts.size >= MAX_HOST_ENTRIES) {
			state.hosts.clear();
		}
		state.hosts.set(host, { value: tenantId, loadedAt: Date.now() });
	}
	return tenantId;
}

// If the flag table can't be read (e.g. its migration hasn't run yet) every
// flag stays off, so the app behaves as before flags existed instead of
// failing every request.
async function loadFeatureFlags(tenantId: string): Promise<FeatureFlags> {
	try {
		const rows = await controlDb
			.select({ key: tenantFeatures.key, enabled: tenantFeatures.enabled })
			.from(tenantFeatures)
			.where(eq(tenantFeatures.tenantId, tenantId));
		return resolveFeatureFlags(rows);
	} catch (error) {
		logLine("error", "tenant feature flags failed to load", {
			tenantId,
			err: error,
		});
		return defaultFeatureFlags();
	}
}

async function loadTenantConfig(id: string): Promise<TenantConfig | null> {
	// One row per domain (or one with a null hostname).
	const rows = await controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			displayName: tenants.displayName,
			status: tenants.status,
			branding: tenants.branding,
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
			microsoftEnabled: tenantAuthConfig.microsoftEnabled,
			azureClientId: tenantAuthConfig.azureClientId,
			azureClientSecret: tenantAuthConfig.azureClientSecret,
			azureTenantId: tenantAuthConfig.azureTenantId,
			mailSenderEmail: tenantAuthConfig.mailSenderEmail,
			hostname: tenantDomains.hostname,
		})
		.from(tenants)
		.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id))
		.leftJoin(tenantDomains, eq(tenantDomains.tenantId, tenants.id))
		.where(eq(tenants.id, id))
		.orderBy(desc(tenantDomains.isPrimary), asc(tenantDomains.hostname));
	const row = rows[0];
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		slug: row.slug,
		displayName: row.displayName,
		status: row.status,
		branding: row.branding ?? null,
		features: await loadFeatureFlags(row.id),
		db: { url: row.dbUrl, authToken: row.dbAuthToken ?? null },
		graphMail:
			row.azureClientId &&
			row.azureClientSecret &&
			row.azureTenantId &&
			row.mailSenderEmail
				? {
						clientId: row.azureClientId,
						clientSecret: row.azureClientSecret,
						azureTenantId: row.azureTenantId,
						senderEmail: row.mailSenderEmail,
					}
				: null,
		hostnames: rows.flatMap((r) => (r.hostname ? [r.hostname] : [])),
		microsoftLogin:
			row.microsoftEnabled &&
			row.azureClientId &&
			row.azureClientSecret &&
			row.azureTenantId
				? {
						clientId: row.azureClientId,
						clientSecret: row.azureClientSecret,
						azureTenantId: row.azureTenantId,
					}
				: null,
	};
}

/** Cached config of a tenant (any status), or null if it doesn't exist. */
export async function getTenantConfig(
	tenantId: string,
): Promise<TenantConfig | null> {
	await revalidate();
	const cached = state.tenants.get(tenantId);
	if (fresh(cached)) {
		return cached.value;
	}
	const generation = state.generation;
	const value = await loadTenantConfig(tenantId);
	if (generation === state.generation) {
		state.tenants.set(tenantId, { value, loadedAt: Date.now() });
	}
	return value;
}

/**
 * Drops this instance's cached config: one tenant (plus every host lookup,
 * since a write may have added or moved a domain) or, without an id,
 * everything including the version fingerprint.
 */
export function invalidateTenantConfig(tenantId?: string): void {
	state.generation++;
	state.hosts.clear();
	if (tenantId) {
		state.tenants.delete(tenantId);
		return;
	}
	state.tenants.clear();
	state.fingerprint = null;
	state.checkedAt = Number.NEGATIVE_INFINITY;
}

/** Drops only the host → tenant lookups of this instance. */
export function invalidateHostLookups(): void {
	state.generation++;
	state.hosts.clear();
}

/**
 * Statement that moves a tenant's configVersion past every other tenant's,
 * so `max(configVersion)` changes and all instances notice.
 */
export function bumpTenantConfigVersion(tenantId: string) {
	return controlDb
		.update(tenants)
		.set({
			configVersion: sql`(SELECT coalesce(max(${sql.identifier("configVersion")}), 0) + 1 FROM ${tenants})`,
		})
		.where(eq(tenants.id, tenantId));
}

type ControlBatchItem = BatchItem<"sqlite">;

/**
 * Runs config writes for a tenant atomically together with the version
 * bump, then invalidates this instance's cache for it.
 */
export async function commitTenantConfigChange(
	tenantId: string,
	writes: ControlBatchItem[],
): Promise<void> {
	await controlDb.batch([
		...writes,
		bumpTenantConfigVersion(tenantId),
	] as unknown as [ControlBatchItem, ...ControlBatchItem[]]);
	invalidateTenantConfig(tenantId);
}
