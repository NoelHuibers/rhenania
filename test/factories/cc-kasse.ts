// CC-Kasse fixtures: Etatpläne, Kostenpunkte (+ Positionen), Erstattungen,
// Einnahmen and the CC-Kasse bank account. Rows are inserted directly into
// the current tenant DB so tests can start from any state of the workflow.

import {
	einnahmen,
	etaplans,
	kontos,
	kostenerstattungen,
	kostenpunkte,
	kostenpunktPositionen,
} from "~/server/db/schema";
import { tenantDb } from "../harness";

let counter = 0;
const next = () => ++counter;

export async function createEtaplan(
	opts: Partial<typeof etaplans.$inferInsert> = {},
	tenantId?: string,
) {
	const n = next();
	const [row] = await tenantDb(tenantId)
		.insert(etaplans)
		.values({
			name: `WS ${2000 + n}`,
			semesterType: "WS",
			year: 2000 + n,
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create etaplan");
	return row;
}

export type PositionSeed = {
	bemerkung?: string | null;
	ausgaben?: number;
	einnahmen?: number;
};

/**
 * Creates a Kostenpunkt. When `positionen` are given, budget/income default
 * to the sums of the positions (the invariant the actions maintain).
 */
export async function createKostenpunkt(
	etaplanId: string,
	opts: Partial<Omit<typeof kostenpunkte.$inferInsert, "etaplanId">> & {
		positionen?: PositionSeed[];
	} = {},
	tenantId?: string,
) {
	const { positionen, ...values } = opts;
	const budget =
		values.budget ??
		(positionen ?? []).reduce((s, p) => s + (p.ausgaben ?? 0), 0);
	const income =
		values.income ??
		(positionen ?? []).reduce((s, p) => s + (p.einnahmen ?? 0), 0);
	const db = tenantDb(tenantId);
	const [row] = await db
		.insert(kostenpunkte)
		.values({
			etaplanId,
			category: "Allgemein",
			name: `Kostenpunkt ${next()}`,
			...values,
			budget,
			income,
		})
		.returning();
	if (!row) throw new Error("Could not create kostenpunkt");
	if (positionen?.length) {
		await db.insert(kostenpunktPositionen).values(
			positionen.map((p, i) => ({
				kostenpunktId: row.id,
				bemerkung: p.bemerkung ?? null,
				ausgaben: p.ausgaben ?? 0,
				einnahmen: p.einnahmen ?? 0,
				displayOrder: i,
			})),
		);
	}
	return row;
}

export type KpRef = { id: string; etaplanId: string };

export async function createReimbursement(
	kp: KpRef,
	opts: Partial<
		Omit<typeof kostenerstattungen.$inferInsert, "kostenpunktId" | "etaplanId">
	> = {},
	tenantId?: string,
) {
	const [row] = await tenantDb(tenantId)
		.insert(kostenerstattungen)
		.values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			description: `Auslage ${next()}`,
			amount: 10,
			recipientName: "Max Muster",
			iban: "DE89370400440532013000",
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create reimbursement");
	return row;
}

export async function createEinnahme(
	kp: KpRef,
	opts: Partial<
		Omit<typeof einnahmen.$inferInsert, "kostenpunktId" | "etaplanId">
	> = {},
	tenantId?: string,
) {
	const [row] = await tenantDb(tenantId)
		.insert(einnahmen)
		.values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			description: `Einnahme ${next()}`,
			amount: 10,
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create einnahme");
	return row;
}

/** Active bank account for a Kasse (the Beitrag PDF needs a CC-Kasse one). */
export async function createKonto(
	opts: Partial<typeof kontos.$inferInsert> = {},
	tenantId?: string,
) {
	const [row] = await tenantDb(tenantId)
		.insert(kontos)
		.values({
			kasseType: "CC-Kasse",
			iban: "DE89370400440532013000",
			bic: "COBADEFFXXX",
			bankName: "Testbank",
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create konto");
	return row;
}
