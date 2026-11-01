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
} from "./service";

/**
 * The caller's tenant if they hold one of `roles` (any member when
 * omitted), or null: these reads answer a denied caller with nothing.
 */
async function requireRoles(roles?: readonly string[]) {
	try {
		const { tenantId } = await requireCaller(roles);
		return tenantId;
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
	const tenantId = await requireRoles(ROLES.etatplan);
	if (!tenantId) {
		return null;
	}
	return orElse("building etaplan overview", null, async () =>
		cc.overview(await scopeOf(tenantId), etaplanId),
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
	const tenantId = await requireRoles(ROLES.etatplan);
	return tenantId ? cc.einnahmen(await scopeOf(tenantId), etaplanId) : [];
}
