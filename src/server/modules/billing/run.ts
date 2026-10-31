// run.ts — the Getränke billing run (service, #33).
//
// Bills every unbilled order, carries open bills over and charges an
// inventory loss as Umlage. Only server code passes a loss: the Kasse's
// "Neue Rechnung" runs without one, "Inventur + Rechnung" passes the loss
// of the inventory it has just closed. A value a browser can send must
// never decide it (#10).
//
// Umlage (owner's decision, #10): the loss is carried by every active
// Hausbewohner of the tenant, split evenly by headcount in whole cents and
// rounded down. Hausbewohner who ordered nothing get an Umlage-only bill;
// nobody else pays Umlage. The rounding remainder (less than one cent per
// Hausbewohner) is not charged; the Kasse absorbs it.
//
// Round trips (#23): the run reads everything in one batch, plans the bills
// in memory (server/domain/billing/plan.ts, shared with the Fuchsenladen)
// and writes them in one atomic write batch, however many members there
// are. Nothing holds the write lock between round trips. The PDFs are
// rendered from memory and mailed after the commit, a few at a time.

import "server-only";

import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { fromCents, toCents } from "~/lib/money";
import {
	sendBillNotificationEmail,
	sendTreasurerBillEmail,
} from "~/server/actions/newuser/email";
import { billPeriods, type orders } from "~/server/db/schema";
import {
	GETRAENKE_RULES,
	planBillingRun,
	umlagePerMember,
} from "~/server/domain/billing/plan";
import {
	type GetraenkeBillSender,
	incompleteBillingMessage,
} from "~/server/domain/getraenkekasse/payment";
import {
	BILLING_CONFLICT_MESSAGE,
	isConstraintOn,
} from "~/server/lib/billing-batch";
import { ConflictError, DomainError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import type { TenantScope } from "~/server/lib/tenant-scope";
import { buildUserBillData } from "~/server/lib/user-bill-data";
import {
	renderUserBillPDF,
	userBillPdfFileName,
} from "~/server/lib/user-bill-pdf";
import {
	billRecipient,
	billSender,
} from "~/server/modules/getraenkekasse/service";
import * as repo from "./repo";

/** The role whose members carry the inventory-loss Umlage. */
const HAUSBEWOHNER_ROLE = "Hausbewohner";

/** Bill mails rendered and sent at the same time. */
const MAIL_CONCURRENCY = 4;

/** Every failure of a run the user reads; inventur and the Kasse show it. */
const BILLING_FAILED = "BILLING_FAILED";

const RUN_FAILED_MESSAGE = "Fehler beim Erstellen der Rechnungen";

type OrderWithDetails = typeof orders.$inferSelect;

export interface UserBillingSummary {
	userId: string;
	userName: string;
	orders: OrderWithDetails[];
	drinksTotal: number;
	oldBillingAmount: number;
	fees: number;
	umlage: number;
	finalTotal: number;
}

/**
 * The active Hausbewohner of the tenant (id → name): members with the role
 * in the tenant DB whose membership in the control DB is active. Suspended
 * and pending members are left out.
 */
async function activeHausbewohner(
	tenantId: string,
	holders: repo.RunState["roleHolders"],
): Promise<Map<string, string>> {
	if (holders.length === 0) {
		return new Map();
	}
	const activeIds = await repo.activeMemberIds(
		tenantId,
		holders.map((h) => h.id),
	);
	return new Map(
		holders.filter((h) => activeIds.has(h.id)).map((h) => [h.id, h.name ?? ""]),
	);
}

/**
 * Every row the run writes, and what it reports and mails: the shared plan
 * (domain/billing) with the Getränke rules, as bill and bill_item rows.
 */
function planRows(
	state: repo.RunState,
	{
		now,
		billPeriodId,
		hausbewohner,
		umlage,
	}: {
		now: Date;
		billPeriodId: string;
		hausbewohner: Map<string, string>;
		umlage: number;
	},
) {
	const plan = planBillingRun({
		unbilledOrders: state.unbilledOrders.map((o) => ({
			...o,
			name: o.drinkName,
		})),
		outstandingBills: state.outstanding,
		rules: GETRAENKE_RULES,
		umlage: { perMember: umlage, members: hausbewohner },
	});

	const toRows = (bill: (typeof plan.bills)[number]) => ({
		row: {
			id: bill.id,
			billPeriodId,
			userId: bill.userId,
			userName: bill.userName,
			status: "Unbezahlt" as const,
			oldBillingAmount: bill.oldBillingAmount,
			fees: bill.fees,
			umlage: bill.umlage,
			drinksTotal: bill.ordersTotal,
			total: bill.total,
			createdAt: now,
		},
		items: bill.lines.map((line) => ({
			id: line.id,
			billId: line.billId,
			drinkName: line.name,
			amount: line.amount,
			pricePerDrink: line.pricePerUnit,
			totalPricePerDrink: line.total,
			createdAt: now,
		})),
	});
	const members = plan.bills.filter((b) => b.kind === "member");

	return {
		memberBills: members.map(toRows),
		eventBills: plan.bills.filter((b) => b.kind === "group").map(toRows),
		userBillingSummaries: members.map(
			(bill): UserBillingSummary => ({
				userId: bill.userId,
				userName: bill.userName,
				orders: bill.orders.map(({ name: _name, ...order }) => order),
				drinksTotal: bill.ordersTotal,
				oldBillingAmount: bill.oldBillingAmount,
				fees: bill.fees,
				umlage: bill.umlage,
				finalTotal: bill.total,
			}),
		),
		// Members whose old bills move into their new one.
		settledUserIds: plan.settleUserIds,
		orderIds: plan.orderIds,
		totalAmount: plan.periodTotal,
	};
}

type BillingPlan = ReturnType<typeof planRows>;

export type BillingRunResult =
	| {
			success: true;
			message: string;
			billsCreated: 0;
			eventBillsCreated: 0;
			totalAmount: 0;
	  }
	| {
			success: true;
			message: string;
			billPeriod: { id: string; billNumber: string };
			billsCreated: number;
			eventBillsCreated: number;
			totalAmount: number;
			userSummaries: UserBillingSummary[];
			createdBillIds: string[];
	  };

/**
 * Bills every unbilled order, carries open bills over and charges
 * `inventoryLoss` as Umlage to the active Hausbewohner, on behalf of
 * `actor`. Throws a DomainError with code BILLING_FAILED and a message for
 * the user when the run is refused or fails; nothing is written then.
 */
export async function runGetraenkeBilling(
	scope: TenantScope,
	actor: { id: string },
	{ inventoryLoss }: { inventoryLoss: number },
): Promise<BillingRunResult> {
	// Bills print the tenant's sender and account. Without them, refuse
	// before any bill exists rather than mailing bills without a payee.
	const sender = await billSender(scope);
	if (!sender.ok) {
		throw new DomainError(
			incompleteBillingMessage(sender.missing),
			BILLING_FAILED,
		);
	}

	try {
		return await billAndMail(scope, actor, inventoryLoss, sender.sender);
	} catch (error) {
		if (error instanceof DomainError) {
			throw error;
		}
		await log.error("billing run failed", { err: error });
		throw new DomainError(RUN_FAILED_MESSAGE, BILLING_FAILED);
	}
}

async function billAndMail(
	scope: TenantScope,
	actor: { id: string },
	inventoryLoss: number,
	sender: GetraenkeBillSender,
): Promise<BillingRunResult> {
	const { db, tenantId } = scope;
	// Whole seconds, as stored, so the mailed PDFs show what the database
	// holds.
	const now = new Date(Math.floor(scope.now().getTime() / 1000) * 1000);
	const base = billNumberBase(now);
	const state = await repo.readRunState(db, {
		billNumberPrefix: base,
		umlageRole: HAUSBEWOHNER_ROLE,
	});

	// The Umlage share: the loss split evenly over the active Hausbewohner,
	// rounded down to whole cents. A gain (negative loss) is not paid out.
	const lossCents = Math.max(0, toCents(inventoryLoss));
	const hausbewohner =
		lossCents > 0
			? await activeHausbewohner(tenantId, state.roleHolders)
			: new Map<string, string>();
	const umlage = umlagePerMember(inventoryLoss, hausbewohner.size);

	// An Umlage to charge is reason enough for a run, orders or not.
	if (state.unbilledOrders.length === 0 && umlage === 0) {
		return {
			success: true,
			message: "Keine unbezahlten Bestellungen gefunden",
			billsCreated: 0,
			totalAmount: 0,
			eventBillsCreated: 0,
		};
	}

	const period = {
		id: crypto.randomUUID(),
		billNumber: nextBillNumber(base, state.billNumbers),
		createdBy: actor.id,
		now,
	};
	const plan = planRows(state, {
		now,
		billPeriodId: period.id,
		hausbewohner,
		umlage,
	});
	const allBills = [...plan.memberBills, ...plan.eventBills];
	try {
		await repo.writeRun(db, {
			period: { ...period, totalAmount: plan.totalAmount },
			read: state,
			bills: allBills.map((b) => b.row),
			items: allBills.flatMap((b) => b.items),
			settledUserIds: plan.settledUserIds,
			orderIds: plan.orderIds,
		});
	} catch (error) {
		// The bill number was taken by another run (UNIQUE) or nulled by the
		// check for changed data (NOT NULL).
		if (!isConstraintOn(error, billPeriods, billPeriods.billNumber)) {
			throw error;
		}
		await log.warn("billing run conflicted with a concurrent change", {
			err: error,
		});
		throw new ConflictError(BILLING_CONFLICT_MESSAGE, BILLING_FAILED);
	}

	const billsCreated = plan.memberBills.length;
	const eventBillsCreated = plan.eventBills.length;
	await log.info("billing run completed", {
		bills: billsCreated,
		eventBills: eventBillsCreated,
		total: plan.totalAmount,
		inventoryLoss: fromCents(lossCents),
		umlagePerHausbewohner: umlage,
		hausbewohner: hausbewohner.size,
	});

	// Send the new bills by mail, now that they are committed.
	try {
		await mailBills(scope, plan, period, sender);
	} catch (notifyError) {
		await log.error("billing run: mail phase failed", { err: notifyError });
	}

	return {
		success: true,
		message: `Erfolgreich ${billsCreated + eventBillsCreated} Rechnungen erstellt`,
		billPeriod: { id: period.id, billNumber: period.billNumber },
		billsCreated,
		eventBillsCreated,
		totalAmount: plan.totalAmount,
		userSummaries: plan.userBillingSummaries,
		createdBillIds: allBills.map((b) => b.row.id),
	};
}

/** Runs `task` for every item, at most `limit` at a time, in item order. */
async function forEachLimited<T>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<void>,
) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++] as T;
			await task(item);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
}

/** SQLite's BINARY order of text (UTF-8 bytes), as `ORDER BY` sorts it. */
function byBytes(a: string, b: string) {
	return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

type PlannedBill = BillingPlan["memberBills"][number];
type MailJob = {
	bill: PlannedBill;
	/** Who the mail goes to, for the log line when it fails. */
	to: "member" | "treasurer";
	send: (pdf: Buffer, fileName: string) => Promise<void>;
};

/**
 * Mails the new bills: to the treasurer when the tenant chose that (feature
 * `billing.treasurerRecipient`), otherwise to each member who hasn't opted
 * out. The PDFs are rendered from the rows just written, so the mails need
 * no further reads per bill. A failed mail is logged and skipped.
 */
async function mailBills(
	scope: TenantScope,
	plan: BillingPlan,
	period: { billNumber: string; now: Date },
	sender: GetraenkeBillSender,
) {
	const { billNumber } = period;
	const recipient = await billRecipient(scope);
	const jobs: MailJob[] = [];

	if (recipient.mode === "treasurer") {
		// Every bill of the period — member and group bills alike — as its
		// own message, by name. Members get no mail in this mode.
		const periodBills = [...plan.memberBills, ...plan.eventBills].sort((a, b) =>
			byBytes(a.row.userName, b.row.userName),
		);
		for (const bill of periodBills) {
			jobs.push({
				bill,
				to: "treasurer",
				send: (pdf, fileName) =>
					sendTreasurerBillEmail(
						recipient.email,
						bill.row.userName,
						billNumber,
						bill.row.total,
						pdf,
						fileName,
					),
			});
		}
	} else {
		// Users without a preference row default to enabled.
		const recipients = await repo.mailRecipients(
			scope.db,
			plan.memberBills.map((b) => b.row.userId),
		);
		const byId = new Map(recipients.map((r) => [r.id, r]));
		for (const bill of plan.memberBills) {
			const user = byId.get(bill.row.userId);
			if (!user || (user.emailPref !== null && user.emailPref !== "true")) {
				continue;
			}
			jobs.push({
				bill,
				to: "member",
				send: (pdf, fileName) =>
					sendBillNotificationEmail(
						user.email,
						bill.row.userName,
						billNumber,
						bill.row.total,
						pdf,
						fileName,
						// Same Zahlungsziel the PDF prints (#184).
						sender.paymentDueDays,
					),
			});
		}
	}

	let failed = 0;
	await forEachLimited(jobs, MAIL_CONCURRENCY, async ({ bill, to, send }) => {
		let pdf: Buffer;
		try {
			pdf = renderUserBillPDF(
				buildUserBillData(
					{ ...bill.row, paidAt: null },
					{ billNumber, createdAt: period.now },
					[...bill.items].sort((a, b) => byBytes(a.drinkName, b.drinkName)),
				),
				sender,
			);
		} catch (pdfError) {
			failed++;
			await log.error("bill pdf failed", {
				billId: bill.row.id,
				err: pdfError,
			});
			return;
		}
		try {
			await send(pdf, userBillPdfFileName(billNumber, bill.row.userName));
		} catch (emailError) {
			// Log but don't fail the whole billing process
			failed++;
			await log.error("bill mail failed", {
				billId: bill.row.id,
				to,
				err: emailError,
			});
		}
	});
	await log.info("billing mails sent", {
		mode: recipient.mode,
		sent: jobs.length - failed,
		failed,
	});
}
