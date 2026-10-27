// health.ts — machine-checkable health of the platform.
//
// `/api/health` (public) checks the control DB and reports which migration
// heads this build expects. `/api/health/tenants` (bearer token or
// superadmin) checks every tenant DB: reachable, latency, whether its
// migration journal is at the head this build ships (schema drift), and how
// many members' `user` mirror rows are missing or stale (mirror drift, #35;
// repaired by `pnpm ops:reconcile-user-mirror`). One query per tenant DB.

import { sql } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
import { loadTenantMembers } from "~/server/lib/user-mirror-reconcile";
import controlJournal from "../../../drizzle/control/meta/_journal.json";
import tenantJournal from "../../../drizzle/meta/_journal.json";

type Journal = { entries: Array<{ idx: number; when: number; tag: string }> };

function head(journal: Journal) {
	const last = journal.entries.at(-1);
	return { tag: last?.tag ?? null, when: last?.when ?? 0 };
}

export const EXPECTED_HEADS = {
	tenant: head(tenantJournal as Journal),
	control: head(controlJournal as Journal),
};

async function timed<T>(fn: () => Promise<T>) {
	const start = performance.now();
	const value = await fn();
	return { value, ms: Math.round(performance.now() - start) };
}

export async function controlHealth() {
	try {
		const { ms } = await timed(() => controlDb.run(sql`select 1`));
		return { ok: true as const, latencyMs: ms };
	} catch (error) {
		return {
			ok: false as const,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export type TenantHealth = {
	slug: string;
	status: string;
	ok: boolean;
	latencyMs: number | null;
	head: string | null;
	drift: boolean;
	/** Members whose mirror row is missing or differs; null if unknown. */
	mirrorDrift: number | null;
	error?: string;
};

// Same comparison as `planUserMirror`, done inside the tenant DB against the
// members passed as JSON, so the check stays one round trip per tenant.
const TENANT_HEALTH_SQL = `
	SELECT
		(SELECT max(created_at) FROM __drizzle_migrations) AS last,
		(SELECT count(*) FROM json_each(?) AS m
			LEFT JOIN "user" AS u ON u."id" = json_extract(m.value, '$.id')
			WHERE u."id" IS NULL
				OR u."name" IS NOT json_extract(m.value, '$.name')
				OR u."email" IS NOT json_extract(m.value, '$.email')
				OR u."emailVerified" IS NOT json_extract(m.value, '$.emailVerified')
				OR u."image" IS NOT json_extract(m.value, '$.image')
		) AS mirrorDrift`;

async function membersByTenant() {
	const byTenant = new Map<string, object[]>();
	for (const { tenantId, user } of await loadTenantMembers(controlDb)) {
		if (!user) {
			continue;
		}
		const list = byTenant.get(tenantId) ?? [];
		list.push({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified ? 1 : 0,
			image: user.image,
		});
		byTenant.set(tenantId, list);
	}
	return byTenant;
}

/**
 * Every tenant's DB: reachable, is its journal at the expected head, and
 * does its user mirror match the control DB?
 */
export async function tenantsHealth(): Promise<TenantHealth[]> {
	const members = await membersByTenant();
	const rows = await controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			status: tenants.status,
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
		})
		.from(tenants);

	const expected = EXPECTED_HEADS.tenant;
	const byWhen = new Map(
		(tenantJournal as Journal).entries.map((e) => [e.when, e.tag] as const),
	);

	return Promise.all(
		rows.map(async (t): Promise<TenantHealth> => {
			let client: ReturnType<typeof createClient> | null = null;
			try {
				client = createClient({
					url: t.dbUrl,
					authToken: t.dbAuthToken ?? undefined,
				});
				const c = client;
				const { value, ms } = await timed(() =>
					c.execute({
						sql: TENANT_HEALTH_SQL,
						args: [JSON.stringify(members.get(t.id) ?? [])],
					}),
				);
				const last = Number(value.rows[0]?.last ?? 0);
				return {
					slug: t.slug,
					status: t.status,
					ok: true,
					latencyMs: ms,
					head: byWhen.get(last) ?? (last ? `unknown (${last})` : null),
					drift: last !== expected.when,
					mirrorDrift: Number(value.rows[0]?.mirrorDrift ?? 0),
				};
			} catch (error) {
				return {
					slug: t.slug,
					status: t.status,
					ok: false,
					latencyMs: null,
					head: null,
					drift: true,
					mirrorDrift: null,
					error: error instanceof Error ? error.message : String(error),
				};
			} finally {
				client?.close();
			}
		}),
	);
}
