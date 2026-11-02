"use server";

// actions.ts — the drink catalogue (Getränkewart) and the menu (#33). Check
// the caller and the input, then one call to the drinks service. The
// changes answer with an ActionResult; the reads keep their old answers:
// the Getränkewart's list logs a failed read and answers it with [], the
// menu's reads throw (#216).

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import { drinkPricing } from "~/server/modules/getraenkekasse/service";
import * as drinks from "./service";

export type { Drink } from "./service";

export type MenuItem = drinks.Drink;

const GETRAENKEWART_PAGE = ["/getraenkewart"];

// ─── The catalogue ───────────────────────────────────────────────────────────

export const addDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([drinks.addDrinkSchema]),
		revalidate: GETRAENKEWART_PAGE,
		errorMessage: "Fehler beim Hinzufügen des Getränks",
	},
	async ([input], { tenant }) => drinks.addDrink(tenant, input),
);

/** Inline editing on the Getränkewart page; replacing the picture drops the old blob. */
export const updateDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string(), drinks.updateDrinkSchema]),
		revalidate: GETRAENKEWART_PAGE,
		errorMessage: "Fehler beim Aktualisieren des Getränks",
	},
	async ([drinkId, input], { tenant }) =>
		drinks.updateDrink(tenant, drinkId, input),
);

export const deleteDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		revalidate: GETRAENKEWART_PAGE,
		errorMessage: "Fehler beim Löschen des Getränks",
	},
	async ([drinkId], { tenant }) => drinks.deleteDrink(tenant, drinkId),
);

export const toggleDrinkAvailability = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		revalidate: GETRAENKEWART_PAGE,
		errorMessage: "Fehler beim Ändern der Verfügbarkeit",
	},
	async ([drinkId], { tenant }) => drinks.toggleAvailability(tenant, drinkId),
);

export async function getDrinks() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	try {
		return await drinks.listDrinks(await scopeOf(tenantId));
	} catch (error) {
		console.error("Error fetching drinks:", error);
		return [];
	}
}

// ─── The menu ────────────────────────────────────────────────────────────────

/**
 * Markup the menu has to add to personal orders so it shows the price the
 * member is actually charged. 0 for tenants without the markup feature.
 */
export async function getDrinkMarkupPercent(): Promise<number> {
	const { tenantId } = await requireCaller();
	return (await drinkPricing(await scopeOf(tenantId))).markupPercent;
}

// A failed read throws: the callers show an error instead of an empty
// menu that looks like "no drinks" (#216).

/** The available drinks, most ordered first (the challenge and booking forms). */
export async function getAvailableDrinks() {
	const { tenantId } = await requireCaller();
	return drinks.availableDrinks(await scopeOf(tenantId));
}

/** Every drink, also the unavailable ones, most ordered first (/trinken). */
export async function getAllDrinksForMenu() {
	const { tenantId } = await requireCaller();
	return drinks.menuDrinks(await scopeOf(tenantId));
}
