// repo.ts — the CC-Kasse in the tenant DB (#33).
//
// Drizzle reads and writes of the Etatpläne, their Kostenpunkte (with
// Positionen), Einnahmen and Kostenerstattungen, the members' payment
// details and the sums the budget overview is computed from. Every
// function takes the database it runs on; none checks the caller, applies
// a rule or revalidates a page. A read that may find nothing returns null
// or []; a failed query throws.

import "server-only";

import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import {
	einnahmen,
	etaplans,
	events,
	kostenerstattungen,
	kostenpunkte,
	kostenpunktPositionen,
	semesterbeitragCharges,
	semesterbeitragRuns,
	userPaymentInfo,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import type { OverviewSums } from "~/server/domain/cc-kasse/overview";

export type Etaplan = typeof etaplans.$inferSelect;
type EtaplanInsert = typeof etaplans.$inferInsert;
type KostenpunktInsert = typeof kostenpunkte.$inferInsert;
type PositionInsert = typeof kostenpunktPositionen.$inferInsert;
type EinnahmeInsert = typeof einnahmen.$inferInsert;
export type ErstattungInsert = typeof kostenerstattungen.$inferInsert;
export type ErstattungStatus =
	(typeof kostenerstattungen.$inferSelect)["status"];

// ─── Etatpläne ───────────────────────────────────────────────────────────────

/** Every plan, newest year first. */
export async function listEtaplans(db: TenantDb): Promise<Etaplan[]> {
	return db
		.select()
		.from(etaplans)
		.orderBy(
			desc(etaplans.year),
			desc(etaplans.startDate),
			desc(etaplans.createdAt),
		);
}

export async function findEtaplan(
	db: TenantDb,
	id: string,
): Promise<Etaplan | null> {
	const row = await db.query.etaplans.findFirst({
		where: (t, { eq }) => eq(t.id, id),
	});
	return row ?? null;
}

/** The newest active plan, or null. */
export async function activeEtaplan(db: TenantDb): Promise<Etaplan | null> {
	const [row] = await db
		.select()
		.from(etaplans)
		.where(eq(etaplans.status, "Aktiv"))
		.orderBy(desc(etaplans.year), desc(etaplans.createdAt))
		.limit(1);
	return row ?? null;
}

/** Whether a plan for this semester exists already. */
export async function hasEtaplanFor(
	db: TenantDb,
	semesterType: "SS" | "WS",
	year: number,
): Promise<boolean> {
	const row = await db.query.etaplans.findFirst({
		where: (t, { and, eq }) =>
			and(eq(t.semesterType, semesterType), eq(t.year, year)),
		columns: { id: true },
	});
	return row !== undefined;
}

export async function insertEtaplan(
	db: TenantDb,
	values: EtaplanInsert,
): Promise<Etaplan | undefined> {
	const [row] = await db.insert(etaplans).values(values).returning();
	return row;
}

/** Updates a plan and answers the new row, or null if there is none. */
export async function updateEtaplan(
	db: TenantDb,
	id: string,
	patch: Partial<EtaplanInsert>,
): Promise<Etaplan | null> {
	const [row] = await db
		.update(etaplans)
		.set(patch)
		.where(eq(etaplans.id, id))
		.returning();
	return row ?? null;
}

// ─── Kostenpunkte ────────────────────────────────────────────────────────────

/** A plan's Kostenpunkte in display order, with Positionen and event. */
export async function listKostenpunkte(db: TenantDb, etaplanId: string) {
	return db.query.kostenpunkte.findMany({
		where: (t, { eq }) => eq(t.etaplanId, etaplanId),
		orderBy: (t, { asc }) => [
			asc(t.categoryOrder),
			asc(t.displayOrder),
			asc(t.createdAt),
		],
		with: {
			positionen: {
				orderBy: (p, { asc }) => [asc(p.displayOrder)],
			},
			event: { columns: { id: true, title: true, date: true } },
		},
	});
}

/** The Kostenpunkte of every active plan. */
export async function activeKostenpunkte(db: TenantDb) {
	return db
		.select({
			id: kostenpunkte.id,
			name: kostenpunkte.name,
			category: kostenpunkte.category,
		})
		.from(kostenpunkte)
		.innerJoin(etaplans, eq(kostenpunkte.etaplanId, etaplans.id))
		.where(eq(etaplans.status, "Aktiv"))
		.orderBy(asc(kostenpunkte.categoryOrder), asc(kostenpunkte.displayOrder));
}

/** A Kostenpunkt's id and plan, or null. */
export async function findKostenpunkt(
	db: TenantDb,
	id: string,
): Promise<{ id: string; etaplanId: string } | null> {
	const kp = await db.query.kostenpunkte.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, etaplanId: true },
	});
	return kp ?? null;
}

/** Adds a Kostenpunkt with its Positionen, atomically. */
export async function insertKostenpunkt(
	db: TenantDb,
	values: KostenpunktInsert,
	positionen: PositionInsert[],
): Promise<void> {
	const insertKp = db.insert(kostenpunkte).values(values);
	if (positionen.length) {
		await db.batch([
			insertKp,
			db.insert(kostenpunktPositionen).values(positionen),
		]);
	} else {
		await insertKp;
	}
}

/** Updates a Kostenpunkt and replaces its Positionen, atomically. */
export async function replaceKostenpunkt(
	db: TenantDb,
	id: string,
	values: Partial<KostenpunktInsert>,
	positionen: PositionInsert[],
): Promise<void> {
	const updateKp = db
		.update(kostenpunkte)
		.set(values)
		.where(eq(kostenpunkte.id, id));
	const delPos = db
		.delete(kostenpunktPositionen)
		.where(eq(kostenpunktPositionen.kostenpunktId, id));
	if (positionen.length) {
		await db.batch([
			updateKp,
			delPos,
			db.insert(kostenpunktPositionen).values(positionen),
		]);
	} else {
		await db.batch([updateKp, delPos]);
	}
}

/** How many Erstattungen are booked on the Kostenpunkt. */
export async function countErstattungen(
	db: TenantDb,
	kostenpunktId: string,
): Promise<number> {
	const [row] = await db
		.select({ c: sql<number>`count(*)` })
		.from(kostenerstattungen)
		.where(eq(kostenerstattungen.kostenpunktId, kostenpunktId));
	return Number(row?.c ?? 0);
}

/** How many Einnahmen are booked on the Kostenpunkt. */
export async function countEinnahmen(
	db: TenantDb,
	kostenpunktId: string,
): Promise<number> {
	const [row] = await db
		.select({ c: sql<number>`count(*)` })
		.from(einnahmen)
		.where(eq(einnahmen.kostenpunktId, kostenpunktId));
	return Number(row?.c ?? 0);
}

export async function deleteKostenpunkt(
	db: TenantDb,
	id: string,
): Promise<void> {
	await db.delete(kostenpunkte).where(eq(kostenpunkte.id, id));
}

/** The latest 300 events, newest first (a Kostenpunkt may name one). */
export async function recentEvents(db: TenantDb) {
	return db
		.select({ id: events.id, title: events.title, date: events.date })
		.from(events)
		.orderBy(desc(events.date))
		.limit(300);
}

// ─── Einnahmen ───────────────────────────────────────────────────────────────

/** A plan's Einnahmen, newest first, with Kostenpunkt and booker. */
export async function listEinnahmen(db: TenantDb, etaplanId: string) {
	return db.query.einnahmen.findMany({
		where: (t, { eq }) => eq(t.etaplanId, etaplanId),
		orderBy: (t) => [desc(t.incomeDate), desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			booker: { columns: { id: true, name: true } },
		},
	});
}

export async function einnahmeExists(
	db: TenantDb,
	id: string,
): Promise<boolean> {
	const row = await db.query.einnahmen.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true },
	});
	return row !== undefined;
}

export async function insertEinnahme(
	db: TenantDb,
	values: EinnahmeInsert,
): Promise<void> {
	await db.insert(einnahmen).values(values);
}

export async function updateEinnahme(
	db: TenantDb,
	id: string,
	values: Partial<EinnahmeInsert>,
): Promise<void> {
	await db.update(einnahmen).set(values).where(eq(einnahmen.id, id));
}

export async function deleteEinnahme(db: TenantDb, id: string): Promise<void> {
	await db.delete(einnahmen).where(eq(einnahmen.id, id));
}

// ─── Kostenerstattungen ──────────────────────────────────────────────────────

export async function insertErstattung(
	db: TenantDb,
	values: ErstattungInsert,
): Promise<void> {
	await db.insert(kostenerstattungen).values(values);
}

/** Who submitted a request, its status and receipts; null if there is none. */
export async function findErstattung(db: TenantDb, id: string) {
	const row = await db.query.kostenerstattungen.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, submittedBy: true, status: true, receipts: true },
	});
	return row ?? null;
}

export async function updateErstattung(
	db: TenantDb,
	id: string,
	values: Partial<ErstattungInsert>,
): Promise<void> {
	await db
		.update(kostenerstattungen)
		.set(values)
		.where(eq(kostenerstattungen.id, id));
}

export async function deleteErstattung(
	db: TenantDb,
	id: string,
): Promise<void> {
	await db.delete(kostenerstattungen).where(eq(kostenerstattungen.id, id));
}

/** The member's own requests, newest first, with Kostenpunkt and plan. */
export async function erstattungenOf(db: TenantDb, userId: string) {
	return db.query.kostenerstattungen.findMany({
		where: (t, { eq }) => eq(t.submittedBy, userId),
		orderBy: (t, { desc }) => [desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			etaplan: { columns: { id: true, name: true } },
		},
	});
}

/** Every request (of a plan, in a status), newest first, with submitter. */
export async function erstattungQueue(
	db: TenantDb,
	filter?: { etaplanId?: string; status?: ErstattungStatus },
) {
	const conds: Array<SQL | undefined> = [];
	if (filter?.etaplanId) {
		conds.push(eq(kostenerstattungen.etaplanId, filter.etaplanId));
	}
	if (filter?.status) {
		conds.push(eq(kostenerstattungen.status, filter.status));
	}
	return db.query.kostenerstattungen.findMany({
		where: conds.length ? and(...conds) : undefined,
		orderBy: (t) => [desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			etaplan: { columns: { id: true, name: true } },
			submitter: { columns: { id: true, name: true } },
		},
	});
}

// ─── Payment details ─────────────────────────────────────────────────────────

/** The account a member's reimbursements are paid to, or null. */
export async function paymentInfoOf(
	db: TenantDb,
	userId: string,
): Promise<{ accountHolder: string; iban: string } | null> {
	const row = await db.query.userPaymentInfo.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
		columns: { accountHolder: true, iban: true },
	});
	return row ?? null;
}

export async function savePaymentInfo(
	db: TenantDb,
	userId: string,
	values: { accountHolder: string; iban: string },
): Promise<void> {
	await db
		.insert(userPaymentInfo)
		.values({ userId, ...values })
		.onConflictDoUpdate({
			target: userPaymentInfo.userId,
			set: { ...values, updatedAt: sql`(unixepoch())` },
		});
}

// ─── The overview ────────────────────────────────────────────────────────────

/** Everything a plan's budget overview is computed from. */
export async function overviewSums(
	db: TenantDb,
	etaplanId: string,
): Promise<OverviewSums> {
	const kps = await db
		.select({
			id: kostenpunkte.id,
			name: kostenpunkte.name,
			category: kostenpunkte.category,
			categoryOrder: kostenpunkte.categoryOrder,
			eventId: kostenpunkte.eventId,
			budget: kostenpunkte.budget,
			income: kostenpunkte.income,
		})
		.from(kostenpunkte)
		.where(eq(kostenpunkte.etaplanId, etaplanId))
		.orderBy(kostenpunkte.categoryOrder, kostenpunkte.displayOrder);

	const erstattungen = await db
		.select({
			kostenpunktId: kostenerstattungen.kostenpunktId,
			status: kostenerstattungen.status,
			total: sql<number>`COALESCE(SUM(${kostenerstattungen.amount}), 0)`,
		})
		.from(kostenerstattungen)
		.where(eq(kostenerstattungen.etaplanId, etaplanId))
		.groupBy(kostenerstattungen.kostenpunktId, kostenerstattungen.status);

	const beitraege = await db
		.select({
			kostenpunktId: semesterbeitragRuns.kostenpunktId,
			total: sql<number>`COALESCE(SUM(${semesterbeitragCharges.baseAmount} + ${semesterbeitragCharges.mahnungAmount}), 0)`,
		})
		.from(semesterbeitragCharges)
		.innerJoin(
			semesterbeitragRuns,
			eq(semesterbeitragCharges.runId, semesterbeitragRuns.id),
		)
		.where(
			and(
				eq(semesterbeitragRuns.etaplanId, etaplanId),
				eq(semesterbeitragCharges.status, "Bezahlt"),
			),
		)
		.groupBy(semesterbeitragRuns.kostenpunktId);

	const einnahmeSums = await db
		.select({
			kostenpunktId: einnahmen.kostenpunktId,
			total: sql<number>`COALESCE(SUM(${einnahmen.amount}), 0)`,
		})
		.from(einnahmen)
		.where(eq(einnahmen.etaplanId, etaplanId))
		.groupBy(einnahmen.kostenpunktId);

	return {
		kostenpunkte: kps,
		erstattungen,
		beitraege,
		einnahmen: einnahmeSums,
	};
}
