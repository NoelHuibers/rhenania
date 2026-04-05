"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { venues } from "~/server/db/schema";

export type Venue = typeof venues.$inferSelect;

export async function getVenues(): Promise<Venue[]> {
	return db.select().from(venues).orderBy(asc(venues.shortName));
}

export async function createVenue(shortName: string, fullAddress: string) {
	try {
		await db.insert(venues).values({ shortName, fullAddress });
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch {
		return { success: false, error: "Kurzname bereits vergeben" };
	}
}

export async function updateVenue(
	id: string,
	shortName: string,
	fullAddress: string,
) {
	try {
		await db
			.update(venues)
			.set({ shortName, fullAddress })
			.where(eq(venues.id, id));
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch {
		return { success: false, error: "Kurzname bereits vergeben" };
	}
}

export async function deleteVenue(id: string) {
	try {
		await db.delete(venues).where(eq(venues.id, id));
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch {
		return { success: false, error: "Fehler beim Löschen" };
	}
}
