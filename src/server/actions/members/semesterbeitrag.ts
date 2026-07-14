"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	sendBeitragEmail,
	sendMahnungEmail,
} from "~/server/actions/newuser/email";
import { db } from "~/server/db";
import {
	members,
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import {
	getTenantMemberStatuses,
	makeBeitragspflichtigMatcher,
} from "~/server/lib/member-statuses";
import { BEITRAG_ROLES, requireRoles } from "./_guards";
import { generateBeitragPDF } from "./beitragPDF";

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function listBeitragRuns() {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return [];
	return db
		.select()
		.from(semesterbeitragRuns)
		.orderBy(desc(semesterbeitragRuns.createdAt));
}

export type BeitragRun = Awaited<ReturnType<typeof listBeitragRuns>>[number];

const createRunSchema = z.object({
	name: z.string().min(1, "Name erforderlich").max(255),
	etaplanId: z.string().min(1, "Etatplan erforderlich"),
	kostenpunktId: z.string().min(1, "Kostenpunkt erforderlich"),
	amount: z.number().positive().max(100000),
	mahnungFee: z.number().min(0).max(100000),
	dueDate: z.date(),
});

async function insertCharges(
	runId: string,
	baseAmount: number,
): Promise<number> {
	const isBeitragspflichtig = makeBeitragspflichtigMatcher(
		await getTenantMemberStatuses(),
	);
	const allMembers = await db
		.select({
			id: members.id,
			firstName: members.firstName,
			lastName: members.lastName,
			status: members.status,
		})
		.from(members);
	const beitragMembers = allMembers.filter((m) =>
		isBeitragspflichtig(m.status),
	);
	if (!beitragMembers.length) return 0;
	await db
		.insert(semesterbeitragCharges)
		.values(
			beitragMembers.map((m) => ({
				runId,
				memberId: m.id,
				memberName: `${m.firstName} ${m.lastName}`,
				baseAmount: round2(baseAmount),
			})),
		)
		.onConflictDoNothing();
	return beitragMembers.length;
}

export async function createBeitragRun(input: {
	name: string;
	etaplanId: string;
	kostenpunktId: string;
	amount: number;
	mahnungFee: number;
	dueDate: Date;
}) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const parsed = createRunSchema.parse(input);
		const runId = crypto.randomUUID();
		await db.insert(semesterbeitragRuns).values({
			id: runId,
			name: parsed.name,
			etaplanId: parsed.etaplanId,
			kostenpunktId: parsed.kostenpunktId,
			amount: round2(parsed.amount),
			mahnungFee: round2(parsed.mahnungFee),
			dueDate: parsed.dueDate,
			createdBy: guard.userId,
		});
		const chargesCreated = await insertCharges(runId, parsed.amount);
		revalidatePath("/cc-kasse");
		return { success: true as const, data: { runId, chargesCreated } };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error creating Beitragslauf:", error);
		return { success: false as const, error: "Fehler beim Erstellen" };
	}
}

// Add charges for beitragspflichtige members who don't yet have one (e.g. a
// member became beitragspflichtig after the run was created).
export async function regenerateCharges(runId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) return { success: false as const, error: "Lauf nicht gefunden" };
	const added = await insertCharges(runId, run.amount);
	revalidatePath("/cc-kasse");
	return { success: true as const, data: { checked: added } };
}

// Delete a run created by mistake. Blocked once any Beitrag is paid — paid
// charges are financial records (they count as Ist-Einnahmen in the Etatplan
// overview). Open/gemahnte charges are removed with the run.
export async function deleteBeitragRun(runId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const run = await db.query.semesterbeitragRuns.findFirst({
			where: (t, { eq }) => eq(t.id, runId),
		});
		if (!run) return { success: false as const, error: "Lauf nicht gefunden" };
		const [row] = await db
			.select({ c: sql<number>`count(*)` })
			.from(semesterbeitragCharges)
			.where(
				and(
					eq(semesterbeitragCharges.runId, runId),
					eq(semesterbeitragCharges.status, "Bezahlt"),
				),
			);
		if (Number(row?.c ?? 0) > 0) {
			return {
				success: false as const,
				error:
					"Der Lauf hat bereits bezahlte Beiträge und kann nicht gelöscht werden.",
			};
		}
		// Explicit charge delete first — don't rely on FK cascade being enforced.
		await db
			.delete(semesterbeitragCharges)
			.where(eq(semesterbeitragCharges.runId, runId));
		await db
			.delete(semesterbeitragRuns)
			.where(eq(semesterbeitragRuns.id, runId));
		revalidatePath("/cc-kasse");
		return { success: true as const };
	} catch (error) {
		console.error("Error deleting Beitragslauf:", error);
		return { success: false as const, error: "Fehler beim Löschen" };
	}
}

// ─── Charges ──────────────────────────────────────────────────────────────────

export async function listChargesForRun(runId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return null;
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) return null;
	const charges = await db.query.semesterbeitragCharges.findMany({
		where: (t, { eq }) => eq(t.runId, runId),
		orderBy: (t, { asc }) => [asc(t.memberName)],
		with: {
			member: { columns: { id: true, email: true, status: true } },
		},
	});
	const now = Date.now();
	const due = run.dueDate.getTime();
	return {
		run,
		charges: charges.map((c) => ({
			...c,
			total: round2(c.baseAmount + c.mahnungAmount),
			hasEmail: !!c.member?.email,
			ueberfaellig: c.status === "Offen" && due < now,
		})),
	};
}

export type ChargesForRun = NonNullable<
	Awaited<ReturnType<typeof listChargesForRun>>
>;
export type ChargeListItem = ChargesForRun["charges"][number];

export async function markChargePaid(chargeId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	await db
		.update(semesterbeitragCharges)
		.set({ status: "Bezahlt", paidAt: new Date(), paidBy: guard.userId })
		.where(eq(semesterbeitragCharges.id, chargeId));
	revalidatePath("/cc-kasse");
	return { success: true as const };
}

export async function markChargeUnpaid(chargeId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	const charge = await db.query.semesterbeitragCharges.findFirst({
		where: (t, { eq }) => eq(t.id, chargeId),
		columns: { id: true, mahnungSentAt: true },
	});
	if (!charge) return { success: false as const, error: "Nicht gefunden" };
	await db
		.update(semesterbeitragCharges)
		.set({
			status: charge.mahnungSentAt ? "Gemahnt" : "Offen",
			paidAt: null,
			paidBy: null,
		})
		.where(eq(semesterbeitragCharges.id, chargeId));
	revalidatePath("/cc-kasse");
	return { success: true as const };
}

// ─── Email / Mahnung send loops ───────────────────────────────────────────────

export async function sendBeitragEmails(
	runId: string,
	opts?: { onlyUnsent?: boolean },
) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	const onlyUnsent = opts?.onlyUnsent ?? true;
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) return { success: false as const, error: "Lauf nicht gefunden" };

	const charges = await db.query.semesterbeitragCharges.findMany({
		where: (t, { eq }) => eq(t.runId, runId),
		with: { member: { columns: { email: true } } },
	});

	let emailed = 0;
	let lettersPending = 0;
	let failed = 0;
	for (const c of charges) {
		if (onlyUnsent && c.emailSentAt) continue;
		try {
			const pdf = await generateBeitragPDF(c.id, { isMahnung: false });
			if (!pdf.success) {
				failed++;
				continue;
			}
			const email = c.member?.email;
			if (email) {
				await sendBeitragEmail(
					email,
					c.memberName,
					run.name,
					c.baseAmount + c.mahnungAmount,
					pdf.pdfContent,
					pdf.fileName,
				);
				await db
					.update(semesterbeitragCharges)
					.set({ emailSentAt: new Date(), deliveryMethod: "email" })
					.where(eq(semesterbeitragCharges.id, c.id));
				emailed++;
			} else {
				await db
					.update(semesterbeitragCharges)
					.set({ deliveryMethod: "letter" })
					.where(eq(semesterbeitragCharges.id, c.id));
				lettersPending++;
			}
		} catch (err) {
			console.error("Beitrag send failed for charge", c.id, err);
			failed++;
		}
	}
	revalidatePath("/cc-kasse");
	return { success: true as const, emailed, lettersPending, failed };
}

export async function sendMahnungen(runId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) return { success: false as const, error: "Lauf nicht gefunden" };
	if (run.dueDate.getTime() >= Date.now()) {
		return {
			success: false as const,
			error: "Fälligkeitsdatum noch nicht erreicht.",
		};
	}

	// Overdue + unpaid + not yet mahnt.
	const charges = await db.query.semesterbeitragCharges.findMany({
		where: (t, { and, eq }) => and(eq(t.runId, runId), eq(t.status, "Offen")),
		with: { member: { columns: { email: true } } },
	});

	let emailed = 0;
	let lettersPending = 0;
	let failed = 0;
	let processed = 0;
	for (const c of charges) {
		if (c.mahnungSentAt) continue;
		try {
			await db
				.update(semesterbeitragCharges)
				.set({
					status: "Gemahnt",
					mahnungAmount: run.mahnungFee,
					mahnungSentAt: new Date(),
				})
				.where(eq(semesterbeitragCharges.id, c.id));
			processed++;

			const pdf = await generateBeitragPDF(c.id, { isMahnung: true });
			if (!pdf.success) {
				failed++;
				continue;
			}
			const email = c.member?.email;
			if (email) {
				await sendMahnungEmail(
					email,
					c.memberName,
					run.name,
					c.baseAmount + run.mahnungFee,
					pdf.pdfContent,
					pdf.fileName,
				);
				await db
					.update(semesterbeitragCharges)
					.set({ deliveryMethod: "email" })
					.where(eq(semesterbeitragCharges.id, c.id));
				emailed++;
			} else {
				await db
					.update(semesterbeitragCharges)
					.set({ deliveryMethod: "letter" })
					.where(eq(semesterbeitragCharges.id, c.id));
				lettersPending++;
			}
		} catch (err) {
			console.error("Mahnung send failed for charge", c.id, err);
			failed++;
		}
	}
	revalidatePath("/cc-kasse");
	return { success: true as const, processed, emailed, lettersPending, failed };
}

export async function downloadChargePdf(
	chargeId: string,
	opts?: { isMahnung?: boolean },
) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	const pdf = await generateBeitragPDF(chargeId, {
		isMahnung: opts?.isMahnung ?? false,
	});
	if (!pdf.success) return { success: false as const, error: pdf.error };
	return {
		success: true as const,
		base64: pdf.pdfContent.toString("base64"),
		fileName: pdf.fileName,
	};
}
