"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { einnahmen } from "~/server/db/schema";
import { EDIT_ROLES, requireRoles, TREASURY_ROLES } from "./_guards";

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

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

export async function createEinnahme(input: {
	kostenpunktId: string;
	description: string;
	amount: number;
	incomeDate: Date;
}) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = einnahmeSchema.parse(input);
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, parsed.kostenpunktId),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}

		await db.insert(einnahmen).values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			description: parsed.description,
			amount: round2(parsed.amount),
			incomeDate: parsed.incomeDate,
			bookedBy: guard.userId,
		});

		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error creating einnahme:", error);
		return { success: false as const, error: "Fehler beim Buchen" };
	}
}

export async function updateEinnahme(
	id: string,
	input: {
		kostenpunktId: string;
		description: string;
		amount: number;
		incomeDate: Date;
	},
) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = einnahmeSchema.parse(input);
		const row = await db.query.einnahmen.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true },
		});
		if (!row) {
			return { success: false as const, error: "Einnahme nicht gefunden" };
		}
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, parsed.kostenpunktId),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}

		await db
			.update(einnahmen)
			.set({
				kostenpunktId: kp.id,
				etaplanId: kp.etaplanId,
				description: parsed.description,
				amount: round2(parsed.amount),
				incomeDate: parsed.incomeDate,
			})
			.where(eq(einnahmen.id, id));

		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating einnahme:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}

export async function deleteEinnahme(id: string) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		await db.delete(einnahmen).where(eq(einnahmen.id, id));
		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		console.error("Error deleting einnahme:", error);
		return { success: false as const, error: "Fehler beim Löschen" };
	}
}

export async function listEinnahmen(etaplanId: string) {
	// Read access for all Etaplan editors; booking/editing is treasury-only.
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return [];

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
