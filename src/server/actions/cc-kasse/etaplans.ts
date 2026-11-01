"use server";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { etaplans } from "~/server/db/schema";
import { requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";
import { scopeOf } from "~/server/lib/tenant-scope";
import { EDIT_ROLES } from "./_guards";

export type Etaplan = typeof etaplans.$inferSelect;

const baseSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
	semesterType: z.enum(["SS", "WS"]),
	year: z
		.number()
		.int("Jahr muss eine ganze Zahl sein")
		.min(1900, "Jahr ist zu klein")
		.max(2200, "Jahr ist zu groß"),
	startDate: z.date().nullable().optional(),
	endDate: z.date().nullable().optional(),
	status: z.enum(["Aktiv", "Abgeschlossen"]).optional(),
	notes: z.string().max(1000).nullable().optional(),
});

/**
 * Creates a plan. A second plan for the same semester is allowed, but the
 * answer carries a warning about it.
 */
export const createEtaplan = defineAction(
	{
		roles: EDIT_ROLES,
		schema: z.tuple([baseSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => {
		const { db } = tenant;
		const duplicate = await db.query.etaplans.findFirst({
			where: (t, { and, eq }) =>
				and(eq(t.semesterType, input.semesterType), eq(t.year, input.year)),
			columns: { id: true },
		});

		const [row] = await db
			.insert(etaplans)
			.values({
				name: input.name,
				semesterType: input.semesterType,
				year: input.year,
				startDate: input.startDate ?? null,
				endDate: input.endDate ?? null,
				status: input.status ?? "Aktiv",
				notes: input.notes ?? null,
				createdBy: user.id,
			})
			.returning();

		return {
			etaplan: row,
			warning: duplicate
				? `Es existiert bereits ein Etatplan für ${input.semesterType} ${input.year}.`
				: undefined,
		};
	},
);

export const updateEtaplan = defineAction(
	{
		roles: EDIT_ROLES,
		schema: z.tuple([z.string(), baseSchema.partial()]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, patch], { tenant }) => {
		const [row] = await tenant.db
			.update(etaplans)
			.set(patch)
			.where(eq(etaplans.id, id))
			.returning();
		if (!row) {
			throw new NotFoundError("Etatplan nicht gefunden");
		}
		return { etaplan: row };
	},
);

export async function listEtaplans(): Promise<Etaplan[]> {
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
		return await db
			.select()
			.from(etaplans)
			.orderBy(
				desc(etaplans.year),
				desc(etaplans.startDate),
				desc(etaplans.createdAt),
			);
	} catch (error) {
		console.error("Error listing etaplans:", error);
		return [];
	}
}

export async function getEtaplanById(id: string): Promise<Etaplan | null> {
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
		const row = await db.query.etaplans.findFirst({
			where: (t, { eq }) => eq(t.id, id),
		});
		return row ?? null;
	} catch (error) {
		console.error("Error fetching etaplan:", error);
		return null;
	}
}

export async function getActiveEtaplan(): Promise<Etaplan | null> {
	const { tenantId } = await requireCaller();
	try {
		const { db } = await scopeOf(tenantId);
		const [row] = await db
			.select()
			.from(etaplans)
			.where(eq(etaplans.status, "Aktiv"))
			.orderBy(desc(etaplans.year), desc(etaplans.createdAt))
			.limit(1);
		return row ?? null;
	} catch (error) {
		console.error("Error fetching active etaplan:", error);
		return null;
	}
}
