"use server";

// actions.ts — the Semesterbeitrag's server actions (CC-Kasse) (#33): check
// the caller and the input, then one call to the Semesterbeitrag service.
// The reads for the page answer a caller without the right with nothing,
// as before; changes are defineActions answering with an ActionResult.

import { z } from "zod";
import { AuthzError, ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as beitrag from "./service";

export type {
	BeitragRun,
	ChargeListItem,
	ChargesForRun,
} from "./service";

/**
 * The caller's scope if they run the Semesterbeitrag, or null: the page
 * reads answer a denied caller with nothing.
 */
async function requireRoles(roles: readonly string[]) {
	try {
		const { tenantId } = await requireCaller(roles);
		return await scopeOf(tenantId);
	} catch (error) {
		if (error instanceof AuthzError) {
			return null;
		}
		throw error;
	}
}

const run = { roles: ROLES.ccKasse, revalidate: ["/cc-kasse"] } as const;

// ─── Runs ────────────────────────────────────────────────────────────────────

/** Every run, newest first. */
export async function listBeitragRuns() {
	const tenant = await requireRoles(ROLES.ccKasse);
	return tenant ? beitrag.listRuns(tenant) : [];
}

export const createBeitragRun = defineAction(
	{
		...run,
		schema: z.tuple([beitrag.createRunSchema]),
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => beitrag.createRun(tenant, user, input),
);

/** Charges members who became beitragspflichtig after the run started. */
export const regenerateCharges = defineAction(
	{ ...run, schema: z.tuple([z.string()]) },
	async ([runId], { tenant }) => beitrag.regenerateCharges(tenant, runId),
);

/** Deletes a run created by mistake, unless a Beitrag is paid. */
export const deleteBeitragRun = defineAction(
	{
		...run,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([runId], { tenant }) => beitrag.deleteRun(tenant, runId),
);

// ─── Charges ─────────────────────────────────────────────────────────────────

/** The run with its charges; null for an unknown run. */
export async function listChargesForRun(runId: string) {
	const tenant = await requireRoles(ROLES.ccKasse);
	return tenant ? beitrag.chargesForRun(tenant, runId) : null;
}

export const markChargePaid = defineAction(
	{ ...run, schema: z.tuple([z.string()]) },
	async ([chargeId], { tenant, user }) =>
		beitrag.markPaid(tenant, user, chargeId),
);

export const markChargeDeferred = defineAction(
	{ ...run, schema: z.tuple([z.string()]) },
	async ([chargeId], { tenant }) => beitrag.markDeferred(tenant, chargeId),
);

export const markChargeUnpaid = defineAction(
	{ ...run, schema: z.tuple([z.string()]) },
	async ([chargeId], { tenant }) => beitrag.markUnpaid(tenant, chargeId),
);

// ─── Invoices and reminders ──────────────────────────────────────────────────

export const sendBeitragEmails = defineAction(
	{
		...run,
		schema: z.tuple([
			z.string(),
			z.object({ onlyUnsent: z.boolean().optional() }).optional(),
		]),
	},
	async ([runId, opts], { tenant }) =>
		beitrag.sendInvoices(tenant, runId, opts?.onlyUnsent ?? true),
);

export const sendMahnungen = defineAction(
	{ ...run, schema: z.tuple([z.string()]) },
	async ([runId], { tenant }) => beitrag.sendReminders(tenant, runId),
);

export const downloadChargePdf = defineAction(
	{
		roles: ROLES.ccKasse,
		schema: z.tuple([
			z.string(),
			z.object({ isMahnung: z.boolean().optional() }).optional(),
		]),
		errorMessage: "PDF konnte nicht erstellt werden",
	},
	async ([chargeId, opts], { tenant }) => {
		const pdf = await beitrag.chargePdf(tenant, chargeId, {
			isMahnung: opts?.isMahnung ?? false,
		});
		return {
			base64: pdf.pdfContent.toString("base64"),
			fileName: pdf.fileName,
		};
	},
);
