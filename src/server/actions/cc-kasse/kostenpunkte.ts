"use server";

import { asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import {
	einnahmen,
	etaplans,
	events,
	kostenerstattungen,
	kostenpunkte,
	kostenpunktPositionen,
} from "~/server/db/schema";
import { EDIT_ROLES, requireRoles } from "./_guards";

const positionSchema = z.object({
	bemerkung: z.string().max(500).nullable().optional(),
	ausgaben: z.number().min(0).max(1_000_000).default(0),
	einnahmen: z.number().min(0).max(1_000_000).default(0),
	displayOrder: z.number().int().optional(),
});

const createSchema = z.object({
	etaplanId: z.string().min(1),
	category: z.string().min(1, "Kategorie ist erforderlich").max(255),
	categoryOrder: z.number().int().default(0),
	name: z.string().min(1, "Name ist erforderlich").max(255),
	description: z.string().max(1000).nullable().optional(),
	eventId: z.string().nullable().optional(),
	displayOrder: z.number().int().default(0),
	positionen: z.array(positionSchema).default([]),
});

const updateSchema = createSchema.omit({ etaplanId: true });

export type PositionInput = z.input<typeof positionSchema>;

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

function buildPositionRows(
	kostenpunktId: string,
	positionen: z.infer<typeof positionSchema>[],
) {
	return positionen.map((p, i) => ({
		kostenpunktId,
		bemerkung: p.bemerkung?.trim() ? p.bemerkung.trim() : null,
		ausgaben: round2(p.ausgaben ?? 0),
		einnahmen: round2(p.einnahmen ?? 0),
		displayOrder: p.displayOrder ?? i,
	}));
}

export async function createKostenpunkt(input: {
	etaplanId: string;
	category: string;
	categoryOrder?: number;
	name: string;
	description?: string | null;
	eventId?: string | null;
	displayOrder?: number;
	positionen?: PositionInput[];
}) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = createSchema.parse(input);
		const id = crypto.randomUUID();
		const rows = buildPositionRows(id, parsed.positionen);
		const budget = round2(rows.reduce((s, p) => s + p.ausgaben, 0));
		const income = round2(rows.reduce((s, p) => s + p.einnahmen, 0));

		const insertKp = db.insert(kostenpunkte).values({
			id,
			etaplanId: parsed.etaplanId,
			category: parsed.category,
			categoryOrder: parsed.categoryOrder,
			name: parsed.name,
			description: parsed.description ?? null,
			budget,
			income,
			eventId: parsed.eventId || null,
			displayOrder: parsed.displayOrder,
		});

		if (rows.length) {
			await db.batch([insertKp, db.insert(kostenpunktPositionen).values(rows)]);
		} else {
			await insertKp;
		}

		revalidatePath("/cc-kasse");
		return { success: true as const, data: { id } };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
				details: error.issues,
			};
		}
		console.error("Error creating kostenpunkt:", error);
		return { success: false as const, error: "Fehler beim Erstellen" };
	}
}

export async function updateKostenpunkt(
	id: string,
	input: {
		category: string;
		categoryOrder?: number;
		name: string;
		description?: string | null;
		eventId?: string | null;
		displayOrder?: number;
		positionen?: PositionInput[];
	},
) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = updateSchema.parse(input);
		const rows = buildPositionRows(id, parsed.positionen);
		const budget = round2(rows.reduce((s, p) => s + p.ausgaben, 0));
		const income = round2(rows.reduce((s, p) => s + p.einnahmen, 0));

		const updateKp = db
			.update(kostenpunkte)
			.set({
				category: parsed.category,
				categoryOrder: parsed.categoryOrder,
				name: parsed.name,
				description: parsed.description ?? null,
				budget,
				income,
				eventId: parsed.eventId || null,
				displayOrder: parsed.displayOrder,
			})
			.where(eq(kostenpunkte.id, id));
		const delPos = db
			.delete(kostenpunktPositionen)
			.where(eq(kostenpunktPositionen.kostenpunktId, id));

		if (rows.length) {
			await db.batch([
				updateKp,
				delPos,
				db.insert(kostenpunktPositionen).values(rows),
			]);
		} else {
			await db.batch([updateKp, delPos]);
		}

		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating kostenpunkt:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}

export async function deleteKostenpunkt(id: string) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const [row] = await db
			.select({ c: sql<number>`count(*)` })
			.from(kostenerstattungen)
			.where(eq(kostenerstattungen.kostenpunktId, id));
		if (Number(row?.c ?? 0) > 0) {
			return {
				success: false as const,
				error: "Kostenpunkt hat Erstattungen und kann nicht gelöscht werden.",
			};
		}
		const [einnahmeRow] = await db
			.select({ c: sql<number>`count(*)` })
			.from(einnahmen)
			.where(eq(einnahmen.kostenpunktId, id));
		if (Number(einnahmeRow?.c ?? 0) > 0) {
			return {
				success: false as const,
				error:
					"Kostenpunkt hat gebuchte Einnahmen und kann nicht gelöscht werden.",
			};
		}

		await db.delete(kostenpunkte).where(eq(kostenpunkte.id, id));
		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		console.error("Error deleting kostenpunkt:", error);
		return { success: false as const, error: "Fehler beim Löschen" };
	}
}

export async function listKostenpunkteForEtaplan(etaplanId: string) {
	try {
		return await db.query.kostenpunkte.findMany({
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
	} catch (error) {
		console.error("Error listing kostenpunkte:", error);
		return [];
	}
}

export type KostenpunktWithPositions = Awaited<
	ReturnType<typeof listKostenpunkteForEtaplan>
>[number];

export async function listCategories(etaplanId: string) {
	try {
		return await db
			.selectDistinct({
				category: kostenpunkte.category,
				categoryOrder: kostenpunkte.categoryOrder,
			})
			.from(kostenpunkte)
			.where(eq(kostenpunkte.etaplanId, etaplanId))
			.orderBy(asc(kostenpunkte.categoryOrder));
	} catch (error) {
		console.error("Error listing categories:", error);
		return [];
	}
}

export type LinkableEvent = { id: string; title: string; date: Date };

export async function linkableEvents(): Promise<LinkableEvent[]> {
	try {
		return await db
			.select({ id: events.id, title: events.title, date: events.date })
			.from(events)
			.orderBy(desc(events.date))
			.limit(300);
	} catch (error) {
		console.error("Error listing linkable events:", error);
		return [];
	}
}

export type BookableKostenpunkt = {
	id: string;
	name: string;
	category: string;
};

// Kostenpunkte from all active Etaplans — the options a member can book against.
export async function getBookableKostenpunkte(): Promise<
	BookableKostenpunkt[]
> {
	try {
		return await db
			.select({
				id: kostenpunkte.id,
				name: kostenpunkte.name,
				category: kostenpunkte.category,
			})
			.from(kostenpunkte)
			.innerJoin(etaplans, eq(kostenpunkte.etaplanId, etaplans.id))
			.where(eq(etaplans.status, "Aktiv"))
			.orderBy(asc(kostenpunkte.categoryOrder), asc(kostenpunkte.displayOrder));
	} catch (error) {
		console.error("Error listing bookable kostenpunkte:", error);
		return [];
	}
}
