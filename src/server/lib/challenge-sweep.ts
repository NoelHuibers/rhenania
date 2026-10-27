// challenge-sweep.ts — expiry and auto-settle of challenges past a deadline.
//
// `sweepAllChallenges()` runs from the scheduled job (`/api/cron/challenges`)
// for every active Corps plus the cross-Corps table. It is safe to run any
// number of times, also concurrently: expiry re-checks status and deadline in
// the UPDATE, and each settlement claims its challenge first.
//
// Reads never write. Until the next sweep, feeds show overdue challenges with
// `shownChallengeStatus` / `shownCrossChallengeStatus`, i.e. as the sweep
// will leave them.

import { and, eq, lt, or } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { crossTenantChallenges, tenants } from "~/server/db/control-schema";
import { challenges } from "~/server/db/schema";
import { getTenantDb, type TenantDb } from "~/server/db/tenants";
import { type CorpsScope, settleChallenge } from "./challenge-settlement";
import { log } from "./log";

type Deadlines = {
	status: string;
	respondDeadline: Date;
	playDeadline: Date | null;
	confirmDeadline: Date | null;
};

const before = (deadline: Date | null, at: Date) =>
	deadline != null && deadline.getTime() < at.getTime();

/** Unanswered or unplayed in time: the sweep expires it. */
function missedDeadline(row: Deadlines, at: Date): boolean {
	return (
		(row.status === "pending" && before(row.respondDeadline, at)) ||
		(row.status === "accepted" && before(row.playDeadline, at))
	);
}

/**
 * Status of an in-Corps challenge as the next sweep will leave it. A result
 * past its confirm window keeps `result_proposed`: the sweep settles it as
 * proposed, and confirming it meanwhile does the same.
 */
export function shownChallengeStatus<S extends string>(
	row: Deadlines & { status: S },
	at: Date,
): S | "expired" {
	return missedDeadline(row, at) ? "expired" : row.status;
}

/** Status of a cross-Corps challenge as the next sweep will leave it. */
export function shownCrossChallengeStatus<S extends string>(
	row: Deadlines & { status: S },
	at: Date,
): S | "expired" {
	const unconfirmed =
		row.status === "result_proposed" && before(row.confirmDeadline, at);
	return missedDeadline(row, at) || unconfirmed ? "expired" : row.status;
}

// ---------- In-Corps ----------

function overdue(at: Date) {
	return {
		respondMissed: and(
			eq(challenges.status, "pending"),
			lt(challenges.respondDeadline, at),
		),
		playMissed: and(
			eq(challenges.status, "accepted"),
			lt(challenges.playDeadline, at),
		),
		confirmMissed: and(
			eq(challenges.status, "result_proposed"),
			lt(challenges.confirmDeadline, at),
		),
	};
}

/**
 * Expires unanswered and unplayed challenges. The UPDATE re-checks status
 * and deadline, so a reply landing meanwhile is kept. Returns how many.
 */
export async function expireOverdueChallenges(
	db: TenantDb,
	at = new Date(),
): Promise<number> {
	const { respondMissed, playMissed } = overdue(at);
	const expired = await db
		.update(challenges)
		.set({ status: "expired" })
		.where(or(respondMissed, playMissed))
		.returning({ id: challenges.id });
	return expired.length;
}

export type CorpsSweep = { expired: number; settled: number; failed: number };

/**
 * One Corps: expires what missed its reply or play window and auto-settles
 * results nobody confirmed in time. Looks first (one indexed read) and only
 * writes when something is due, since an UPDATE that matches nothing still
 * takes the write lock.
 */
export async function sweepCorpsChallenges(
	scope: CorpsScope,
): Promise<CorpsSweep> {
	const at = new Date();
	const { respondMissed, playMissed, confirmMissed } = overdue(at);
	const result: CorpsSweep = { expired: 0, settled: 0, failed: 0 };

	const due = await scope.db
		.select({ id: challenges.id, status: challenges.status })
		.from(challenges)
		.where(or(respondMissed, playMissed, confirmMissed));
	if (due.length === 0) {
		return result;
	}

	if (due.some((c) => c.status !== "result_proposed")) {
		result.expired = await expireOverdueChallenges(scope.db, at);
	}

	// Each settlement claims its row first, so overlapping sweeps (Vercel may
	// deliver a run twice) book every challenge exactly once.
	for (const { id, status } of due) {
		if (status !== "result_proposed") {
			continue;
		}
		try {
			if ((await settleChallenge(scope, id)).success) {
				result.settled++;
			}
		} catch (error) {
			result.failed++;
			log.error("challenge auto-settle failed", {
				tenant: scope.tenantId,
				challengeId: id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return result;
}

// ---------- Cross-Corps ----------

/**
 * Expires cross-Corps challenges past any deadline, unconfirmed results
 * included (cross-Corps results are never settled without a confirm). Looks
 * first, then one UPDATE; returns how many rows it changed.
 */
export async function sweepCrossCorpsChallenges(
	at = new Date(),
): Promise<number> {
	const t = crossTenantChallenges;
	const overdue = or(
		and(eq(t.status, "pending"), lt(t.respondDeadline, at)),
		and(eq(t.status, "accepted"), lt(t.playDeadline, at)),
		and(eq(t.status, "result_proposed"), lt(t.confirmDeadline, at)),
	);
	const [due] = await controlDb
		.select({ id: t.id })
		.from(t)
		.where(overdue)
		.limit(1);
	if (!due) {
		return 0;
	}
	const expired = await controlDb
		.update(t)
		.set({ status: "expired" })
		.where(overdue)
		.returning({ id: t.id });
	return expired.length;
}

// ---------- Everything ----------

export type SweepReport = {
	ok: boolean;
	corps: ({ slug: string } & (CorpsSweep | { error: string }))[];
	crossExpired: number | null;
};

/** Every active Corps, then the cross-Corps table. One failure skips only itself. */
export async function sweepAllChallenges(): Promise<SweepReport> {
	const active = await controlDb
		.select({ id: tenants.id, slug: tenants.slug })
		.from(tenants)
		.where(eq(tenants.status, "active"));

	const corps = await Promise.all(
		active.map(async ({ id, slug }) => {
			try {
				const db = await getTenantDb(id);
				return { slug, ...(await sweepCorpsChallenges({ tenantId: id, db })) };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log.error("challenge sweep failed", { tenant: slug, error: message });
				return { slug, error: message };
			}
		}),
	);

	let crossExpired: number | null = null;
	try {
		crossExpired = await sweepCrossCorpsChallenges();
	} catch (error) {
		log.error("cross-Corps challenge sweep failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	const ok =
		crossExpired !== null &&
		corps.every((c) => !("error" in c) && c.failed === 0);
	return { ok, corps, crossExpired };
}
