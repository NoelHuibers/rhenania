// service.ts — the Semesterbeitrag: runs, their charges, invoices and
// reminders (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. Who owes the Beitrag is the members
// module's rule; the letter itself is domain/semesterbeitrag/beitrag-pdf.

import "server-only";

import { z } from "zod";
import { roundToCent } from "~/lib/money";
import { renderBeitragPdf } from "~/server/domain/semesterbeitrag/beitrag-pdf";
import {
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { getTenantById } from "~/server/lib/tenant-context";
import type { TenantScope } from "~/server/lib/tenant-scope";
import {
	sendBeitragEmail,
	sendMahnungEmail,
} from "~/server/modules/mail/service";
import { beitragspflichtigeMembers } from "~/server/modules/members/service";
import * as repo from "./repo";

export type { BeitragRun } from "./repo";

const RUN_NOT_FOUND = "Lauf nicht gefunden";

async function findRun({ db }: TenantScope, runId: string) {
	const run = await repo.findRun(db, runId);
	if (!run) {
		throw new NotFoundError(RUN_NOT_FOUND);
	}
	return run;
}

// ─── Runs ────────────────────────────────────────────────────────────────────

/** Every run, newest first. */
export async function listRuns({ db }: TenantScope) {
	return repo.listRuns(db);
}

/**
 * Charges every beitragspflichtige member who has no charge in the run yet
 * and answers how many members owe the Beitrag.
 */
async function insertCharges(
	tenant: TenantScope,
	runId: string,
	baseAmount: number,
): Promise<number> {
	const owing = await beitragspflichtigeMembers(tenant);
	if (!owing.length) {
		return 0;
	}
	await repo.insertCharges(
		tenant.db,
		owing.map((m) => ({
			runId,
			memberId: m.id,
			memberName: `${m.firstName} ${m.lastName}`,
			baseAmount: roundToCent(baseAmount),
		})),
	);
	return owing.length;
}

export const createRunSchema = z.object({
	name: z.string().min(1, "Name erforderlich").max(255),
	etaplanId: z.string().min(1, "Etatplan erforderlich"),
	kostenpunktId: z.string().min(1, "Kostenpunkt erforderlich"),
	amount: z.number().positive().max(100000),
	mahnungFee: z.number().min(0).max(100000),
	dueDate: z.date(),
});

/** Starts a run and charges every member who owes the Beitrag. */
export async function createRun(
	tenant: TenantScope,
	actor: { id: string },
	input: z.infer<typeof createRunSchema>,
) {
	// Paid charges count as Ist-Einnahmen of the Kostenpunkt within the run's
	// Etatplan; a Kostenpunkt of another plan would hide them from both.
	const kp = await repo.kostenpunktPlan(tenant.db, input.kostenpunktId);
	if (!kp) {
		throw new NotFoundError("Kostenpunkt nicht gefunden");
	}
	if (kp.etaplanId !== input.etaplanId) {
		throw new ValidationError(
			"Der Kostenpunkt gehört nicht zum gewählten Etatplan.",
		);
	}
	const runId = crypto.randomUUID();
	await repo.insertRun(tenant.db, {
		id: runId,
		name: input.name,
		etaplanId: input.etaplanId,
		kostenpunktId: input.kostenpunktId,
		amount: roundToCent(input.amount),
		mahnungFee: roundToCent(input.mahnungFee),
		dueDate: input.dueDate,
		createdBy: actor.id,
	});
	const chargesCreated = await insertCharges(tenant, runId, input.amount);
	return { runId, chargesCreated };
}

/**
 * Adds charges for beitragspflichtige members who don't yet have one (e.g.
 * a member became beitragspflichtig after the run was created).
 */
export async function regenerateCharges(tenant: TenantScope, runId: string) {
	const run = await findRun(tenant, runId);
	const added = await insertCharges(tenant, runId, run.amount);
	return { checked: added };
}

/**
 * Deletes a run created by mistake. Blocked once any Beitrag is paid —
 * paid charges are financial records (they count as Ist-Einnahmen in the
 * Etatplan overview). Open/gemahnte charges are removed with the run.
 */
export async function deleteRun(tenant: TenantScope, runId: string) {
	await findRun(tenant, runId);
	if ((await repo.countPaidCharges(tenant.db, runId)) > 0) {
		throw new ConflictError(
			"Der Lauf hat bereits bezahlte Beiträge und kann nicht gelöscht werden.",
		);
	}
	await repo.deleteRun(tenant.db, runId);
}

// ─── Charges ─────────────────────────────────────────────────────────────────

/** The run with its charges, totals and overdue flags; null if there is no run. */
export async function chargesForRun({ db, now }: TenantScope, runId: string) {
	const run = await repo.findRun(db, runId);
	if (!run) {
		return null;
	}
	const charges = await repo.chargesOfRun(db, runId);
	const nowMs = now().getTime();
	const due = run.dueDate.getTime();
	return {
		run,
		charges: charges.map((c) => ({
			...c,
			total: roundToCent(c.baseAmount + c.mahnungAmount),
			hasEmail: !!c.member?.email,
			ueberfaellig: c.status === "Offen" && due < nowMs,
		})),
	};
}

export type ChargesForRun = NonNullable<
	Awaited<ReturnType<typeof chargesForRun>>
>;
export type ChargeListItem = ChargesForRun["charges"][number];

export async function markPaid(
	{ db, now }: TenantScope,
	actor: { id: string },
	chargeId: string,
) {
	await repo.updateCharge(db, chargeId, {
		status: "Bezahlt",
		paidAt: now(),
		paidBy: actor.id,
	});
}

export async function markDeferred({ db }: TenantScope, chargeId: string) {
	await repo.updateCharge(db, chargeId, {
		status: "Gestundet",
		paidAt: null,
		paidBy: null,
	});
}

/** Back to Offen, or to Gemahnt if its reminder went out. */
export async function markUnpaid({ db }: TenantScope, chargeId: string) {
	const charge = await repo.chargeReminder(db, chargeId);
	if (!charge) {
		throw new NotFoundError("Nicht gefunden");
	}
	await repo.updateCharge(db, chargeId, {
		status: charge.mahnungSentAt ? "Gemahnt" : "Offen",
		paidAt: null,
		paidBy: null,
	});
}

// ─── Invoices and reminders ──────────────────────────────────────────────────

/**
 * The Beitrag invoice (or reminder) of a charge as a PDF. Throws a
 * NotFoundError when the charge or an active CC-Kasse account is missing.
 */
export async function chargePdf(
	tenant: TenantScope,
	chargeId: string,
	opts?: { isMahnung?: boolean },
): Promise<{ pdfContent: Buffer; fileName: string }> {
	const charge = await repo.chargeWithRun(tenant.db, chargeId);
	if (!charge?.run) {
		throw new NotFoundError("Beitrag nicht gefunden");
	}
	const konto = await repo.activeCcKasseKonto(tenant.db);
	if (!konto) {
		throw new NotFoundError("Kein aktives CC-Kasse-Konto hinterlegt.");
	}
	const corps = await getTenantById(tenant.tenantId);
	return renderBeitragPdf({
		charge,
		run: charge.run,
		member: charge.member,
		konto,
		tenantName: corps?.displayName ?? "Corps",
		today: tenant.now(),
		isMahnung: opts?.isMahnung ?? false,
	});
}

/** A charge that could not be sent; counted, and logged unless expected. */
function logSendFailure(what: string, chargeId: string, err: unknown) {
	// A missing CC-Kasse account or charge is the user's to fix, not a bug.
	if (!(err instanceof DomainError)) {
		console.error(`${what} send failed for charge`, chargeId, err);
	}
}

/**
 * Sends the invoices of a run: by mail to members with an address, the
 * rest are marked for a letter. Paid charges never get an invoice (again);
 * `onlyUnsent` skips charges already mailed.
 */
export async function sendInvoices(
	tenant: TenantScope,
	runId: string,
	onlyUnsent: boolean,
) {
	const { db } = tenant;
	const run = await findRun(tenant, runId);
	const charges = await repo.unpaidChargesOfRun(db, runId);

	let emailed = 0;
	let lettersPending = 0;
	let failed = 0;
	for (const c of charges) {
		if (onlyUnsent && c.emailSentAt) {
			continue;
		}
		try {
			const pdf = await chargePdf(tenant, c.id, { isMahnung: false });
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
				await repo.updateCharge(db, c.id, {
					emailSentAt: tenant.now(),
					deliveryMethod: "email",
				});
				emailed++;
			} else {
				await repo.updateCharge(db, c.id, { deliveryMethod: "letter" });
				lettersPending++;
			}
		} catch (err) {
			logSendFailure("Beitrag", c.id, err);
			failed++;
		}
	}
	return { emailed, lettersPending, failed };
}

/**
 * Reminds the open charges of an overdue run, adding the run's fee.
 * Deferred charges are deliberately excluded.
 */
export async function sendReminders(tenant: TenantScope, runId: string) {
	const { db } = tenant;
	const run = await findRun(tenant, runId);
	if (run.dueDate.getTime() >= tenant.now().getTime()) {
		throw new ConflictError("Fälligkeitsdatum noch nicht erreicht.");
	}
	const charges = await repo.openChargesOfRun(db, runId);

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
			const pdf = await chargePdf(tenant, c.id, { isMahnung: true });
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
			await repo.markReminded(db, c.id, {
				mahnungAmount: run.mahnungFee,
				mahnungSentAt: tenant.now(),
				deliveryMethod: email ? "email" : "letter",
			});
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
}
