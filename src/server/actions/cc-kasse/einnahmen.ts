"use server";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { roundToCent } from "~/lib/money";
import { einnahmen } from "~/server/db/schema";
import { defineAction } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";
import { scopeOf, type TenantScope } from "~/server/lib/tenant-scope";
import { EDIT_ROLES, requireRoles, TREASURY_ROLES } from "./_guards";

const einnahmeSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z
		.string()
		.min(1, "Beschreibung ist erforderlich")
		.max(500, "Beschreibung ist zu lang"),
	amount: z
		.number()
		.positive("Betrag muss positiv sein")
		.max(1_000_000, "Betrag ist zu hoch"),
	incomeDate: z.date(),
});

/** The Kostenpunkt to book against, with the plan it belongs to. */
async function bookableKostenpunkt({ db }: TenantScope, id: string) {
	const kp = await db.query.kostenpunkte.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, etaplanId: true },
	});
	if (!kp) {
		throw new NotFoundError("Kostenpunkt nicht gefunden");
	}
	return kp;
}

export const createEinnahme = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([einnahmeSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Buchen",
	},
	async ([input], { tenant, user }) => {
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
		await tenant.db.insert(einnahmen).values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			description: input.description,
			amount: roundToCent(input.amount),
			incomeDate: input.incomeDate,
			bookedBy: user.id,
		});
	},
);

export const updateEinnahme = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([z.string(), einnahmeSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, input], { tenant }) => {
		const row = await tenant.db.query.einnahmen.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true },
		});
		if (!row) {
			throw new NotFoundError("Einnahme nicht gefunden");
		}
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);

		await tenant.db
			.update(einnahmen)
			.set({
				kostenpunktId: kp.id,
				etaplanId: kp.etaplanId,
				description: input.description,
				amount: roundToCent(input.amount),
				incomeDate: input.incomeDate,
			})
			.where(eq(einnahmen.id, id));
	},
);

export const deleteEinnahme = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Löschen",
	},
	async ([id], { tenant }) => {
		await tenant.db.delete(einnahmen).where(eq(einnahmen.id, id));
	},
);

export async function listEinnahmen(etaplanId: string) {
	// Read access for all Etaplan editors; booking/editing is treasury-only.
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) {
		return [];
	}

	const { db } = await scopeOf(guard.tenantId);
	return db.query.einnahmen.findMany({
		where: (t, { eq }) => eq(t.etaplanId, etaplanId),
		orderBy: (t) => [desc(t.incomeDate), desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			booker: { columns: { id: true, name: true } },
		},
	});
}

export type EinnahmeRow = Awaited<ReturnType<typeof listEinnahmen>>[number];
