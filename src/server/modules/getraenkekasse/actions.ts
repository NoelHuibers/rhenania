"use server";

// actions.ts — the Getränkewart's Kasse (#33): check the caller and the
// input, then one call to the Getränkekasse (or billing) service. The
// settings behind `drinks.markup` and `billing.treasurerRecipient` check the
// role AND the feature on the server; hiding a card is not the gate.

import { z } from "zod";
import { isValidMarkupPercent, MAX_MARKUP_PERCENT } from "~/lib/pricing";
import { AuthzError, ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import { billPdf } from "~/server/modules/billing/service";
import * as kasse from "./service";

/** The Getränkewart's scope; throws AuthzError for everybody else. */
async function requireGetraenkewart() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return scopeOf(tenantId);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export async function getKasseSummary() {
	return kasse.kasseSummary(await requireGetraenkewart());
}

// ─── Bank entries ────────────────────────────────────────────────────────────

export async function getBankEntries() {
	return kasse.bankEntries(await requireGetraenkewart());
}

const INVALID_BANK_ENTRY = "Ungültiger Betrag oder Datum";

export const addBankEntry = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z.object({
				amount: z.number({ error: INVALID_BANK_ENTRY }),
				description: z.string(),
				date: z.date({ error: INVALID_BANK_ENTRY }),
			}),
		]),
		errorMessage: "Fehler beim Hinzufügen",
	},
	async ([data], { tenant, user }) => kasse.addBankEntry(tenant, data, user.id),
);

export const deleteBankEntry = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([id], { tenant }) => kasse.deleteBankEntry(tenant, id),
);

// ─── External bills ──────────────────────────────────────────────────────────

export async function getExternalBills() {
	return kasse.externalBills(await requireGetraenkewart());
}

export const addExternalBill = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z.object({
				creditor: z.string(),
				description: z.string(),
				amount: z
					.number({ error: "Ungültiger Betrag" })
					.positive("Ungültiger Betrag"),
			}),
		]),
		errorMessage: "Fehler beim Hinzufügen",
	},
	async ([data], { tenant, user }) =>
		kasse.addExternalBill(tenant, data, user.id),
);

export const markExternalBillPaid = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Status konnte nicht geändert werden",
	},
	async ([id], { tenant }) => kasse.markExternalBillPaid(tenant, id),
);

export const deleteExternalBill = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([id], { tenant }) => kasse.deleteExternalBill(tenant, id),
);

// ─── Pfand ───────────────────────────────────────────────────────────────────

export async function getPfandWert() {
	return kasse.pfandWert(await requireGetraenkewart());
}

export const setPfandWert = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z
				.number({ error: "Ungültiger Pfandwert" })
				.min(0, "Ungültiger Pfandwert"),
		]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([value], { tenant, user }) =>
		kasse.setPfandWert(tenant, value, user.id),
);

// ─── Open bills ──────────────────────────────────────────────────────────────

export async function getOpenEntityBills() {
	return kasse.openEntityBills(await requireGetraenkewart());
}

export async function getOpenMemberBills() {
	return kasse.openMemberBills(await requireGetraenkewart());
}

/** A group bill as PDF, for the Getränkewart to hand on. */
export const downloadEntityBillPDF = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "PDF-Generierung fehlgeschlagen",
	},
	async ([billId], { tenant }) => {
		const { pdf, fileName } = await billPdf(tenant, billId);
		return { base64: pdf.toString("base64"), fileName };
	},
);

/** "Alle haben gezahlt" (feature `billing.markAllPaid`). */
export const markAllMemberBillsPaid = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "billing.markAllPaid",
		errorMessage:
			"Fehler beim Markieren als bezahlt. Es wurde nichts geändert.",
	},
	async ({ tenant }) => kasse.markAllMemberBillsPaid(tenant),
);

// ─── Feature settings (markup, bill recipient) ───────────────────────────────

export type { GetraenkeSettings } from "./service";

/** Current values, or null when the tenant has neither feature. */
export async function getGetraenkeSettings() {
	return kasse.getraenkeSettings(await requireGetraenkewart());
}

const INVALID_MARKUP = `Der Aufschlag muss zwischen 0 und ${MAX_MARKUP_PERCENT} % liegen.`;

export const setMarkupPercent = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "drinks.markup",
		schema: z.tuple([
			z
				.number({ error: INVALID_MARKUP })
				.refine(isValidMarkupPercent, INVALID_MARKUP),
		]),
	},
	async ([value], { tenant, user }) =>
		kasse.setMarkupPercent(tenant, value, user.id),
);

export const setBillRecipient = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "billing.treasurerRecipient",
		schema: z.tuple([
			z.enum(["members", "treasurer"], { error: "Ungültiger Empfänger" }),
			z.string(),
		]),
	},
	async ([mode, treasurerEmail], { tenant, user }) =>
		kasse.setBillRecipient(tenant, mode, treasurerEmail, user.id),
);

// ─── Absender und Konto der Getränkerechnungen ──────────────────────────────
//
// The letterhead and account holder of the bill PDF. Billing refuses to run
// until they and an active Getränkekasse konto are set up.

const billingProfileSchema = z.object({
	senderName: z.string().trim().max(255),
	senderStreet: z.string().trim().max(255),
	senderCity: z.string().trim().max(255),
	location: z.string().trim().max(255),
	website: z.string().trim().max(255),
	accountHolder: z.string().trim().max(255),
	paymentDueDays: z
		.number()
		.int()
		.min(1, "Zahlungsziel: 1 bis 90 Tage")
		.max(90, "Zahlungsziel: 1 bis 90 Tage"),
});

export type {
	GetraenkeBillingProfileInput,
	GetraenkeBillingSettings,
} from "./service";

/** For the Getränkewart only; null for everybody else. */
export async function getGetraenkeBillingSettings() {
	let scope: Awaited<ReturnType<typeof requireGetraenkewart>>;
	try {
		scope = await requireGetraenkewart();
	} catch (error) {
		// The card is simply not shown to other members.
		if (error instanceof AuthzError) {
			return null;
		}
		throw error;
	}
	return kasse.billingSettings(scope);
}

export const updateGetraenkeBillingProfile = defineAction(
	{ roles: ROLES.getraenke, schema: z.tuple([billingProfileSchema]) },
	async ([profile], { tenant, user }) =>
		kasse.saveBillingProfile(tenant, profile, user.id),
);
