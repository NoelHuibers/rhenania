// service.ts — the CC-Kasse: Etatpläne, Kostenpunkte, Einnahmen,
// Kostenerstattungen, the members' payment details and the budget
// overview (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The overview arithmetic is
// domain/cc-kasse/overview.

import "server-only";

import { z } from "zod";
import { ibanSchema } from "~/lib/iban";
import { roundToCent } from "~/lib/money";
import {
	buildOverview,
	type EtaplanOverview,
} from "~/server/domain/cc-kasse/overview";
import { isTenantReceiptUrl } from "~/server/lib/blob-url";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { getTenantById } from "~/server/lib/tenant-context";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { ErstattungStatus, Etaplan } from "./repo";

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

// ─── Kostenerstattungen ──────────────────────────────────────────────────────

const TRANSITIONS: Record<repo.ErstattungStatus, repo.ErstattungStatus[]> = {
	Eingereicht: ["Genehmigt", "Abgelehnt"],
	Genehmigt: ["Ausgezahlt", "Abgelehnt"],
	Ausgezahlt: [],
	Abgelehnt: [],
};

function canTransition(
	from: repo.ErstattungStatus,
	to: repo.ErstattungStatus,
): boolean {
	return TRANSITIONS[from]?.includes(to) ?? false;
}

const receiptsSchema = z
	.array(z.object({ url: z.string().url(), name: z.string().max(255) }))
	.max(20, "Zu viele Belege");

type Receipt = { url: string; name: string };

const INVALID_RECEIPT = "Ungültiger Beleg";
const REQUEST_NOT_FOUND = "Antrag nicht gefunden";

/**
 * Receipts must be files uploaded to this Corps' receipt folder. Links
 * already stored on the row (`stored`) stay accepted, so older entries can
 * still be edited without re-uploading their receipts. Throws otherwise.
 */
async function checkReceipts(
	{ tenantId }: TenantScope,
	receipts: Receipt[] | undefined,
	stored: Receipt[] | null = null,
): Promise<void> {
	if (!receipts?.length) {
		return;
	}
	const corps = await getTenantById(tenantId);
	if (!corps) {
		throw new Error(`Unknown tenant ${tenantId}`);
	}
	const kept = new Set(stored?.map((r) => r.url));
	if (
		!receipts.every(
			(r) => kept.has(r.url) || isTenantReceiptUrl(r.url, corps.slug),
		)
	) {
		throw new ValidationError(INVALID_RECEIPT);
	}
}

export const submitSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z
		.string()
		.min(1, "Beschreibung ist erforderlich")
		.max(500, "Beschreibung ist zu lang"),
	amount: z
		.number()
		.positive("Betrag muss positiv sein")
		.max(1_000_000, "Betrag ist zu hoch"),
	recipientName: z
		.string()
		.min(1, "Kontoinhaber ist erforderlich")
		.max(255, "Kontoinhaber ist zu lang"),
	iban: ibanSchema,
	receipts: receiptsSchema.optional(),
	expenseDate: z.date().optional(),
});

type SubmitInput = z.infer<typeof submitSchema>;

/** A member asks for an expense to be reimbursed. */
export async function submitErstattung(
	tenant: TenantScope,
	actor: Actor,
	input: SubmitInput,
) {
	await checkReceipts(tenant, input.receipts);
	const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
	await repo.insertErstattung(tenant.db, {
		kostenpunktId: kp.id,
		etaplanId: kp.etaplanId,
		source: "Antrag",
		status: "Eingereicht",
		description: input.description,
		amount: roundToCent(input.amount),
		submittedBy: actor.id,
		recipientName: input.recipientName,
		iban: input.iban,
		receipts: input.receipts ?? null,
		expenseDate: input.expenseDate ?? tenant.now(),
	});
}

/** The member's own requests, newest first. */
export async function myErstattungen({ db }: TenantScope, userId: string) {
	return repo.erstattungenOf(db, userId);
}

export type MyReimbursement = Awaited<
	ReturnType<typeof myErstattungen>
>[number];

/** The member's own request, while it is still Eingereicht; throws otherwise. */
async function ownOpenRequest(
	{ db }: TenantScope,
	actor: Actor,
	id: string,
	refusal: string,
) {
	const row = await repo.findErstattung(db, id);
	if (!row || row.submittedBy !== actor.id) {
		throw new NotFoundError(REQUEST_NOT_FOUND);
	}
	if (row.status !== "Eingereicht") {
		throw new ConflictError(refusal);
	}
	return row;
}

/** A member withdraws their own request while it is still Eingereicht. */
export async function cancelMyErstattung(
	tenant: TenantScope,
	actor: Actor,
	id: string,
) {
	await ownOpenRequest(
		tenant,
		actor,
		id,
		"Nur eingereichte Anträge können storniert werden",
	);
	await repo.deleteErstattung(tenant.db, id);
}

/** A member edits their own request while it is still Eingereicht. */
export async function updateMyErstattung(
	tenant: TenantScope,
	actor: Actor,
	id: string,
	input: SubmitInput,
) {
	const row = await ownOpenRequest(
		tenant,
		actor,
		id,
		"Nur eingereichte Anträge können bearbeitet werden",
	);
	await checkReceipts(tenant, input.receipts, row.receipts);
	const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
	await repo.updateErstattung(tenant.db, id, {
		kostenpunktId: kp.id,
		etaplanId: kp.etaplanId,
		description: input.description,
		amount: roundToCent(input.amount),
		recipientName: input.recipientName,
		iban: input.iban,
		receipts: input.receipts ?? null,
	});
}

/** Checks that the request exists and may move on to `to`; throws otherwise. */
async function checkTransition(
	{ db }: TenantScope,
	id: string,
	to: repo.ErstattungStatus,
) {
	const row = await repo.findErstattung(db, id);
	if (!row) {
		throw new NotFoundError(REQUEST_NOT_FOUND);
	}
	if (!canTransition(row.status, to)) {
		throw new ConflictError("Ungültiger Statusübergang");
	}
}

export async function approveErstattung(
	tenant: TenantScope,
	actor: Actor,
	id: string,
) {
	await checkTransition(tenant, id, "Genehmigt");
	await repo.updateErstattung(tenant.db, id, {
		status: "Genehmigt",
		approvedBy: actor.id,
		approvedAt: tenant.now(),
	});
}

/** Rejects a request; the reason is required and kept to 500 characters. */
export async function rejectErstattung(
	tenant: TenantScope,
	actor: Actor,
	id: string,
	reason: string | null | undefined,
) {
	const trimmed = (reason ?? "").trim();
	if (!trimmed) {
		throw new ValidationError("Begründung ist erforderlich");
	}
	await checkTransition(tenant, id, "Abgelehnt");
	await repo.updateErstattung(tenant.db, id, {
		status: "Abgelehnt",
		rejectionReason: trimmed.slice(0, 500),
		rejectedBy: actor.id,
		rejectedAt: tenant.now(),
	});
}

/** Marks an approved request as paid, on `paidAt` or now. */
export async function payErstattung(
	tenant: TenantScope,
	actor: Actor,
	id: string,
	paidAt: Date | undefined,
) {
	await checkTransition(tenant, id, "Ausgezahlt");
	await repo.updateErstattung(tenant.db, id, {
		status: "Ausgezahlt",
		paidBy: actor.id,
		paidAt: paidAt ?? tenant.now(),
	});
}

export const directBookingSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z.string().min(1, "Beschreibung ist erforderlich").max(500),
	amount: z.number().positive("Betrag muss positiv sein").max(1_000_000),
	recipientName: z.string().min(1, "Empfänger ist erforderlich").max(255),
	iban: z.string().max(50).nullable().optional(),
	receipts: receiptsSchema.optional(),
	expenseDate: z.date(),
});

/** The treasurer books an expense already paid, e.g. in cash. */
export async function createDirectBooking(
	tenant: TenantScope,
	actor: Actor,
	input: z.infer<typeof directBookingSchema>,
) {
	await checkReceipts(tenant, input.receipts);
	const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
	await repo.insertErstattung(tenant.db, {
		kostenpunktId: kp.id,
		etaplanId: kp.etaplanId,
		source: "Direktbuchung",
		status: "Ausgezahlt",
		description: input.description,
		amount: roundToCent(input.amount),
		submittedBy: null,
		recipientName: input.recipientName,
		iban: input.iban ?? null,
		receipts: input.receipts ?? null,
		expenseDate: input.expenseDate,
		approvedBy: actor.id,
		approvedAt: input.expenseDate,
		paidBy: actor.id,
		paidAt: input.expenseDate,
	});
}

// The receipts are checked in the body, so a malformed link answers
// "Ungültiger Beleg" like a foreign one.
export const erstattungPatchSchema = z.object({
	kostenpunktId: z.string().optional(),
	description: z.string().optional(),
	amount: z.number().optional(),
	recipientName: z.string().optional(),
	iban: z.string().nullable().optional(),
	expenseDate: z.date().optional(),
	receipts: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
});

/** The treasurer corrects any field of a request. */
export async function updateErstattung(
	tenant: TenantScope,
	id: string,
	input: z.infer<typeof erstattungPatchSchema>,
) {
	const patch: Partial<repo.ErstattungInsert> = {};
	if (input.kostenpunktId !== undefined) {
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);
		patch.kostenpunktId = kp.id;
		patch.etaplanId = kp.etaplanId;
	}
	if (input.description !== undefined) {
		patch.description = input.description;
	}
	if (input.amount !== undefined) {
		patch.amount = roundToCent(input.amount);
	}
	if (input.recipientName !== undefined) {
		patch.recipientName = input.recipientName;
	}
	if (input.iban !== undefined) {
		patch.iban = input.iban;
	}
	if (input.expenseDate !== undefined) {
		patch.expenseDate = input.expenseDate;
	}
	if (input.receipts !== undefined) {
		const parsed = receiptsSchema.safeParse(input.receipts);
		if (!parsed.success) {
			throw new ValidationError(INVALID_RECEIPT);
		}
		const row = await repo.findErstattung(tenant.db, id);
		await checkReceipts(tenant, parsed.data, row?.receipts ?? null);
		patch.receipts = parsed.data;
	}
	if (Object.keys(patch).length === 0) {
		throw new ValidationError("Keine Änderungen");
	}
	await repo.updateErstattung(tenant.db, id, patch);
}

/** Every request (of a plan, in a status), newest first. */
export async function erstattungQueue(
	{ db }: TenantScope,
	filter?: { etaplanId?: string; status?: repo.ErstattungStatus },
) {
	return repo.erstattungQueue(db, filter);
}

export type QueueReimbursement = Awaited<
	ReturnType<typeof erstattungQueue>
>[number];

// ─── Payment details ─────────────────────────────────────────────────────────

export const paymentInfoSchema = z.object({
	accountHolder: z
		.string()
		.min(1, "Kontoinhaber ist erforderlich")
		.max(255, "Kontoinhaber ist zu lang"),
	iban: ibanSchema,
});

export type MyPaymentInfo = { accountHolder: string; iban: string };

/** The account the member's reimbursements are paid to, or null. */
export async function paymentInfo(
	{ db }: TenantScope,
	userId: string,
): Promise<MyPaymentInfo | null> {
	return repo.paymentInfoOf(db, userId);
}

export async function savePaymentInfo(
	{ db }: TenantScope,
	actor: Actor,
	input: z.infer<typeof paymentInfoSchema>,
) {
	await repo.savePaymentInfo(db, actor.id, {
		accountHolder: input.accountHolder,
		iban: input.iban,
	});
}

// ─── The overview ────────────────────────────────────────────────────────────

/** A plan's budget overview: per Kostenpunkt, per category and in total. */
export async function overview(
	{ db }: TenantScope,
	etaplanId: string,
): Promise<EtaplanOverview> {
	return buildOverview(await repo.overviewSums(db, etaplanId));
}
