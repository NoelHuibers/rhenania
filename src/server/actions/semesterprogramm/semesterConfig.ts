"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/server/db";
import { semesterConfig } from "~/server/db/schema";
import { ROLES, requireMember } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";

export type SemesterConfig = typeof semesterConfig.$inferSelect;

export async function getSemesterConfig(): Promise<SemesterConfig | null> {
	await requireMember();
	const [row] = await db
		.select()
		.from(semesterConfig)
		.where(eq(semesterConfig.id, "singleton"))
		.limit(1);
	return row ?? null;
}

export const upsertSemesterConfig = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([
			z.object({ name: z.string(), startDate: z.date(), endDate: z.date() }),
		]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant }) => {
		await tenant.db
			.insert(semesterConfig)
			.values({
				id: "singleton",
				name: input.name,
				startDate: input.startDate,
				endDate: input.endDate,
			})
			.onConflictDoUpdate({
				target: semesterConfig.id,
				set: {
					name: input.name,
					startDate: input.startDate,
					endDate: input.endDate,
				},
			});
	},
);
