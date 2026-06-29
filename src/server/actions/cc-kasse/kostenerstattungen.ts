"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ibanSchema } from "~/lib/iban";
import { db } from "~/server/db";
import { kostenerstattungen } from "~/server/db/schema";
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

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

const receiptsSchema = z
	.array(z.object({ url: z.string().url(), name: z.string().max(255) }))
	.max(20, "Zu viele Belege");

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

export async function submitReimbursement(input: {
	kostenpunktId: string;
	description: string;
	amount: number;
	recipientName: string;
	iban: string;
	receipts?: { url: string; name: string }[];
	expenseDate?: Date;
}) {
	const guard = await requireAuth();
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = submitSchema.parse(input);
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, parsed.kostenpunktId),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}

		await db.insert(kostenerstattungen).values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			source: "Antrag",
			status: "Eingereicht",
			description: parsed.description,
			amount: round2(parsed.amount),
			submittedBy: guard.userId,
			recipientName: parsed.recipientName,
			iban: parsed.iban,
			receipts: parsed.receipts ?? null,
			expenseDate: parsed.expenseDate ?? new Date(),
		});

		revalidatePath("/kostenerstattung");
		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error submitting reimbursement:", error);
		return { success: false as const, error: "Fehler beim Einreichen" };
	}
}

export async function listMyReimbursements() {
	const guard = await requireAuth();
	if (!guard.ok) return [];
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

export async function cancelMyReimbursement(id: string) {
	const guard = await requireAuth();
	if (!guard.ok) return { success: false as const, error: guard.error };

	const row = await db.query.kostenerstattungen.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, submittedBy: true, status: true },
	});
	if (!row || row.submittedBy !== guard.userId) {
		return { success: false as const, error: "Antrag nicht gefunden" };
	}
	if (row.status !== "Eingereicht") {
		return {
			success: false as const,
			error: "Nur eingereichte Anträge können storniert werden",
		};
	}

	await db.delete(kostenerstattungen).where(eq(kostenerstattungen.id, id));
	revalidatePath("/kostenerstattung");
	return { success: true as const };
}

// Member edits their own request — only while still "Eingereicht".
export async function updateMyReimbursement(
	id: string,
	input: {
		kostenpunktId: string;
		description: string;
		amount: number;
		recipientName: string;
		iban: string;
		receipts?: { url: string; name: string }[];
	},
) {
	const guard = await requireAuth();
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = submitSchema.parse(input);
		const row = await db.query.kostenerstattungen.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true, submittedBy: true, status: true },
		});
		if (!row || row.submittedBy !== guard.userId) {
			return { success: false as const, error: "Antrag nicht gefunden" };
		}
		if (row.status !== "Eingereicht") {
			return {
				success: false as const,
				error: "Nur eingereichte Anträge können bearbeitet werden",
			};
		}
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, parsed.kostenpunktId),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}

		await db
			.update(kostenerstattungen)
			.set({
				kostenpunktId: kp.id,
				etaplanId: kp.etaplanId,
				description: parsed.description,
				amount: round2(parsed.amount),
				recipientName: parsed.recipientName,
				iban: parsed.iban,
				receipts: parsed.receipts ?? null,
			})
			.where(eq(kostenerstattungen.id, id));

		revalidatePath("/kostenerstattung");
		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating own reimbursement:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}

// ─── Treasury: approve / reject / pay / direct booking / queue ────────────────

async function loadForTransition(id: string) {
	return db.query.kostenerstattungen.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		columns: { id: true, status: true },
	});
}

export async function approveReimbursement(id: string) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	const row = await loadForTransition(id);
	if (!row) return { success: false as const, error: "Antrag nicht gefunden" };
	if (!canTransition(row.status as ErstattungStatus, "Genehmigt")) {
		return { success: false as const, error: "Ungültiger Statusübergang" };
	}

	await db
		.update(kostenerstattungen)
		.set({
			status: "Genehmigt",
			approvedBy: guard.userId,
			approvedAt: new Date(),
		})
		.where(eq(kostenerstattungen.id, id));
	revalidatePath("/cc-kasse");
	revalidatePath("/kostenerstattung");
	return { success: true as const };
}

export async function rejectReimbursement(id: string, reason: string) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	const trimmed = (reason ?? "").trim();
	if (!trimmed) {
		return { success: false as const, error: "Begründung ist erforderlich" };
	}

	const row = await loadForTransition(id);
	if (!row) return { success: false as const, error: "Antrag nicht gefunden" };
	if (!canTransition(row.status as ErstattungStatus, "Abgelehnt")) {
		return { success: false as const, error: "Ungültiger Statusübergang" };
	}

	await db
		.update(kostenerstattungen)
		.set({
			status: "Abgelehnt",
			rejectionReason: trimmed.slice(0, 500),
			rejectedBy: guard.userId,
			rejectedAt: new Date(),
		})
		.where(eq(kostenerstattungen.id, id));
	revalidatePath("/cc-kasse");
	revalidatePath("/kostenerstattung");
	return { success: true as const };
}

export async function markReimbursementPaid(
	id: string,
	opts?: { paidAt?: Date },
) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	const row = await loadForTransition(id);
	if (!row) return { success: false as const, error: "Antrag nicht gefunden" };
	if (!canTransition(row.status as ErstattungStatus, "Ausgezahlt")) {
		return { success: false as const, error: "Ungültiger Statusübergang" };
	}

	await db
		.update(kostenerstattungen)
		.set({
			status: "Ausgezahlt",
			paidBy: guard.userId,
			paidAt: opts?.paidAt ?? new Date(),
		})
		.where(eq(kostenerstattungen.id, id));
	revalidatePath("/cc-kasse");
	revalidatePath("/kostenerstattung");
	return { success: true as const };
}

const directBookingSchema = z.object({
	kostenpunktId: z.string().min(1, "Kostenpunkt ist erforderlich"),
	description: z.string().min(1, "Beschreibung ist erforderlich").max(500),
	amount: z.number().positive("Betrag muss positiv sein").max(1_000_000),
	recipientName: z.string().min(1, "Empfänger ist erforderlich").max(255),
	iban: z.string().max(50).nullable().optional(),
	receipts: receiptsSchema.optional(),
	expenseDate: z.date(),
});

export async function createDirectBooking(input: {
	kostenpunktId: string;
	description: string;
	amount: number;
	recipientName: string;
	iban?: string | null;
	receipts?: { url: string; name: string }[];
	expenseDate: Date;
}) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const parsed = directBookingSchema.parse(input);
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, parsed.kostenpunktId),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}

		await db.insert(kostenerstattungen).values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			source: "Direktbuchung",
			status: "Ausgezahlt",
			description: parsed.description,
			amount: round2(parsed.amount),
			submittedBy: null,
			recipientName: parsed.recipientName,
			iban: parsed.iban ?? null,
			receipts: parsed.receipts ?? null,
			expenseDate: parsed.expenseDate,
			approvedBy: guard.userId,
			approvedAt: parsed.expenseDate,
			paidBy: guard.userId,
			paidAt: parsed.expenseDate,
		});

		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error creating direct booking:", error);
		return { success: false as const, error: "Fehler beim Buchen" };
	}
}

export async function updateReimbursement(
	id: string,
	input: {
		kostenpunktId?: string;
		description?: string;
		amount?: number;
		recipientName?: string;
		iban?: string | null;
		expenseDate?: Date;
		receipts?: { url: string; name: string }[];
	},
) {
	const guard = await requireRoles(TREASURY_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	const patch: Record<string, unknown> = {};
	if (input.kostenpunktId !== undefined) {
		const kp = await db.query.kostenpunkte.findFirst({
			where: (t, { eq }) => eq(t.id, input.kostenpunktId as string),
			columns: { id: true, etaplanId: true },
		});
		if (!kp) {
			return { success: false as const, error: "Kostenpunkt nicht gefunden" };
		}
		patch.kostenpunktId = kp.id;
		patch.etaplanId = kp.etaplanId;
	}
	if (input.description !== undefined) patch.description = input.description;
	if (input.amount !== undefined) patch.amount = round2(input.amount);
	if (input.recipientName !== undefined)
		patch.recipientName = input.recipientName;
	if (input.iban !== undefined) patch.iban = input.iban;
	if (input.expenseDate !== undefined) patch.expenseDate = input.expenseDate;
	if (input.receipts !== undefined) patch.receipts = input.receipts;
	if (Object.keys(patch).length === 0) {
		return { success: false as const, error: "Keine Änderungen" };
	}

	await db
		.update(kostenerstattungen)
		.set(patch)
		.where(eq(kostenerstattungen.id, id));
	revalidatePath("/cc-kasse");
	revalidatePath("/kostenerstattung");
	return { success: true as const };
}

export async function listReimbursementQueue(filter?: {
	etaplanId?: string;
	status?: ErstattungStatus;
}) {
	// Read access for all Etaplan editors (Senior incl.); treasury actions are
	// gated separately in the UI.
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return [];

	const conds = [];
	if (filter?.etaplanId)
		conds.push(eq(kostenerstattungen.etaplanId, filter.etaplanId));
	if (filter?.status) conds.push(eq(kostenerstattungen.status, filter.status));

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
