"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { semesterConfig } from "~/server/db/schema";

export type SemesterConfig = typeof semesterConfig.$inferSelect;

export async function getSemesterConfig(): Promise<SemesterConfig | null> {
	const [row] = await db
		.select()
		.from(semesterConfig)
		.where(eq(semesterConfig.id, "singleton"))
		.limit(1);
	return row ?? null;
}

export async function upsertSemesterConfig(input: {
	name: string;
	startDate: Date;
	endDate: Date;
}): Promise<{ success: true } | { success: false; error: string }> {
	try {
		await db
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

		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch {
		return { success: false, error: "Fehler beim Speichern" };
	}
}
