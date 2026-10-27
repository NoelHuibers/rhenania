"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { etaplans } from "~/server/db/schema";
import { requireMember } from "~/server/lib/authz";
import { EDIT_ROLES, requireRoles } from "./_guards";

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

export async function createEtaplan(input: {
	name: string;
	semesterType: "SS" | "WS";
	year: number;
	startDate?: Date | null;
	endDate?: Date | null;
	status?: "Aktiv" | "Abgeschlossen";
	notes?: string | null;
}) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) {
		return { success: false as const, error: guard.error };
	}

	try {
		const parsed = baseSchema.parse(input);

		const duplicate = await db.query.etaplans.findFirst({
			where: (t, { and, eq }) =>
				and(eq(t.semesterType, parsed.semesterType), eq(t.year, parsed.year)),
			columns: { id: true },
		});

		const [row] = await db
			.insert(etaplans)
			.values({
				name: parsed.name,
				semesterType: parsed.semesterType,
				year: parsed.year,
				startDate: parsed.startDate ?? null,
				endDate: parsed.endDate ?? null,
				status: parsed.status ?? "Aktiv",
				notes: parsed.notes ?? null,
				createdBy: guard.userId,
			})
			.returning();

		revalidatePath("/cc-kasse");
		return {
			success: true as const,
			data: row,
			warning: duplicate
				? `Es existiert bereits ein Etatplan für ${parsed.semesterType} ${parsed.year}.`
				: undefined,
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
				details: error.issues,
			};
		}
		console.error("Error creating etaplan:", error);
		return { success: false as const, error: "Fehler beim Erstellen" };
	}
}

export async function updateEtaplan(
	id: string,
	input: {
		name?: string;
		semesterType?: "SS" | "WS";
		year?: number;
		startDate?: Date | null;
		endDate?: Date | null;
		status?: "Aktiv" | "Abgeschlossen";
		notes?: string | null;
	},
) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) {
		return { success: false as const, error: guard.error };
	}

	try {
		const parsed = baseSchema.partial().parse(input);
		const [row] = await db
			.update(etaplans)
			.set(parsed)
			.where(eq(etaplans.id, id))
			.returning();
		if (!row) {
			return { success: false as const, error: "Etatplan nicht gefunden" };
		}

		revalidatePath("/cc-kasse");
		return { success: true as const, data: row };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating etaplan:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}

export async function listEtaplans(): Promise<Etaplan[]> {
	await requireMember();
	try {
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
	await requireMember();
	try {
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
	await requireMember();
	try {
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
