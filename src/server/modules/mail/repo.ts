// repo.ts — what the mails read from the tenant DB (#33).
//
// Takes the database it runs on; no rules, no formatting.

import "server-only";

import { and, eq } from "drizzle-orm";
import { kontos } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

/** The PayPal link on the active konto of `kasseType`, as stored, or null. */
export async function activeKontoPaypalLink(
	db: TenantDb,
	kasseType: string,
): Promise<string | null> {
	const [konto] = await db
		.select({ paypalLink: kontos.paypalLink })
		.from(kontos)
		.where(and(eq(kontos.kasseType, kasseType), eq(kontos.isActive, true)))
		.limit(1);
	return konto?.paypalLink ?? null;
}
