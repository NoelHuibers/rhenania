// health.ts — machine-checkable health of the platform.
//
// `/api/health` (public) checks the control DB and reports which migration
// heads this build expects. `/api/health/tenants` (bearer token or
// superadmin) checks every tenant DB: reachable, latency, and whether its
// migration journal is at the head this build ships (schema drift).

import { sql } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
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
	error?: string;
};

/** Every tenant's DB: reachable, and is its journal at the expected head? */
export async function tenantsHealth(): Promise<TenantHealth[]> {
	const rows = await controlDb
		.select({
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
					c.execute("SELECT max(created_at) AS last FROM __drizzle_migrations"),
				);
				const last = Number(value.rows[0]?.last ?? 0);
				return {
					slug: t.slug,
					status: t.status,
					ok: true,
					latencyMs: ms,
					head: byWhen.get(last) ?? (last ? `unknown (${last})` : null),
					drift: last !== expected.when,
				};
			} catch (error) {
				return {
					slug: t.slug,
					status: t.status,
					ok: false,
					latencyMs: null,
					head: null,
					drift: true,
					error: error instanceof Error ? error.message : String(error),
				};
			} finally {
				client?.close();
			}
		}),
	);
}
