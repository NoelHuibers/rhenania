// service.ts — the CC-Kasse: Etatpläne, Kostenpunkte, Einnahmen and the
// budget overview (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The overview arithmetic is
// domain/cc-kasse/overview.

import "server-only";

import { z } from "zod";
import { roundToCent } from "~/lib/money";
import {
	buildOverview,
	type EtaplanOverview,
} from "~/server/domain/cc-kasse/overview";
import { ConflictError, NotFoundError } from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { Etaplan } from "./repo";

type Actor = { id: string };

// ─── Etatpläne ───────────────────────────────────────────────────────────────

export const etaplanSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
	semesterType: z.enum(["SS", "WS"]),
	year: z
		.number()
		.int("Jahr muss eine ganze Zahl sein")
		.min(1900, "Jahr ist zu klein")
		.max(2200, "Jahr ist zu groß"),
	startDate: z.date().nullable().optional(),
	endDate: z.date().nullable().optional(),
	status: z.enum(["Aktiv", "Abgeschlossen"]).optional(),
	notes: z.string().max(1000).nullable().optional(),
});

/** Every plan, newest year first. */
export async function listEtaplans({ db }: TenantScope) {
	return repo.listEtaplans(db);
}

export async function etaplan({ db }: TenantScope, id: string) {
	return repo.findEtaplan(db, id);
}

/** The newest active plan, or null. */
export async function activeEtaplan({ db }: TenantScope) {
	return repo.activeEtaplan(db);
}

/**
 * Creates a plan. A second plan for the same semester is allowed, but the
 * answer carries a warning about it.
 */
export async function createEtaplan(
	{ db }: TenantScope,
	actor: Actor,
	input: z.infer<typeof etaplanSchema>,
) {
	const duplicate = await repo.hasEtaplanFor(
		db,
		input.semesterType,
		input.year,
	);
	const row = await repo.insertEtaplan(db, {
		name: input.name,
		semesterType: input.semesterType,
		year: input.year,
		startDate: input.startDate ?? null,
		endDate: input.endDate ?? null,
		status: input.status ?? "Aktiv",
		notes: input.notes ?? null,
		createdBy: actor.id,
	});
	return {
		etaplan: row,
		warning: duplicate
			? `Es existiert bereits ein Etatplan für ${input.semesterType} ${input.year}.`
			: undefined,
	};
}

export async function updateEtaplan(
	{ db }: TenantScope,
	id: string,
	patch: Partial<z.infer<typeof etaplanSchema>>,
) {
	const row = await repo.updateEtaplan(db, id, patch);
	if (!row) {
		throw new NotFoundError("Etatplan nicht gefunden");
	}
	return { etaplan: row };
}

// ─── Kostenpunkte ────────────────────────────────────────────────────────────

const positionSchema = z.object({
	bemerkung: z.string().max(500).nullable().optional(),
	ausgaben: z.number().min(0).max(1_000_000).default(0),
	einnahmen: z.number().min(0).max(1_000_000).default(0),
	displayOrder: z.number().int().optional(),
});

export const createKostenpunktSchema = z.object({
	etaplanId: z.string().min(1),
	category: z.string().min(1, "Kategorie ist erforderlich").max(255),
	categoryOrder: z.number().int().default(0),
	name: z.string().min(1, "Name ist erforderlich").max(255),
	description: z.string().max(1000).nullable().optional(),
	eventId: z.string().nullable().optional(),
	displayOrder: z.number().int().default(0),
	positionen: z.array(positionSchema).default([]),
});

export const updateKostenpunktSchema = createKostenpunktSchema.omit({
	etaplanId: true,
});

/** The Positionen rows; budget and income are their sums. */
function positionRows(
	kostenpunktId: string,
	positionen: z.infer<typeof positionSchema>[],
) {
	const rows = positionen.map((p, i) => ({
		kostenpunktId,
		bemerkung: p.bemerkung?.trim() ? p.bemerkung.trim() : null,
		ausgaben: roundToCent(p.ausgaben ?? 0),
		einnahmen: roundToCent(p.einnahmen ?? 0),
		displayOrder: p.displayOrder ?? i,
	}));
	return {
		rows,
		budget: roundToCent(rows.reduce((s, p) => s + p.ausgaben, 0)),
		income: roundToCent(rows.reduce((s, p) => s + p.einnahmen, 0)),
	};
}

/** A plan's Kostenpunkte in display order, with Positionen and event. */
export async function kostenpunkte({ db }: TenantScope, etaplanId: string) {
	return repo.listKostenpunkte(db, etaplanId);
}

export type KostenpunktWithPositions = Awaited<
	ReturnType<typeof kostenpunkte>
>[number];

export type LinkableEvent = { id: string; title: string; date: Date };

/** The events a Kostenpunkt may name, newest first. */
export async function linkableEvents({
	db,
}: TenantScope): Promise<LinkableEvent[]> {
	return repo.recentEvents(db);
}

export type BookableKostenpunkt = {
	id: string;
	name: string;
	category: string;
};

/** Kostenpunkte from all active plans — what a member can book against. */
export async function bookableKostenpunkte({
	db,
}: TenantScope): Promise<BookableKostenpunkt[]> {
	return repo.activeKostenpunkte(db);
}

/** The Kostenpunkt to book against, with the plan it belongs to. */
export async function bookableKostenpunkt({ db }: TenantScope, id: string) {
	const kp = await repo.findKostenpunkt(db, id);
	if (!kp) {
		throw new NotFoundError("Kostenpunkt nicht gefunden");
	}
	return kp;
}

export async function createKostenpunkt(
	{ db }: TenantScope,
	input: z.infer<typeof createKostenpunktSchema>,
) {
	const id = crypto.randomUUID();
	const { rows, budget, income } = positionRows(id, input.positionen);
	await repo.insertKostenpunkt(
		db,
		{
			id,
			etaplanId: input.etaplanId,
			category: input.category,
			categoryOrder: input.categoryOrder,
			name: input.name,
			description: input.description ?? null,
			budget,
			income,
			eventId: input.eventId || null,
			displayOrder: input.displayOrder,
		},
		rows,
	);
	return { id };
}

export async function updateKostenpunkt(
	{ db }: TenantScope,
	id: string,
	input: z.infer<typeof updateKostenpunktSchema>,
) {
	const { rows, budget, income } = positionRows(id, input.positionen);
	await repo.replaceKostenpunkt(
		db,
		id,
		{
			category: input.category,
			categoryOrder: input.categoryOrder,
			name: input.name,
			description: input.description ?? null,
			budget,
			income,
			eventId: input.eventId || null,
			displayOrder: input.displayOrder,
		},
		rows,
	);
}

/** Deletes a Kostenpunkt nothing is booked on yet. */
export async function deleteKostenpunkt({ db }: TenantScope, id: string) {
	if ((await repo.countErstattungen(db, id)) > 0) {
		throw new ConflictError(
			"Kostenpunkt hat Erstattungen und kann nicht gelöscht werden.",
		);
	}
	if ((await repo.countEinnahmen(db, id)) > 0) {
		throw new ConflictError(
			"Kostenpunkt hat gebuchte Einnahmen und kann nicht gelöscht werden.",
		);
	}
	await repo.deleteKostenpunkt(db, id);
}

// ─── Einnahmen ───────────────────────────────────────────────────────────────

export const einnahmeSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z
		.string()
		.min(1, "Beschreibung ist erforderlich")
		.max(500, "Beschreibung ist zu lang"),
	amount: z
		.number()
		.positive("Betrag muss positiv sein")
		.max(1_000_000, "Betrag ist zu hoch"),
	incomeDate: z.date(),
});

type EinnahmeInput = z.infer<typeof einnahmeSchema>;

/** A plan's Einnahmen, newest first. */
export async function einnahmen({ db }: TenantScope, etaplanId: string) {
	return repo.listEinnahmen(db, etaplanId);
}

export type EinnahmeRow = Awaited<ReturnType<typeof einnahmen>>[number];

/** Books income (e.g. cash from an event) on a Kostenpunkt. */
export async function createEinnahme(
	tenant: TenantScope,
	actor: Actor,
	input: EinnahmeInput,
) {
	const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
	await repo.insertEinnahme(tenant.db, {
		kostenpunktId: kp.id,
		etaplanId: kp.etaplanId,
		description: input.description,
		amount: roundToCent(input.amount),
		incomeDate: input.incomeDate,
		bookedBy: actor.id,
	});
}

export async function updateEinnahme(
	tenant: TenantScope,
	id: string,
	input: EinnahmeInput,
) {
	if (!(await repo.einnahmeExists(tenant.db, id))) {
		throw new NotFoundError("Einnahme nicht gefunden");
	}
	const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
	await repo.updateEinnahme(tenant.db, id, {
		kostenpunktId: kp.id,
		etaplanId: kp.etaplanId,
		description: input.description,
		amount: roundToCent(input.amount),
		incomeDate: input.incomeDate,
	});
}

export async function deleteEinnahme({ db }: TenantScope, id: string) {
	await repo.deleteEinnahme(db, id);
}

// ─── The overview ────────────────────────────────────────────────────────────

/** A plan's budget overview: per Kostenpunkt, per category and in total. */
export async function overview(
	{ db }: TenantScope,
	etaplanId: string,
): Promise<EtaplanOverview> {
	return buildOverview(await repo.overviewSums(db, etaplanId));
}
