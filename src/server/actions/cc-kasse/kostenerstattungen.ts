"use server";

import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ibanSchema } from "~/lib/iban";
import { roundToCent } from "~/lib/money";
import { kostenerstattungen } from "~/server/db/schema";
import { isTenantReceiptUrl } from "~/server/lib/blob-url";
import { defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { requireCurrentTenant } from "~/server/lib/tenant-context";
import { scopeOf, type TenantScope } from "~/server/lib/tenant-scope";
import {
	EDIT_ROLES,
	requireAuth,
	requireRoles,
	TREASURY_ROLES,
} from "./_guards";

type ErstattungStatus =
	| "Eingereicht"
	| "Genehmigt"
	| "Ausgezahlt"
	| "Abgelehnt";

const TRANSITIONS: Record<ErstattungStatus, ErstattungStatus[]> = {
	Eingereicht: ["Genehmigt", "Abgelehnt"],
	Genehmigt: ["Ausgezahlt", "Abgelehnt"],
	Ausgezahlt: [],
	Abgelehnt: [],
};

function canTransition(from: ErstattungStatus, to: ErstattungStatus): boolean {
	return TRANSITIONS[from]?.includes(to) ?? false;
}

const receiptsSchema = z
	.array(z.object({ url: z.string().url(), name: z.string().max(255) }))
	.max(20, "Zu viele Belege");

type Receipt = { url: string; name: string };

const INVALID_RECEIPT = "Ungültiger Beleg";
const REQUEST_NOT_FOUND = "Antrag nicht gefunden";

/**
 * Receipts must be files uploaded to this Corps' receipt folder. Links already
 * stored on the row (`stored`) stay accepted, so older entries can still be
 * edited without re-uploading their receipts. Throws otherwise.
 */
async function checkReceipts(
	receipts: Receipt[] | undefined,
	stored: Receipt[] | null = null,
): Promise<void> {
	if (!receipts?.length) {
		return;
	}
	const { slug } = await requireCurrentTenant();
	const kept = new Set(stored?.map((r) => r.url));
	if (
		!receipts.every((r) => kept.has(r.url) || isTenantReceiptUrl(r.url, slug))
	) {
		throw new ValidationError(INVALID_RECEIPT);
	}
}

/** The Kostenpunkt to book against, with the plan it belongs to. */
async function bookableKostenpunkt({ db }: TenantScope, id: string) {
	const kp = await db.query.kostenpunkte.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, etaplanId: true },
	});
	if (!kp) {
		throw new NotFoundError("Kostenpunkt nicht gefunden");
	}
	return kp;
}

const submitSchema = z.object({
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

// ─── Member: submit / list own / cancel ──────────────────────────────────────

export const submitReimbursement = defineAction(
	{
		schema: z.tuple([submitSchema]),
		revalidate: ["/kostenerstattung", "/cc-kasse"],
		errorMessage: "Fehler beim Einreichen",
	},
	async ([input], { tenant, user }) => {
		await checkReceipts(input.receipts);
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);

		await tenant.db.insert(kostenerstattungen).values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			source: "Antrag",
			status: "Eingereicht",
			description: input.description,
			amount: roundToCent(input.amount),
			submittedBy: user.id,
			recipientName: input.recipientName,
			iban: input.iban,
			receipts: input.receipts ?? null,
			expenseDate: input.expenseDate ?? tenant.now(),
		});
	},
);

export async function listMyReimbursements() {
	const guard = await requireAuth();
	if (!guard.ok) {
		return [];
	}
	const { db } = await scopeOf(guard.tenantId);
	return db.query.kostenerstattungen.findMany({
		where: (t, { eq }) => eq(t.submittedBy, guard.userId),
		orderBy: (t, { desc }) => [desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			etaplan: { columns: { id: true, name: true } },
		},
	});
}

export type MyReimbursement = Awaited<
	ReturnType<typeof listMyReimbursements>
>[number];

export const cancelMyReimbursement = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: ["/kostenerstattung"],
		errorMessage: "Fehler beim Stornieren",
	},
	async ([id], { tenant, user }) => {
		const row = await tenant.db.query.kostenerstattungen.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true, submittedBy: true, status: true },
		});
		if (!row || row.submittedBy !== user.id) {
			throw new NotFoundError(REQUEST_NOT_FOUND);
		}
		if (row.status !== "Eingereicht") {
			throw new ConflictError(
				"Nur eingereichte Anträge können storniert werden",
			);
		}

		await tenant.db
			.delete(kostenerstattungen)
			.where(eq(kostenerstattungen.id, id));
	},
);

// Member edits their own request — only while still "Eingereicht".
export const updateMyReimbursement = defineAction(
	{
		schema: z.tuple([z.string(), submitSchema]),
		revalidate: ["/kostenerstattung", "/cc-kasse"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, input], { tenant, user }) => {
		const row = await tenant.db.query.kostenerstattungen.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true, submittedBy: true, status: true, receipts: true },
		});
		if (!row || row.submittedBy !== user.id) {
			throw new NotFoundError(REQUEST_NOT_FOUND);
		}
		if (row.status !== "Eingereicht") {
			throw new ConflictError(
				"Nur eingereichte Anträge können bearbeitet werden",
			);
		}
		await checkReceipts(input.receipts, row.receipts);
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);

		await tenant.db
			.update(kostenerstattungen)
			.set({
				kostenpunktId: kp.id,
				etaplanId: kp.etaplanId,
				description: input.description,
				amount: roundToCent(input.amount),
				recipientName: input.recipientName,
				iban: input.iban,
				receipts: input.receipts ?? null,
			})
			.where(eq(kostenerstattungen.id, id));
	},
);

// ─── Treasury: approve / reject / pay / direct booking / queue ────────────────

/** Checks that the request exists and may move on to `to`; throws otherwise. */
async function checkTransition(
	{ db }: TenantScope,
	id: string,
	to: ErstattungStatus,
) {
	const row = await db.query.kostenerstattungen.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, status: true },
	});
	if (!row) {
		throw new NotFoundError(REQUEST_NOT_FOUND);
	}
	if (!canTransition(row.status as ErstattungStatus, to)) {
		throw new ConflictError("Ungültiger Statusübergang");
	}
}

export const approveReimbursement = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse", "/kostenerstattung"],
		errorMessage: "Fehler beim Genehmigen",
	},
	async ([id], { tenant, user }) => {
		await checkTransition(tenant, id, "Genehmigt");
		await tenant.db
			.update(kostenerstattungen)
			.set({
				status: "Genehmigt",
				approvedBy: user.id,
				approvedAt: tenant.now(),
			})
			.where(eq(kostenerstattungen.id, id));
	},
);

export const rejectReimbursement = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([z.string(), z.string().nullish()]),
		revalidate: ["/cc-kasse", "/kostenerstattung"],
		errorMessage: "Fehler beim Ablehnen",
	},
	async ([id, reason], { tenant, user }) => {
		const trimmed = (reason ?? "").trim();
		if (!trimmed) {
			throw new ValidationError("Begründung ist erforderlich");
		}

		await checkTransition(tenant, id, "Abgelehnt");
		await tenant.db
			.update(kostenerstattungen)
			.set({
				status: "Abgelehnt",
				rejectionReason: trimmed.slice(0, 500),
				rejectedBy: user.id,
				rejectedAt: tenant.now(),
			})
			.where(eq(kostenerstattungen.id, id));
	},
);

export const markReimbursementPaid = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([
			z.string(),
			z.object({ paidAt: z.date().optional() }).optional(),
		]),
		revalidate: ["/cc-kasse", "/kostenerstattung"],
		errorMessage: "Fehler beim Auszahlen",
	},
	async ([id, opts], { tenant, user }) => {
		await checkTransition(tenant, id, "Ausgezahlt");
		await tenant.db
			.update(kostenerstattungen)
			.set({
				status: "Ausgezahlt",
				paidBy: user.id,
				paidAt: opts?.paidAt ?? tenant.now(),
			})
			.where(eq(kostenerstattungen.id, id));
	},
);

const directBookingSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z.string().min(1, "Beschreibung ist erforderlich").max(500),
	amount: z.number().positive("Betrag muss positiv sein").max(1_000_000),
	recipientName: z.string().min(1, "Empfänger ist erforderlich").max(255),
	iban: z.string().max(50).nullable().optional(),
	receipts: receiptsSchema.optional(),
	expenseDate: z.date(),
});

export const createDirectBooking = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([directBookingSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Buchen",
	},
	async ([input], { tenant, user }) => {
		await checkReceipts(input.receipts);
		const kp = await bookableKostenpunkt(tenant, input.kostenpunktId);

		await tenant.db.insert(kostenerstattungen).values({
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
			approvedBy: user.id,
			approvedAt: input.expenseDate,
			paidBy: user.id,
			paidAt: input.expenseDate,
		});
	},
);

// The receipts are checked in the body, so a malformed link answers
// "Ungültiger Beleg" like a foreign one.
const reimbursementPatchSchema = z.object({
	kostenpunktId: z.string().optional(),
	description: z.string().optional(),
	amount: z.number().optional(),
	recipientName: z.string().optional(),
	iban: z.string().nullable().optional(),
	expenseDate: z.date().optional(),
	receipts: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
});

export const updateReimbursement = defineAction(
	{
		roles: TREASURY_ROLES,
		schema: z.tuple([z.string(), reimbursementPatchSchema]),
		revalidate: ["/cc-kasse", "/kostenerstattung"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, input], { tenant }) => {
		const patch: Partial<typeof kostenerstattungen.$inferInsert> = {};
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
			const row = await tenant.db.query.kostenerstattungen.findFirst({
				where: (t, { eq }) => eq(t.id, id),
				columns: { receipts: true },
			});
			await checkReceipts(parsed.data, row?.receipts ?? null);
			patch.receipts = parsed.data;
		}
		if (Object.keys(patch).length === 0) {
			throw new ValidationError("Keine Änderungen");
		}

		await tenant.db
			.update(kostenerstattungen)
			.set(patch)
			.where(eq(kostenerstattungen.id, id));
	},
);

export async function listReimbursementQueue(filter?: {
	etaplanId?: string;
	status?: ErstattungStatus;
}) {
	// Read access for all Etaplan editors (Senior incl.); treasury actions are
	// gated separately in the UI.
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) {
		return [];
	}

	const conds: Array<SQL | undefined> = [];
	if (filter?.etaplanId) {
		conds.push(eq(kostenerstattungen.etaplanId, filter.etaplanId));
	}
	if (filter?.status) {
		conds.push(eq(kostenerstattungen.status, filter.status));
	}

	const { db } = await scopeOf(guard.tenantId);
	return db.query.kostenerstattungen.findMany({
		where: conds.length ? and(...conds) : undefined,
		orderBy: (t) => [desc(t.createdAt)],
		with: {
			kostenpunkt: { columns: { id: true, name: true, category: true } },
			etaplan: { columns: { id: true, name: true } },
			submitter: { columns: { id: true, name: true } },
		},
	});
}

export type QueueReimbursement = Awaited<
	ReturnType<typeof listReimbursementQueue>
>[number];
