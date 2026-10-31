"use server";

// actions.ts — the Fuchsenladen's server actions (#33): check the caller
// and the input, then one call to the Fuchsenladen service. Reads for the
// pages are plain guarded functions that throw; changes are defineActions
// answering with an ActionResult.

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import { runFuchsenBilling } from "./run";
import * as fuchsen from "./service";

export type {
	FuchsenBillingConfig,
	FuchsenBillingConfigInput,
	FuchsenBillingEntry,
	FuchsenBillPeriod,
} from "./service";

/** The caller's scope if they may run the Fuchsenladen; throws otherwise. */
async function requireFuchsenwart() {
	const { tenantId } = await requireCaller(ROLES.fuchsen);
	return scopeOf(tenantId);
}

// ─── Bills ───────────────────────────────────────────────────────────────────

/**
 * Runs a new Fuchsen billing period: every open order onto one bill per
 * member, earlier debts and credits carried over (see ./run).
 */
export const createNewFuchsenBilling = defineAction(
	{
		roles: ROLES.fuchsen,
		errorMessage: "Fehler beim Erstellen der Rechnungen",
	},
	async ({ tenant, user }) => runFuchsenBilling(tenant, user),
);

/** Every bill period, newest first. */
export async function getAllFuchsenBillPeriods() {
	return fuchsen.listBillPeriods(await requireFuchsenwart());
}

/** A period's bills with their items. */
export async function getFuchsenBillsForPeriod(billPeriodId: string) {
	return fuchsen.billsForPeriod(await requireFuchsenwart(), billPeriodId);
}

/** The next run's bills, per member (the "Aktuelle Bestellungen" tab). */
export async function getUnbilledFuchsenOrdersGrouped() {
	return fuchsen.unbilledByMember(await requireFuchsenwart());
}

export const updateFuchsenBillStatus = defineAction(
	{
		roles: ROLES.fuchsen,
		schema: z.tuple([
			z.string(),
			z.enum(["Bezahlt", "Unbezahlt", "Gestundet"]),
		]),
		errorMessage: "Fehler beim Aktualisieren des Status",
	},
	async ([billId, newStatus], { tenant }) =>
		fuchsen.setBillStatus(tenant, billId, newStatus),
);

/** The caller's own bills (newest first), with line items. */
export async function getMyFuchsenBills() {
	const { member, tenantId } = await requireCaller();
	return fuchsen.memberBills(await scopeOf(tenantId), member.id);
}

/** On-demand CSV (semicolon-delimited) for a whole period; no blob storage. */
export const getFuchsenBillPeriodCSV = defineAction(
	{
		roles: ROLES.fuchsen,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Erstellen der CSV",
	},
	async ([billPeriodId], { tenant }) => fuchsen.periodCsv(tenant, billPeriodId),
);

/**
 * A bill as PDF (base64), so the client can download it without blob
 * storage. Members get their own bills; the Fuchsenwart and Admins any.
 */
export const generateFuchsenBillPDF = defineAction(
	{
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Erstellen der PDF",
	},
	async ([billId], { tenant, user }) => fuchsen.billPdf(tenant, user, billId),
);

// ─── Payment details ─────────────────────────────────────────────────────────

/** Readable by every member (they need the payment details). */
export async function getFuchsenBillingConfig() {
	const { tenantId } = await requireCaller();
	return fuchsen.billingConfig(await scopeOf(tenantId));
}

export const updateFuchsenBillingConfig = defineAction(
	{
		roles: ROLES.fuchsen,
		schema: z.tuple([fuchsen.billingConfigSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant, user }) =>
		fuchsen.saveBillingConfig(tenant, input, user.id),
);
