// repo.ts — the Kassen's bank accounts in the tenant DB (#33).
//
// Drizzle reads and writes of `konto`. Every function takes the database it
// runs on; none checks the caller or applies a rule. A read that may find
// nothing returns null; a failed query throws.

import "server-only";

import { eq } from "drizzle-orm";
import { kontos } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type Konto = typeof kontos.$inferSelect;
export type KontoInsert = typeof kontos.$inferInsert;

/** Every Konto by Kasse. */
export async function listKontos(db: TenantDb): Promise<Konto[]> {
	return db.select().from(kontos).orderBy(kontos.kasseType);
}

export async function kontoById(
	db: TenantDb,
	kontoId: string,
): Promise<Konto | null> {
	const [konto] = await db
		.select()
		.from(kontos)
		.where(eq(kontos.id, kontoId))
		.limit(1);
	return konto ?? null;
}

/** Stores the Konto; its id. */
export async function insertKonto(
	db: TenantDb,
	values: KontoInsert,
): Promise<string | undefined> {
	const [row] = await db
		.insert(kontos)
		.values(values)
		.returning({ id: kontos.id });
	return row?.id;
}

export async function updateKonto(
	db: TenantDb,
	kontoId: string,
	patch: Partial<KontoInsert>,
) {
	await db.update(kontos).set(patch).where(eq(kontos.id, kontoId));
}

export async function deleteKonto(db: TenantDb, kontoId: string) {
	await db.delete(kontos).where(eq(kontos.id, kontoId));
}
