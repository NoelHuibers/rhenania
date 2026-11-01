// service.ts — the drink catalogue, the menu and a member's recent drinks
// (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. Drink pictures live in Vercel Blob; a
// replaced or deleted drink's old picture is removed there too.

import "server-only";

import { del } from "@vercel/blob";
import { z } from "zod";
import { RECENT_DRINKS_LIMIT } from "~/lib/drink-order";
import { isForeignKeyViolation } from "~/server/lib/db-errors";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { Drink } from "./repo";

const INVALID_PICTURE_URL = "Ungültige Bild-Adresse";

export const addDrinkSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
	price: z
		.number()
		.positive("Preis muss positiv sein")
		.max(999.99, "Preis ist zu hoch"),
	volume: z
		.number()
		.positive("Volumen muss positiv sein")
		.max(999.99, "Volumen ist zu hoch")
		.optional(),
	kastengroesse: z
		.number()
		.int("Kastengröße muss eine ganze Zahl sein")
		.positive("Kastengröße muss positiv sein")
		.max(999, "Kastengröße ist zu hoch")
		.optional(),
	pictureUrl: z.string().url(INVALID_PICTURE_URL).optional(),
	isCurrentlyAvailable: z.boolean().default(true),
});

export const updateDrinkSchema = z.object({
	name: z
		.string()
		.min(1, "Name ist erforderlich")
		.max(255, "Name ist zu lang")
		.optional(),
	price: z
		.number()
		.positive("Preis muss positiv sein")
		.max(999.99, "Preis ist zu hoch")
		.optional(),
	volume: z
		.number()
		.positive("Volumen muss positiv sein")
		.max(999.99, "Volumen ist zu hoch")
		.optional(),
	kastengroesse: z
		.number()
		.int("Kastengröße muss eine ganze Zahl sein")
		.positive("Kastengröße muss positiv sein")
		.max(999, "Kastengröße ist zu hoch")
		.optional(),
	isCurrentlyAvailable: z.boolean().optional(),
	pictureUrl: z.string().url(INVALID_PICTURE_URL).optional(),
});

const DRINK_NOT_FOUND = "Getränk nicht gefunden";
const DRINK_IN_USE_ERROR =
	"Das Getränk wurde schon bestellt oder gezählt und kann deshalb nicht gelöscht werden. Setze es stattdessen auf „Nicht verfügbar“.";

// ─── The catalogue ───────────────────────────────────────────────────────────

/** Every drink, newest first (the Getränkewart page). */
export function listDrinks({ db }: TenantScope) {
	return repo.listDrinks(db);
}

export async function addDrink(
	{ db }: TenantScope,
	input: z.output<typeof addDrinkSchema>,
) {
	return repo.insertDrink(db, {
		name: input.name,
		price: input.price,
		volume: input.volume || null,
		kastengroesse: input.kastengroesse || null,
		picture: input.pictureUrl || null,
		isCurrentlyAvailable: input.isCurrentlyAvailable,
	});
}

/** Inline editing; replacing the picture drops the old blob. */
export async function updateDrink(
	tenant: TenantScope,
	drinkId: string,
	input: z.output<typeof updateDrinkSchema>,
) {
	if (Object.keys(input).length === 0) {
		throw new ValidationError("Keine Daten zum Aktualisieren angegeben");
	}
	const { db } = tenant;
	const { pictureUrl, ...fields } = input;

	// If there's a new picture URL and an old one exists, delete the old one
	if (pictureUrl) {
		const current = await repo.drinkById(db, drinkId);
		if (current?.picture && current.picture !== pictureUrl) {
			try {
				await del(current.picture);
			} catch (error) {
				console.error("Error deleting old image:", error);
			}
		}
	}

	const updated = await repo.updateDrink(db, drinkId, {
		...fields,
		...(pictureUrl !== undefined && { picture: pictureUrl }),
		updatedAt: tenant.now(),
	});
	if (!updated) {
		throw new NotFoundError(DRINK_NOT_FOUND);
	}
	return updated;
}

/**
 * Deletes the drink, then its picture. A drink that was ordered or counted
 * stays (the database refuses), and so does its picture.
 */
export async function deleteDrink({ db }: TenantScope, drinkId: string) {
	let deleted: { picture: string | null } | undefined;
	try {
		deleted = await repo.deleteDrink(db, drinkId);
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			throw new ConflictError(DRINK_IN_USE_ERROR, "DRINK_IN_USE");
		}
		throw error;
	}

	if (deleted?.picture) {
		try {
			await del(deleted.picture);
		} catch (error) {
			console.error("Error deleting image:", error);
		}
	}
}

export async function toggleAvailability(tenant: TenantScope, drinkId: string) {
	const current = await repo.drinkById(tenant.db, drinkId);
	if (!current) {
		throw new NotFoundError(DRINK_NOT_FOUND);
	}
	return repo.updateDrink(tenant.db, drinkId, {
		isCurrentlyAvailable: !current.isCurrentlyAvailable,
		updatedAt: tenant.now(),
	});
}

// ─── The menu ────────────────────────────────────────────────────────────────

/** The available drinks, most ordered first. */
export function availableDrinks({ db }: TenantScope) {
	return repo.availableDrinksByConsumption(db);
}

/** Every drink, also the unavailable ones, most ordered first. */
export function menuDrinks({ db }: TenantScope) {
	return repo.drinksByConsumption(db);
}

// ─── Recent drinks (#74) ─────────────────────────────────────────────────────

export const RECENT_DRINKS_DAYS = 30;

/**
 * The "Zuletzt bestellt" shortcuts on /trinken: ids of the drinks the member
 * ordered most in the last 30 days that can be ordered right now, most
 * ordered first.
 */
export async function recentDrinkIds(
	tenant: TenantScope,
	userId: string,
	options: { days?: number; limit?: number } = {},
): Promise<string[]> {
	const days = options.days ?? RECENT_DRINKS_DAYS;
	const since = new Date(tenant.now().getTime() - days * 24 * 60 * 60 * 1000);
	return repo.mostOrderedDrinkIds(
		tenant.db,
		userId,
		since,
		options.limit ?? RECENT_DRINKS_LIMIT,
	);
}
