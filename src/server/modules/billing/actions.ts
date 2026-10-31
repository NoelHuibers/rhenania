"use server";

// actions.ts — the Getränke bills' server actions (#33): check the caller
// and the input, then one call to the billing service.

import { z } from "zod";
import { auth } from "~/server/auth";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { log } from "~/server/lib/log";
import { scopeOf } from "~/server/lib/tenant-scope";
import { runGetraenkeBilling } from "./run";
import * as billing from "./service";

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

/** Every bill period, newest first (the tabs of /rechnungen). */
export async function getAllBillPeriods() {
	const { tenantId } = await requireCaller();
	return billing.listBillPeriods(await scopeOf(tenantId));
}

/** A period's bills with their items. */
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

/** The period's CSV in Blob storage (stored once, then reused). */
export const saveBillPeriodCSV = defineAction(
	{
		schema: z.tuple([
			z.string(),
			z
				.object({
					paypalBaseUrl: z.string().optional(),
					delimiter: z.string().optional(),
				})
				.optional(),
		]),
		errorMessage: "Fehler beim Erstellen der CSV",
	},
	async ([billPeriodId, options], { tenant }) =>
		billing.savePeriodCsv(tenant, billPeriodId, options),
);

/** The caller's latest bill for the profile. */
export async function getUserBillingData(): Promise<billing.UserBillingData> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}
	return billing.userBillingData(
		await scopeOf(session.tenantId),
		session.user.id,
	);
}

/** The caller's own bill as PDF in Blob storage, for the download link. */
export async function downloadUserBillPDF(billId: string): Promise<{
	success: boolean;
	downloadUrl?: string;
	fileName?: string;
	error?: string;
}> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			throw new Error("User must be authenticated to download billing data");
		}
		const { downloadUrl, fileName } = await billing.saveUserBillPdf(
			await scopeOf(session.tenantId),
			session.user,
			billId,
		);
		return { success: true, downloadUrl, fileName };
	} catch (error) {
		await log.error("Error downloading PDF", { err: error });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to download PDF",
		};
	}
}
