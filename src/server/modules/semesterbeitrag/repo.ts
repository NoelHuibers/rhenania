// repo.ts — the Semesterbeitrag in the tenant DB (#33).
//
// Drizzle reads and writes of the runs, their charges and the CC-Kasse
// account the invoices name. Every function takes the database it runs on;
// none checks the caller, applies a rule or revalidates a page. A read that
// may find nothing returns null or []; a failed query throws.

import "server-only";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
	kontos,
	kostenpunkte,
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type BeitragRun = typeof semesterbeitragRuns.$inferSelect;
type ChargeInsert = typeof semesterbeitragCharges.$inferInsert;

// ─── Runs ────────────────────────────────────────────────────────────────────

/** Every run, newest first. */
export async function listRuns(db: TenantDb): Promise<BeitragRun[]> {
	return db
		.select()
		.from(semesterbeitragRuns)
		.orderBy(desc(semesterbeitragRuns.createdAt));
}

export async function findRun(
	db: TenantDb,
	runId: string,
): Promise<BeitragRun | null> {
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	return run ?? null;
}

/** The Etatplan of a Kostenpunkt, or null if there is no such Kostenpunkt. */
export async function kostenpunktPlan(
	db: TenantDb,
	kostenpunktId: string,
): Promise<{ etaplanId: string } | null> {
	const [kp] = await db
		.select({ etaplanId: kostenpunkte.etaplanId })
		.from(kostenpunkte)
		.where(eq(kostenpunkte.id, kostenpunktId))
		.limit(1);
	return kp ?? null;
}

export async function insertRun(
	db: TenantDb,
	values: typeof semesterbeitragRuns.$inferInsert,
): Promise<void> {
	await db.insert(semesterbeitragRuns).values(values);
}

/** How many of the run's charges are paid. */
export async function countPaidCharges(
	db: TenantDb,
	runId: string,
): Promise<number> {
	const [row] = await db
		.select({ c: sql<number>`count(*)` })
		.from(semesterbeitragCharges)
		.where(
			and(
				eq(semesterbeitragCharges.runId, runId),
				eq(semesterbeitragCharges.status, "Bezahlt"),
			),
		);
	return Number(row?.c ?? 0);
}

/**
 * Deletes the run and its charges. The charges go first and explicitly —
 * don't rely on FK cascade being enforced.
 */
export async function deleteRun(db: TenantDb, runId: string): Promise<void> {
	await db
		.delete(semesterbeitragCharges)
		.where(eq(semesterbeitragCharges.runId, runId));
	await db.delete(semesterbeitragRuns).where(eq(semesterbeitragRuns.id, runId));
}

// ─── Charges ─────────────────────────────────────────────────────────────────

/** Adds charges; a member who already has one in the run is skipped. */
export async function insertCharges(
	db: TenantDb,
	rows: ChargeInsert[],
): Promise<void> {
	await db.insert(semesterbeitragCharges).values(rows).onConflictDoNothing();
}

/** The run's charges by name, with the member's email and status. */
export async function chargesOfRun(db: TenantDb, runId: string) {
	return db.query.semesterbeitragCharges.findMany({
		where: (t, { eq }) => eq(t.runId, runId),
		orderBy: (t, { asc }) => [asc(t.memberName)],
		with: {
			member: { columns: { id: true, email: true, status: true } },
		},
	});
}

/** The run's charges that are not paid, with the member's email. */
export async function unpaidChargesOfRun(db: TenantDb, runId: string) {
	return db.query.semesterbeitragCharges.findMany({
		where: and(
			eq(semesterbeitragCharges.runId, runId),
			ne(semesterbeitragCharges.status, "Bezahlt"),
		),
		with: { member: { columns: { email: true } } },
	});
}

/** The run's open charges, with the member's email. */
export async function openChargesOfRun(db: TenantDb, runId: string) {
	return db.query.semesterbeitragCharges.findMany({
		where: (t, { and, eq }) => and(eq(t.runId, runId), eq(t.status, "Offen")),
		with: { member: { columns: { email: true } } },
	});
}

/** A charge with its run and member (for the PDF), or null. */
export async function chargeWithRun(db: TenantDb, chargeId: string) {
	const charge = await db.query.semesterbeitragCharges.findFirst({
		where: (t, { eq }) => eq(t.id, chargeId),
		with: { run: true, member: true },
	});
	return charge ?? null;
}

/** When the charge's reminder went out, or null if there is no such charge. */
export async function chargeReminder(
	db: TenantDb,
	chargeId: string,
): Promise<{ mahnungSentAt: Date | null } | null> {
	const charge = await db.query.semesterbeitragCharges.findFirst({
		where: (t, { eq }) => eq(t.id, chargeId),
		columns: { id: true, mahnungSentAt: true },
	});
	return charge ?? null;
}

export async function updateCharge(
	db: TenantDb,
	chargeId: string,
	values: Partial<ChargeInsert>,
): Promise<void> {
	await db
		.update(semesterbeitragCharges)
		.set(values)
		.where(eq(semesterbeitragCharges.id, chargeId));
}

/**
 * Marks an open, not yet reminded charge as Gemahnt. Guarded so a payment
 * booked while the reminder was being sent is not overwritten.
 */
export async function markReminded(
	db: TenantDb,
	chargeId: string,
	values: Pick<
		ChargeInsert,
		"mahnungAmount" | "mahnungSentAt" | "deliveryMethod"
	>,
): Promise<void> {
	await db
		.update(semesterbeitragCharges)
		.set({ status: "Gemahnt", ...values })
		.where(
			and(
				eq(semesterbeitragCharges.id, chargeId),
				eq(semesterbeitragCharges.status, "Offen"),
				isNull(semesterbeitragCharges.mahnungSentAt),
			),
		);
}

// ─── The CC-Kasse account ────────────────────────────────────────────────────

/** The active CC-Kasse account the invoices name, or null. */
export async function activeCcKasseKonto(db: TenantDb) {
	const [konto] = await db
		.select()
		.from(kontos)
		.where(and(eq(kontos.kasseType, "CC-Kasse"), eq(kontos.isActive, true)))
		.limit(1);
	return konto ?? null;
}
