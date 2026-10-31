"use server";

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import { runGetraenkeBilling } from "~/server/modules/billing/run";
import * as billing from "~/server/modules/billing/service";

/**
 * The Kasse's "Neue Rechnung": bills every unbilled order and carries open
 * bills over. It charges no Umlage. Server actions can be called with any
 * arguments, so this one takes none: the inventory-loss Umlage is only
 * billed by "Inventur + Rechnung", from the loss stored on the server (#10).
 */
export const createNewBilling = defineAction(
	{ roles: ROLES.getraenke },
	async ({ tenant, user }) =>
		runGetraenkeBilling(tenant, user, { inventoryLoss: 0 }),
);

// Get all bill periods (for displaying tabs)
export async function getAllBillPeriods() {
	const { tenantId } = await requireCaller();
	return billing.listBillPeriods(await scopeOf(tenantId));
}

// Get bills for a specific period
export async function getBillsForPeriod(billPeriodId: string) {
	const { tenantId } = await requireCaller();
	return billing.billsForPeriod(await scopeOf(tenantId), billPeriodId);
}

/**
 * Sets a bill's status from the Kasse. "Übertragen" is set by billing runs
 * only. Carried bills and bills paid through the later bill they were
 * carried into change only through that later bill (see carried-bills).
 */
export const updateBillStatus = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z.string(),
			z.enum(["Bezahlt", "Unbezahlt", "Gestundet", "Übertragen"]),
		]),
		errorMessage: "Fehler beim Aktualisieren des Status",
	},
	async ([billId, newStatus], { tenant }) =>
		billing.setBillStatus(tenant, billId, newStatus),
);
