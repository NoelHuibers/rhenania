// scripts/ops/lib/deploy-migrations.ts — the pieces of the deploy-time
// migration step (scripts/ops/deploy-migrate.ts), kept free of env and
// process so they can be tested against local libSQL files.

import type { Client } from "@libsql/client";

/**
 * Should this build migrate the production databases?
 *
 * Only Vercel production builds do. Preview builds and local `pnpm build`
 * never touch a database. A build on Vercel without VERCEL_ENV is refused:
 * skipping silently would deploy code ahead of its schema.
 */
export function deployMode(
	env: Record<string, string | undefined>,
): { run: true } | { run: false; reason: string } {
	if (env.VERCEL !== "1") {
		return { run: false, reason: "not a Vercel build" };
	}
	if (!env.VERCEL_ENV) {
		throw new Error(
			"VERCEL_ENV is not set. Enable 'Automatically expose System Environment Variables' in the Vercel project settings.",
		);
	}
	if (env.VERCEL_ENV !== "production") {
		return { run: false, reason: `VERCEL_ENV=${env.VERCEL_ENV}` };
	}
	return { run: true };
}

// ─── Lock ────────────────────────────────────────────────────────────────────
//
// Two production builds can overlap (two merges in a row, a redeploy). A
// single-row lease in the control DB makes them migrate one after the other.
// The lease expires, so a build that dies mid-run can't block the next one
// for longer than LEASE_MS. The table is outside drizzle's `control_*`
// filter on purpose, like __drizzle_migrations.

const LOCK_TABLE = `CREATE TABLE IF NOT EXISTS __deploy_lock (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	holder TEXT NOT NULL,
	acquired_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
)`;

export type LockOptions = {
	/** Lease length; longer than any migration run. */
	leaseMs?: number;
	/** How long to wait for another build's lease. */
	waitMs?: number;
	pollMs?: number;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	log?: (line: string) => void;
};

async function tryAcquire(
	client: Client,
	holder: string,
	now: number,
	leaseMs: number,
): Promise<{ ok: true } | { ok: false; holder: string; expiresAt: number }> {
	await client.execute({
		sql: `INSERT INTO __deploy_lock (id, holder, acquired_at, expires_at)
			VALUES (1, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				holder = excluded.holder,
				acquired_at = excluded.acquired_at,
				expires_at = excluded.expires_at
			WHERE __deploy_lock.expires_at < ? OR __deploy_lock.holder = excluded.holder`,
		args: [holder, now, now + leaseMs, now],
	});
	const rs = await client.execute(
		"SELECT holder, expires_at FROM __deploy_lock WHERE id = 1",
	);
	const row = rs.rows[0];
	if (row && String(row.holder) === holder) {
		return { ok: true };
	}
	return {
		ok: false,
		holder: String(row?.holder ?? "unknown"),
		expiresAt: Number(row?.expires_at ?? 0),
	};
}

/** Waits for the lease; throws if another build holds it for longer than waitMs. */
export async function acquireDeployLock(
	client: Client,
	holder: string,
	opts: LockOptions = {},
): Promise<void> {
	const leaseMs = opts.leaseMs ?? 15 * 60_000;
	const waitMs = opts.waitMs ?? 10 * 60_000;
	const pollMs = opts.pollMs ?? 5_000;
	const now = opts.now ?? Date.now;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const log = opts.log ?? console.log;

	await client.execute(LOCK_TABLE);
	const deadline = now() + waitMs;
	for (;;) {
		const attempt = await tryAcquire(client, holder, now(), leaseMs);
		if (attempt.ok) {
			return;
		}
		if (now() >= deadline) {
			throw new Error(
				`Deploy lock held by ${attempt.holder} until ${new Date(attempt.expiresAt).toISOString()}; gave up after ${Math.round(waitMs / 1000)} s.`,
			);
		}
		log(`… waiting for the deploy lock (held by ${attempt.holder})`);
		await sleep(pollMs);
	}
}

export async function releaseDeployLock(
	client: Client,
	holder: string,
): Promise<void> {
	await client.execute({
		sql: "DELETE FROM __deploy_lock WHERE id = 1 AND holder = ?",
		args: [holder],
	});
}
