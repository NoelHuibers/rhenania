"use server";

// The Semesterbeitrag (CC-Kasse): runs, their charges, invoices and
// reminders. The lists are read by the page loader; the mutations answer
// with an ActionResult (#216).

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { roundToCent } from "~/lib/money";
import { db } from "~/server/db";
import {
	kostenpunkte,
	members,
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { makeBeitragspflichtigMatcher } from "~/server/domain/members/statuses";
import { defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import {
	sendBeitragEmail,
	sendMahnungEmail,
} from "~/server/modules/mail/service";
import { memberStatuses } from "~/server/modules/members/service";
import { BEITRAG_ROLES, requireRoles } from "./_guards";
import { generateBeitragPDF } from "./beitragPDF";

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function listBeitragRuns() {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) {
		return [];
	}
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
	tenant: TenantScope,
	runId: string,
	baseAmount: number,
): Promise<number> {
	const { db } = tenant;
	const isBeitragspflichtig = makeBeitragspflichtigMatcher(
		await memberStatuses(tenant),
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
	if (!beitragMembers.length) {
		return 0;
	}
	await db
		.insert(semesterbeitragCharges)
		.values(
			beitragMembers.map((m) => ({
				runId,
				memberId: m.id,
				memberName: `${m.firstName} ${m.lastName}`,
				baseAmount: roundToCent(baseAmount),
			})),
		)
		.onConflictDoNothing();
	return beitragMembers.length;
}

const RUN_NOT_FOUND = "Lauf nicht gefunden";

async function findRun(db: TenantDb, runId: string) {
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) {
		throw new NotFoundError(RUN_NOT_FOUND);
	}
	return run;
}

export const createBeitragRun = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([createRunSchema]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => {
		// Paid charges count as Ist-Einnahmen of the Kostenpunkt within the run's
		// Etatplan; a Kostenpunkt of another plan would hide them from both.
		const [kp] = await tenant.db
			.select({ etaplanId: kostenpunkte.etaplanId })
			.from(kostenpunkte)
			.where(eq(kostenpunkte.id, input.kostenpunktId))
			.limit(1);
		if (!kp) {
			throw new NotFoundError("Kostenpunkt nicht gefunden");
		}
		if (kp.etaplanId !== input.etaplanId) {
			throw new ValidationError(
				"Der Kostenpunkt gehört nicht zum gewählten Etatplan.",
			);
		}
		const runId = crypto.randomUUID();
		await tenant.db.insert(semesterbeitragRuns).values({
			id: runId,
			name: input.name,
			etaplanId: input.etaplanId,
			kostenpunktId: input.kostenpunktId,
			amount: roundToCent(input.amount),
			mahnungFee: roundToCent(input.mahnungFee),
			dueDate: input.dueDate,
			createdBy: user.id,
		});
		const chargesCreated = await insertCharges(tenant, runId, input.amount);
		return { runId, chargesCreated };
	},
);

// Add charges for beitragspflichtige members who don't yet have one (e.g. a
// member became beitragspflichtig after the run was created).
export const regenerateCharges = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
	},
	async ([runId], { tenant }) => {
		const run = await findRun(tenant.db, runId);
		const added = await insertCharges(tenant, runId, run.amount);
		return { checked: added };
	},
);

// Delete a run created by mistake. Blocked once any Beitrag is paid — paid
// charges are financial records (they count as Ist-Einnahmen in the Etatplan
// overview). Open/gemahnte charges are removed with the run.
export const deleteBeitragRun = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
		errorMessage: "Fehler beim Löschen",
	},
	async ([runId], { tenant }) => {
		await findRun(tenant.db, runId);
		const [row] = await tenant.db
			.select({ c: sql<number>`count(*)` })
			.from(semesterbeitragCharges)
			.where(
				and(
					eq(semesterbeitragCharges.runId, runId),
					eq(semesterbeitragCharges.status, "Bezahlt"),
				),
			);
		if (Number(row?.c ?? 0) > 0) {
			throw new ConflictError(
				"Der Lauf hat bereits bezahlte Beiträge und kann nicht gelöscht werden.",
			);
		}
		// Explicit charge delete first — don't rely on FK cascade being enforced.
		await tenant.db
			.delete(semesterbeitragCharges)
			.where(eq(semesterbeitragCharges.runId, runId));
		await tenant.db
			.delete(semesterbeitragRuns)
			.where(eq(semesterbeitragRuns.id, runId));
	},
);

// ─── Charges ──────────────────────────────────────────────────────────────────

export async function listChargesForRun(runId: string) {
	const guard = await requireRoles(BEITRAG_ROLES);
	if (!guard.ok) {
		return null;
	}
	const run = await db.query.semesterbeitragRuns.findFirst({
		where: (t, { eq }) => eq(t.id, runId),
	});
	if (!run) {
		return null;
	}
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
			total: roundToCent(c.baseAmount + c.mahnungAmount),
			hasEmail: !!c.member?.email,
			ueberfaellig: c.status === "Offen" && due < now,
		})),
	};
}

export type ChargesForRun = NonNullable<
	Awaited<ReturnType<typeof listChargesForRun>>
>;
export type ChargeListItem = ChargesForRun["charges"][number];

export const markChargePaid = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
	},
	async ([chargeId], { tenant, user }) => {
		await tenant.db
			.update(semesterbeitragCharges)
			.set({ status: "Bezahlt", paidAt: tenant.now(), paidBy: user.id })
			.where(eq(semesterbeitragCharges.id, chargeId));
	},
);

export const markChargeDeferred = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
	},
	async ([chargeId], { tenant }) => {
		await tenant.db
			.update(semesterbeitragCharges)
			.set({ status: "Gestundet", paidAt: null, paidBy: null })
			.where(eq(semesterbeitragCharges.id, chargeId));
	},
);

export const markChargeUnpaid = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
	},
	async ([chargeId], { tenant }) => {
		const charge = await tenant.db.query.semesterbeitragCharges.findFirst({
			where: (t, { eq }) => eq(t.id, chargeId),
			columns: { id: true, mahnungSentAt: true },
		});
		if (!charge) {
			throw new NotFoundError("Nicht gefunden");
		}
		await tenant.db
			.update(semesterbeitragCharges)
			.set({
				status: charge.mahnungSentAt ? "Gemahnt" : "Offen",
				paidAt: null,
				paidBy: null,
			})
			.where(eq(semesterbeitragCharges.id, chargeId));
	},
);

// ─── Email / Mahnung send loops ───────────────────────────────────────────────

/** A charge that could not be sent; counted, and logged unless expected. */
function logSendFailure(what: string, chargeId: string, err: unknown) {
	// A missing CC-Kasse account or charge is the user's to fix, not a bug.
	if (!(err instanceof DomainError)) {
		console.error(`${what} send failed for charge`, chargeId, err);
	}
}

export const sendBeitragEmails = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([
			z.string(),
			z.object({ onlyUnsent: z.boolean().optional() }).optional(),
		]),
		revalidate: ["/cc-kasse"],
	},
	async ([runId, opts], { tenant }) => {
		const { db } = tenant;
		const onlyUnsent = opts?.onlyUnsent ?? true;
		const run = await findRun(db, runId);

		// Paid charges never get an invoice (again).
		const charges = await db.query.semesterbeitragCharges.findMany({
			where: and(
				eq(semesterbeitragCharges.runId, runId),
				ne(semesterbeitragCharges.status, "Bezahlt"),
			),
			with: { member: { columns: { email: true } } },
		});

		let emailed = 0;
		let lettersPending = 0;
		let failed = 0;
		for (const c of charges) {
			if (onlyUnsent && c.emailSentAt) {
				continue;
			}
			try {
				const pdf = await generateBeitragPDF(db, c.id, { isMahnung: false });
				const email = c.member?.email;
				if (email) {
					await sendBeitragEmail(
						tenant,
						email,
						c.memberName,
						run.name,
						c.baseAmount + c.mahnungAmount,
						pdf.pdfContent,
						pdf.fileName,
					);
					await db
						.update(semesterbeitragCharges)
						.set({ emailSentAt: tenant.now(), deliveryMethod: "email" })
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
				logSendFailure("Beitrag", c.id, err);
				failed++;
			}
		}
		return { emailed, lettersPending, failed };
	},
);

export const sendMahnungen = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/cc-kasse"],
	},
	async ([runId], { tenant }) => {
		const { db } = tenant;
		const run = await findRun(db, runId);
		if (run.dueDate.getTime() >= tenant.now().getTime()) {
			throw new ConflictError("Fälligkeitsdatum noch nicht erreicht.");
		}

		// Only open charges are reminded. Deferred charges are deliberately excluded.
		const charges = await db.query.semesterbeitragCharges.findMany({
			where: (t, { and, eq }) => and(eq(t.runId, runId), eq(t.status, "Offen")),
			with: { member: { columns: { email: true } } },
		});

		let emailed = 0;
		let lettersPending = 0;
		let failed = 0;
		let processed = 0;
		for (const c of charges) {
			if (c.mahnungSentAt) {
				continue;
			}
			processed++;
			try {
				// Build and deliver first; the charge only becomes Gemahnt (with fee
				// and mahnungSentAt) once that succeeded, so a failed reminder stays
				// Offen and is retried on the next run.
				const pdf = await generateBeitragPDF(db, c.id, { isMahnung: true });
				const email = c.member?.email;
				if (email) {
					await sendMahnungEmail(
						tenant,
						email,
						c.memberName,
						run.name,
						c.baseAmount + run.mahnungFee,
						pdf.pdfContent,
						pdf.fileName,
					);
				}
				// Guarded so a payment booked while the reminder was being sent is
				// not overwritten.
				await db
					.update(semesterbeitragCharges)
					.set({
						status: "Gemahnt",
						mahnungAmount: run.mahnungFee,
						mahnungSentAt: tenant.now(),
						deliveryMethod: email ? "email" : "letter",
					})
					.where(
						and(
							eq(semesterbeitragCharges.id, c.id),
							eq(semesterbeitragCharges.status, "Offen"),
							isNull(semesterbeitragCharges.mahnungSentAt),
						),
					);
				if (email) {
					emailed++;
				} else {
					lettersPending++;
				}
			} catch (err) {
				logSendFailure("Mahnung", c.id, err);
				failed++;
			}
		}
		return { processed, emailed, lettersPending, failed };
	},
);

export const downloadChargePdf = defineAction(
	{
		roles: BEITRAG_ROLES,
		schema: z.tuple([
			z.string(),
			z.object({ isMahnung: z.boolean().optional() }).optional(),
		]),
		errorMessage: "PDF konnte nicht erstellt werden",
	},
	async ([chargeId, opts], { tenant }) => {
		const pdf = await generateBeitragPDF(tenant.db, chargeId, {
			isMahnung: opts?.isMahnung ?? false,
		});
		return {
			base64: pdf.pdfContent.toString("base64"),
			fileName: pdf.fileName,
		};
	},
);
