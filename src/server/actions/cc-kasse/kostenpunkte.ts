"use server";

import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { roundToCent } from "~/lib/money";
import {
	einnahmen,
	etaplans,
	events,
	kostenerstattungen,
	kostenpunkte,
	kostenpunktPositionen,
} from "~/server/db/schema";
import { requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { ConflictError } from "~/server/lib/domain-error";
import { scopeOf } from "~/server/lib/tenant-scope";
import { EDIT_ROLES } from "./_guards";

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

function buildPositionRows(
	kostenpunktId: string,
	positionen: z.infer<typeof positionSchema>[],
) {
	return positionen.map((p, i) => ({
		kostenpunktId,
		bemerkung: p.bemerkung?.trim() ? p.bemerkung.trim() : null,
		ausgaben: roundToCent(p.ausgaben ?? 0),
		einnahmen: roundToCent(p.einnahmen ?? 0),
		displayOrder: p.displayOrder ?? i,
	}));
}

export const createKostenpunkt = defineAction(
	{
		roles: EDIT_ROLES,
		schema: z.tuple([createSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant }) => {
		const { db } = tenant;
		const id = crypto.randomUUID();
		const rows = buildPositionRows(id, input.positionen);
		const budget = roundToCent(rows.reduce((s, p) => s + p.ausgaben, 0));
		const income = roundToCent(rows.reduce((s, p) => s + p.einnahmen, 0));

		const insertKp = db.insert(kostenpunkte).values({
			id,
			etaplanId: input.etaplanId,
			category: input.category,
			categoryOrder: input.categoryOrder,
			name: input.name,
			description: input.description ?? null,
			budget,
			income,
			eventId: input.eventId || null,
			displayOrder: input.displayOrder,
		});

		if (rows.length) {
			await db.batch([insertKp, db.insert(kostenpunktPositionen).values(rows)]);
		} else {
			await insertKp;
		}
		return { id };
	},
);

export const updateKostenpunkt = defineAction(
	{
		roles: EDIT_ROLES,
		schema: z.tuple([z.string(), updateSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, input], { tenant }) => {
		const { db } = tenant;
		const rows = buildPositionRows(id, input.positionen);
		const budget = roundToCent(rows.reduce((s, p) => s + p.ausgaben, 0));
		const income = roundToCent(rows.reduce((s, p) => s + p.einnahmen, 0));

		const updateKp = db
			.update(kostenpunkte)
			.set({
				category: input.category,
				categoryOrder: input.categoryOrder,
				name: input.name,
				description: input.description ?? null,
				budget,
				income,
				eventId: input.eventId || null,
				displayOrder: input.displayOrder,
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
	},
);

export const deleteKostenpunkt = defineAction(
	{
		roles: EDIT_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Löschen",
	},
	async ([id], { tenant }) => {
		const { db } = tenant;
		const [row] = await db
			.select({ c: sql<number>`count(*)` })
			.from(kostenerstattungen)
			.where(eq(kostenerstattungen.kostenpunktId, id));
		if (Number(row?.c ?? 0) > 0) {
			throw new ConflictError(
				"Kostenpunkt hat Erstattungen und kann nicht gelöscht werden.",
			);
		}
		const [einnahmeRow] = await db
			.select({ c: sql<number>`count(*)` })
			.from(einnahmen)
			.where(eq(einnahmen.kostenpunktId, id));
		if (Number(einnahmeRow?.c ?? 0) > 0) {
			throw new ConflictError(
				"Kostenpunkt hat gebuchte Einnahmen und kann nicht gelöscht werden.",
			);
		}

		await db.delete(kostenpunkte).where(eq(kostenpunkte.id, id));
	},
);

export async function listKostenpunkteForEtaplan(etaplanId: string) {
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
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

export type LinkableEvent = { id: string; title: string; date: Date };

export async function linkableEvents(): Promise<LinkableEvent[]> {
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
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
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
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
