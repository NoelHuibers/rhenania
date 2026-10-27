"use server";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/server/db";
import { venues } from "~/server/db/schema";
import { ROLES, requireMember } from "~/server/lib/authz";
import { isUniqueViolation } from "~/server/lib/db-errors";
import { ActionError, defineAction } from "~/server/lib/define-action";

export type Venue = typeof venues.$inferSelect;

const SHORT_NAME_TAKEN = "Kurzname bereits vergeben";

export async function getVenues(): Promise<Venue[]> {
	await requireMember();
	return db.select().from(venues).orderBy(asc(venues.shortName));
}

/** Runs `write`; a duplicate short name is the user's mistake, not a crash. */
async function saveVenue(write: () => Promise<unknown>) {
	try {
		await write();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new ActionError(SHORT_NAME_TAKEN, "SHORT_NAME_TAKEN");
		}
		throw error;
	}
}

export const createVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), z.string()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([shortName, fullAddress]) => {
		await saveVenue(() => db.insert(venues).values({ shortName, fullAddress }));
	},
);

export const updateVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), z.string(), z.string()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, shortName, fullAddress]) => {
		await saveVenue(() =>
			db
				.update(venues)
				.set({ shortName, fullAddress })
				.where(eq(venues.id, id)),
		);
	},
);

export const deleteVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Fehler beim Löschen",
	},
	async ([id]) => {
		await db.delete(venues).where(eq(venues.id, id));
	},
);
