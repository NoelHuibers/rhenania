"use server";

// actions.ts — the CC-Kasse's server actions (#33): check the caller and
// the input, then one call to the CC-Kasse service. Changes are
// defineActions answering with an ActionResult. The reads for the pages
// keep their old answers: a caller without the right gets nothing, and the
// plan reads log a failed query and answer it with nothing too (#216).

import { z } from "zod";
import { AuthzError, ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as excel from "./excel";
import * as cc from "./service";

export type {
	BudgetStatus,
	EtaplanOverview,
	KostenpunktOverview,
} from "~/server/domain/cc-kasse/overview";
export type {
	EinnahmeRow,
	Etaplan,
	KostenpunktWithPositions,
	LinkableEvent,
	MyPaymentInfo,
	MyReimbursement,
	QueueReimbursement,
} from "./service";

/**
 * The caller and their tenant if they hold one of `roles` (any member when
 * omitted), or null: these reads answer a denied caller with nothing.
 */
async function requireRoles(roles?: readonly string[]) {
	try {
		return await requireCaller(roles);
	} catch (error) {
		if (error instanceof AuthzError) {
			return null;
		}
		throw error;
	}
}

/** Runs a page read; a failed query is logged and answered with `fallback`. */
async function orElse<T>(
	what: string,
	fallback: T,
	read: () => Promise<T>,
): Promise<T> {
	try {
		return await read();
	} catch (error) {
		console.error(`Error ${what}:`, error);
		return fallback;
	}
}

const plan = { roles: ROLES.etatplan, revalidate: ["/cc-kasse"] } as const;
const kasse = { roles: ROLES.ccKasse, revalidate: ["/cc-kasse"] } as const;

// ─── Etatpläne ───────────────────────────────────────────────────────────────

/**
 * Creates a plan. A second plan for the same semester is allowed, but the
 * answer carries a warning about it.
 */
export const createEtaplan = defineAction(
	{
		...plan,
		schema: z.tuple([cc.etaplanSchema]),
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => cc.createEtaplan(tenant, user, input),
);

export const updateEtaplan = defineAction(
	{
		...plan,
		schema: z.tuple([z.string(), cc.etaplanSchema.partial()]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([etaplanId, patch], { tenant }) =>
		cc.updateEtaplan(tenant, etaplanId, patch),
);

export async function listEtaplans(): Promise<cc.Etaplan[]> {
	const { tenantId } = await requireCaller();
	return orElse("listing etaplans", [], async () =>
		cc.listEtaplans(await scopeOf(tenantId)),
	);
}

export async function getEtaplanById(
	etaplanId: string,
): Promise<cc.Etaplan | null> {
	const { tenantId } = await requireCaller();
	return orElse("fetching etaplan", null, async () =>
		cc.etaplan(await scopeOf(tenantId), etaplanId),
	);
}

export async function getActiveEtaplan(): Promise<cc.Etaplan | null> {
	const { tenantId } = await requireCaller();
	return orElse("fetching active etaplan", null, async () =>
		cc.activeEtaplan(await scopeOf(tenantId)),
	);
}

/** The plan's budget overview, for the Etatplan editors. */
export async function getEtaplanOverview(etaplanId: string) {
	const caller = await requireRoles(ROLES.etatplan);
	if (!caller) {
		return null;
	}
	return orElse("building etaplan overview", null, async () =>
		cc.overview(await scopeOf(caller.tenantId), etaplanId),
	);
}

// ─── Kostenpunkte ────────────────────────────────────────────────────────────

export const createKostenpunkt = defineAction(
	{
		...plan,
		schema: z.tuple([cc.createKostenpunktSchema]),
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant }) => cc.createKostenpunkt(tenant, input),
);

export const updateKostenpunkt = defineAction(
	{
		...plan,
		schema: z.tuple([z.string(), cc.updateKostenpunktSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([kostenpunktId, input], { tenant }) =>
		cc.updateKostenpunkt(tenant, kostenpunktId, input),
);

/** Deletes a Kostenpunkt nothing is booked on yet. */
export const deleteKostenpunkt = defineAction(
	{
		...plan,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([kostenpunktId], { tenant }) =>
		cc.deleteKostenpunkt(tenant, kostenpunktId),
);

export async function listKostenpunkteForEtaplan(etaplanId: string) {
	const { tenantId } = await requireCaller();
	return orElse("listing kostenpunkte", [], async () =>
		cc.kostenpunkte(await scopeOf(tenantId), etaplanId),
	);
}

export async function linkableEvents(): Promise<cc.LinkableEvent[]> {
	const { tenantId } = await requireCaller();
	return orElse("listing linkable events", [], async () =>
		cc.linkableEvents(await scopeOf(tenantId)),
	);
}

/** Kostenpunkte from all active plans — what a member can book against. */
export async function getBookableKostenpunkte(): Promise<
	cc.BookableKostenpunkt[]
> {
	const { tenantId } = await requireCaller();
	return orElse("listing bookable kostenpunkte", [], async () =>
		cc.bookableKostenpunkte(await scopeOf(tenantId)),
	);
}

// ─── Einnahmen ───────────────────────────────────────────────────────────────

export const createEinnahme = defineAction(
	{
		...kasse,
		schema: z.tuple([cc.einnahmeSchema]),
		errorMessage: "Fehler beim Buchen",
	},
	async ([input], { tenant, user }) => cc.createEinnahme(tenant, user, input),
);

export const updateEinnahme = defineAction(
	{
		...kasse,
		schema: z.tuple([z.string(), cc.einnahmeSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([einnahmeId, input], { tenant }) =>
		cc.updateEinnahme(tenant, einnahmeId, input),
);

export const deleteEinnahme = defineAction(
	{
		...kasse,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([einnahmeId], { tenant }) => cc.deleteEinnahme(tenant, einnahmeId),
);

/** A plan's Einnahmen; readable by every Etatplan editor. */
export async function listEinnahmen(etaplanId: string) {
	const caller = await requireRoles(ROLES.etatplan);
	return caller ? cc.einnahmen(await scopeOf(caller.tenantId), etaplanId) : [];
}

// ─── Kostenerstattungen: members ─────────────────────────────────────────────

/** A member asks for an expense to be reimbursed. */
export const submitReimbursement = defineAction(
	{
		schema: z.tuple([cc.submitSchema]),
		revalidate: ["/kostenerstattung", "/cc-kasse"],
		errorMessage: "Fehler beim Einreichen",
	},
	async ([input], { tenant, user }) => cc.submitErstattung(tenant, user, input),
);

/** The caller's own requests, newest first. */
export async function listMyReimbursements() {
	const caller = await requireRoles();
	return caller
		? cc.myErstattungen(await scopeOf(caller.tenantId), caller.member.id)
		: [];
}

export const cancelMyReimbursement = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: ["/kostenerstattung"],
		errorMessage: "Fehler beim Stornieren",
	},
	async ([reimbursementId], { tenant, user }) =>
		cc.cancelMyErstattung(tenant, user, reimbursementId),
);

/** A member edits their own request — only while still "Eingereicht". */
export const updateMyReimbursement = defineAction(
	{
		schema: z.tuple([z.string(), cc.submitSchema]),
		revalidate: ["/kostenerstattung", "/cc-kasse"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([reimbursementId, input], { tenant, user }) =>
		cc.updateMyErstattung(tenant, user, reimbursementId, input),
);

// ─── Kostenerstattungen: treasury ────────────────────────────────────────────

const treasury = {
	roles: ROLES.ccKasse,
	revalidate: ["/cc-kasse", "/kostenerstattung"],
} as const;

export const approveReimbursement = defineAction(
	{
		...treasury,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Genehmigen",
	},
	async ([reimbursementId], { tenant, user }) =>
		cc.approveErstattung(tenant, user, reimbursementId),
);

export const rejectReimbursement = defineAction(
	{
		...treasury,
		schema: z.tuple([z.string(), z.string().nullish()]),
		errorMessage: "Fehler beim Ablehnen",
	},
	async ([reimbursementId, reason], { tenant, user }) =>
		cc.rejectErstattung(tenant, user, reimbursementId, reason),
);

export const markReimbursementPaid = defineAction(
	{
		...treasury,
		schema: z.tuple([
			z.string(),
			z.object({ paidAt: z.date().optional() }).optional(),
		]),
		errorMessage: "Fehler beim Auszahlen",
	},
	async ([reimbursementId, opts], { tenant, user }) =>
		cc.payErstattung(tenant, user, reimbursementId, opts?.paidAt),
);

/** Books an expense already paid, e.g. in cash. */
export const createDirectBooking = defineAction(
	{
		...kasse,
		schema: z.tuple([cc.directBookingSchema]),
		errorMessage: "Fehler beim Buchen",
	},
	async ([input], { tenant, user }) =>
		cc.createDirectBooking(tenant, user, input),
);

export const updateReimbursement = defineAction(
	{
		...treasury,
		schema: z.tuple([z.string(), cc.erstattungPatchSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([reimbursementId, input], { tenant }) =>
		cc.updateErstattung(tenant, reimbursementId, input),
);

/**
 * Every request (of a plan, in a status). Readable by every Etatplan
 * editor (Senior incl.); the treasury actions are gated separately.
 */
export async function listReimbursementQueue(filter?: {
	etaplanId?: string;
	status?: cc.ErstattungStatus;
}) {
	const caller = await requireRoles(ROLES.etatplan);
	return caller
		? cc.erstattungQueue(await scopeOf(caller.tenantId), filter)
		: [];
}

// ─── Payment details ─────────────────────────────────────────────────────────

/** The account the caller's reimbursements are paid to, or null. */
export async function getMyPaymentInfo(): Promise<cc.MyPaymentInfo | null> {
	const caller = await requireRoles();
	return caller
		? cc.paymentInfo(await scopeOf(caller.tenantId), caller.member.id)
		: null;
}

export const setMyPaymentInfo = defineAction(
	{
		schema: z.tuple([cc.paymentInfoSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant, user }) => cc.savePaymentInfo(tenant, user, input),
);

// ─── Etatplan Excel ──────────────────────────────────────────────────────────

/** The plan as an .xlsx workbook, base64-encoded for the download. */
export const exportEtaplanXlsx = defineAction(
	{
		roles: ROLES.etatplan,
		schema: z.tuple([z.string()]),
		errorMessage: "Export fehlgeschlagen",
	},
	async ([etaplanId], { tenant }) => excel.exportXlsx(tenant, etaplanId),
);

/** Reads an EtatplanWS sheet into the plan (upserting its Kostenpunkte). */
export const importEtaplanXlsx = defineAction(
	{
		...plan,
		schema: z.tuple([z.object({ etaplanId: z.string(), base64: z.string() })]),
		errorMessage: "Import fehlgeschlagen",
	},
	async ([{ etaplanId, base64 }], { tenant }) =>
		excel.importXlsx(tenant, etaplanId, base64),
);
