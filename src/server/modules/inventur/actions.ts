"use server";

// actions.ts — every Inventur action of the Getränkewart page (#33). Check
// the caller and the input, then the inventur service. The changes answer
// with an ActionResult; the page reads keep their old answers.
// "Inventur + Rechnung" also runs the Getränke billing for the caller's
// Corps (lib/billing-run.ts).

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { DomainError } from "~/server/lib/domain-error";
import { hasFeature } from "~/server/lib/features";
import {
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
} from "~/server/lib/getraenkekasse-payment";
import { log } from "~/server/lib/log";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as inventur from "./service";

export type { InventoryCountItem } from "./service";

/**
 * Markup profit since the running inventory started (all time if there is
 * none yet). Returns null for tenants without the markup feature.
 */
export async function getInventoryProfit(): Promise<number | null> {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	if (!(await hasFeature("drinks.markup"))) {
		return null;
	}
	return inventur.runningProfit(await scopeOf(tenantId));
}

/**
 * Each available drink's latest count (running or closed inventory) and what
 * was sold since. Two queries in one round trip, however many drinks.
 */
export async function getStockData(): Promise<
	inventur.StockStatusWithDetails[]
> {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return inventur.stock(await scopeOf(tenantId));
}

/**
 * The last ten closed inventories with their items and, with the markup
 * feature, each period's profit. Constant round trips, however many.
 */
export async function getInventoryHistory(): Promise<
	inventur.InventoryWithItems[]
> {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	const markupEnabled = await hasFeature("drinks.markup");
	return inventur.history(await scopeOf(tenantId), markupEnabled);
}

const COUNT_FAILED = "Inventur konnte nicht gespeichert werden";

export const saveInventoryCount = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			inventur.countItemsSchema,
			z.object({ startEvent: inventur.eventInfoSchema.optional() }).optional(),
		]),
		errorMessage: COUNT_FAILED,
	},
	async ([items, opts], { tenant, user }) => {
		const { totalInventoryLoss } = await inventur.countInventory(
			tenant,
			items,
			user.id,
			opts,
		);
		return { totalInventoryLoss };
	},
);

/**
 * "Inventur + Rechnung": closes the running inventory and then starts a
 * billing run. The Umlage is the loss of the inventory just closed, read from
 * the database — never a value sent by the browser. Billing only runs when
 * the inventory was saved. A billing failure after that is reported with the
 * code "BILLING_FAILED": the inventory is saved, only the bills are missing.
 */
export const closeInventoryAndBill = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([inventur.countItemsSchema]),
		errorMessage: COUNT_FAILED,
	},
	async ([items], { tenant, user }) => {
		// Billing would refuse without the tenant's sender and account; check
		// first so the inventory is not closed with its loss left unbilled.
		const sender = await resolveGetraenkeBillSender();
		if (!sender.ok) {
			throw new ActionError(
				incompleteBillingMessage(sender.missing),
				"BILLING_INCOMPLETE",
			);
		}

		const counted = await inventur.countInventory(tenant, items, user.id);
		const totalInventoryLoss = await inventur.closedLoss(
			tenant,
			counted.closedInventoryId,
		);

		// A refused run's message is meant for the user; it logs its own
		// failures. Anything else is logged here and reported generically.
		let billingError: string | null = null;
		let billsCreated = 0;
		let message = "";
		try {
			const billing = await runGetraenkeBilling({
				inventoryLoss: totalInventoryLoss,
			});
			billsCreated = billing.billsCreated + billing.eventBillsCreated;
			message = billing.message;
		} catch (error) {
			if (error instanceof DomainError) {
				billingError = error.message;
			} else {
				await log.error("billing after inventory failed", { err: error });
				billingError = "Fehler beim Erstellen der Rechnungen";
			}
		}

		if (billingError !== null) {
			const unbilledLoss =
				totalInventoryLoss > 0
					? ` Der Inventurverlust von €${totalInventoryLoss.toFixed(2)} wurde nicht abgerechnet.`
					: "";
			throw new ActionError(
				`Inventur gespeichert, aber die Rechnung ist fehlgeschlagen: ${billingError}.${unbilledLoss}`,
				"BILLING_FAILED",
			);
		}

		return { totalInventoryLoss, billsCreated, message };
	},
);

export const saveQuickAdjustments = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([inventur.quickAdjustmentsSchema]),
		errorMessage: "Änderungen konnten nicht gespeichert werden",
	},
	async ([adjustments], { tenant, user }) =>
		inventur.saveQuickAdjustments(tenant, adjustments, user.id),
);

// ─── Veranstaltungs-Inventur (before/after an event) ─────────────────────────

export async function getActiveEventInventory() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return inventur.activeEventInventory(await scopeOf(tenantId));
}

export type ActiveEventInventory = Awaited<
	ReturnType<typeof getActiveEventInventory>
>;

export async function listInventurEvents() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return inventur.recentEvents(await scopeOf(tenantId));
}

export type InventurEvent = Awaited<
	ReturnType<typeof listInventurEvents>
>[number];

export async function listEtaplansWithKostenpunkte() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return inventur.etaplansWithKostenpunkte(await scopeOf(tenantId));
}

export type EtaplanWithKostenpunkte = Awaited<
	ReturnType<typeof listEtaplansWithKostenpunkte>
>[number];

export const cancelEventInventory = defineAction(
	{ roles: ROLES.getraenke, revalidate: ["/getraenkewart"] },
	async ({ tenant }) => inventur.cancelEventInventory(tenant),
);

export const finishEventInventory = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			inventur.countItemsSchema,
			z.object({ kostenpunktId: z.string().nullish() }).optional(),
		]),
		revalidate: ["/getraenkewart", "/cc-kasse"],
		errorMessage: "Veranstaltungs-Inventur fehlgeschlagen",
	},
	async ([items, opts = {}], { tenant, user }) =>
		inventur.finishEventInventory(tenant, user, items, opts),
);
