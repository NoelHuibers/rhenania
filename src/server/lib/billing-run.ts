// billing-run.ts — the Getränke billing run.
//
// Deliberately not a server action: `runGetraenkeBilling` takes the inventory
// loss to charge as Umlage, and a value a browser can send must never decide
// that (#10). The Kasse's "Neue Rechnung" runs it through `createNewBilling()`
// without a loss; "Inventur + Rechnung" passes the loss it read from the
// inventory it has just closed.
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

import { and, desc, eq, inArray, isNull, ne, not, or, sql } from "drizzle-orm";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { fromCents, toCents } from "~/lib/money";
import {
	sendBillNotificationEmail,
	sendTreasurerBillEmail,
} from "~/server/actions/newuser/email";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { controlDb } from "~/server/db/control";
import { tenantMemberships } from "~/server/db/control-schema";
import {
	billItems,
	billPeriods,
	bills,
	orders,
	roles,
	userPreferences,
	userRoles,
	users,
} from "~/server/db/schema";
import {
	GETRAENKE_RULES,
	planBillingRun,
	umlagePerMember,
} from "~/server/domain/billing/plan";
import {
	BILLING_CONFLICT_MESSAGE,
	insertChunks,
	isConstraintOn,
	unchangedSince,
	writeBatch,
} from "~/server/lib/billing-batch";
import { getBillRecipient } from "~/server/lib/getraenke-settings";
import {
	type GetraenkeBillSender,
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
} from "~/server/lib/getraenkekasse-payment";
import { log } from "~/server/lib/log";
import { getTenantId } from "~/server/lib/tenant-context";
import { buildUserBillData } from "~/server/lib/user-bill-data";
import {
	renderUserBillPDF,
	userBillPdfFileName,
} from "~/server/lib/user-bill-pdf";

/** The role whose members carry the inventory-loss Umlage. */
const HAUSBEWOHNER_ROLE = "Hausbewohner";

/** Bill mails rendered and sent at the same time. */
const MAIL_CONCURRENCY = 4;

type OrderWithDetails = typeof orders.$inferSelect;
type BillRow = typeof bills.$inferInsert & {
	id: string;
	userId: string;
	userName: string;
	status: "Unbezahlt";
	oldBillingAmount: number;
	fees: number;
	umlage: number;
	drinksTotal: number;
	total: number;
};
type BillItemRow = typeof billItems.$inferInsert & {
	drinkName: string;
	amount: number;
	pricePerDrink: number;
	totalPricePerDrink: number;
};

interface UserBillingSummary {
	userId: string;
	userName: string;
	orders: OrderWithDetails[];
	drinksTotal: number;
	oldBillingAmount: number;
	fees: number;
	umlage: number;
	finalTotal: number;
}

/** Bills whose amount is still owed (and therefore carried forward). */
const isOutstanding = () =>
	or(eq(bills.status, "Unbezahlt"), eq(bills.status, "Gestundet"));

/** Everything the run computes from, read in one round trip. */
async function readBillingState(now: Date) {
	const base = billNumberBase(now);
	const [unbilledOrders, numbered, [lastOpenPeriod], outstanding, holders] =
		await db.batch([
			// Both personal and event orders.
			db
				.select()
				.from(orders)
				.where(eq(orders.inBill, false))
				.orderBy(orders.userId, orders.createdAt),
			db
				.select({ billNumber: billPeriods.billNumber })
				.from(billPeriods)
				.where(sql`${billPeriods.billNumber} LIKE ${`${base}%`}`),
			db
				.select({ id: billPeriods.id })
				.from(billPeriods)
				.where(isNull(billPeriods.closedAt))
				.orderBy(desc(billPeriods.createdAt))
				.limit(1),
			// From ALL previous periods, not just the last one: a member
			// without new orders gets skipped by intermediate billing runs, so
			// their debt can sit several periods back. Oldest first, with the
			// member's current name for a carry-only bill.
			db
				.select({
					id: bills.id,
					userId: bills.userId,
					userName: bills.userName,
					memberName: users.name,
					total: bills.total,
					status: bills.status,
				})
				.from(bills)
				.leftJoin(users, eq(users.id, bills.userId))
				.where(isOutstanding())
				.orderBy(bills.createdAt, sql`${bills}.rowid`),
			db
				.selectDistinct({ id: users.id, name: users.name })
				.from(userRoles)
				.innerJoin(roles, eq(userRoles.roleId, roles.id))
				.innerJoin(users, eq(userRoles.userId, users.id))
				.where(eq(roles.name, HAUSBEWOHNER_ROLE)),
		]);
	return {
		unbilledOrders,
		billNumber: nextBillNumber(
			base,
			numbered.map((p) => p.billNumber),
		),
		lastOpenPeriodId: lastOpenPeriod?.id ?? null,
		outstanding,
		hausbewohnerRoleHolders: holders,
	};
}

type BillingState = Awaited<ReturnType<typeof readBillingState>>;

/**
 * The active Hausbewohner of the current tenant (id → name): members with
 * the role in this tenant's DB whose membership in the control DB is active.
 * Suspended and pending members are left out.
 */
async function activeHausbewohner(
	holders: BillingState["hausbewohnerRoleHolders"],
): Promise<Map<string, string>> {
	if (holders.length === 0) {
		return new Map();
	}

	const tenantId = await getTenantId();
	if (!tenantId) {
		throw new Error("No tenant in request context");
	}
	const active = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.tenantId, tenantId),
				eq(tenantMemberships.status, "active"),
				inArray(
					tenantMemberships.userId,
					holders.map((h) => h.id),
				),
			),
		);
	const activeIds = new Set(active.map((m) => m.userId));

	return new Map(
		holders.filter((h) => activeIds.has(h.id)).map((h) => [h.id, h.name ?? ""]),
	);
}

/**
 * Every row the run writes, and what it reports and mails: the shared plan
 * (domain/billing) with the Getränke rules, as bill and bill_item rows.
 */
function planRows(
	state: BillingState,
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
			status: "Unbezahlt",
			oldBillingAmount: bill.oldBillingAmount,
			fees: bill.fees,
			umlage: bill.umlage,
			drinksTotal: bill.ordersTotal,
			total: bill.total,
			createdAt: now,
		} satisfies BillRow,
		items: bill.lines.map(
			(line): BillItemRow => ({
				id: line.id,
				billId: line.billId,
				drinkName: line.name,
				amount: line.amount,
				pricePerDrink: line.pricePerUnit,
				totalPricePerDrink: line.total,
				createdAt: now,
			}),
		),
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

/**
 * Writes the run as one atomic batch: one round trip, and the write lock is
 * held only while the batch runs. The batch fails (and rolls back) when
 * another run took the bill number or the data read has changed meanwhile.
 */
async function writeBillingRun(
	state: BillingState,
	plan: BillingPlan,
	period: {
		id: string;
		billNumber: string;
		createdBy: string;
		now: Date;
	},
) {
	const { now } = period;
	const allBills = [...plan.memberBills, ...plan.eventBills];
	const statements = [
		db.insert(billPeriods).values({
			id: period.id,
			billNumber: period.billNumber,
			totalAmount: plan.totalAmount,
			createdBy: period.createdBy,
			createdAt: now,
			updatedAt: now,
		}),
		// The optimistic check, before anything else changes: a NULL bill
		// number violates NOT NULL and fails the whole batch.
		db
			.update(billPeriods)
			.set({ billNumber: sql`NULL` })
			.where(
				and(
					eq(billPeriods.id, period.id),
					not(
						unchangedSince(
							{ billsTable: bills, outstanding: state.outstanding },
							{
								table: orders,
								stillBillable: and(
									inArray(orders.id, plan.orderIds),
									eq(orders.inBill, false),
								),
								count: plan.orderIds.length,
							},
						),
					),
				),
			),
		...(state.lastOpenPeriodId
			? [
					db
						.update(billPeriods)
						.set({ closedAt: now, updatedAt: now })
						.where(eq(billPeriods.id, state.lastOpenPeriodId)),
				]
			: []),
		...insertChunks(allBills.map((b) => b.row)).map((rows) =>
			db.insert(bills).values(rows),
		),
		...insertChunks(allBills.flatMap((b) => b.items)).map((rows) =>
			db.insert(billItems).values(rows),
		),
		// Everything outstanding outside the period being created right now.
		...(plan.settledUserIds.length > 0
			? [
					db
						.update(bills)
						.set({ status: "Übertragen", updatedAt: now })
						.where(
							and(
								inArray(bills.userId, plan.settledUserIds),
								isOutstanding(),
								ne(bills.billPeriodId, period.id),
							),
						),
				]
			: []),
		...(plan.orderIds.length > 0
			? [
					db
						.update(orders)
						.set({ inBill: true, updatedAt: now })
						.where(inArray(orders.id, plan.orderIds)),
				]
			: []),
	];
	await writeBatch(statements);
}

type BillingRunResult =
	| {
			success: false;
			message: string;
			error: string;
			billsCreated: 0;
			totalAmount: 0;
	  }
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
 * `inventoryLoss` as Umlage to the active Hausbewohner. Only server code may
 * pass a loss: the one read from the inventory just closed.
 */
export async function runGetraenkeBilling({
	inventoryLoss,
}: {
	inventoryLoss: number;
}): Promise<BillingRunResult> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}

	const createdByUserId = session.user.id;

	// Bills print the tenant's sender and account. Without them, refuse
	// before any bill exists rather than mailing bills without a payee.
	const sender = await resolveGetraenkeBillSender();
	if (!sender.ok) {
		const message = incompleteBillingMessage(sender.missing);
		return {
			success: false,
			message,
			error: message,
			billsCreated: 0,
			totalAmount: 0,
		};
	}

	try {
		// Whole seconds, as stored, so the mailed PDFs show what the
		// database holds.
		const now = new Date(Math.floor(Date.now() / 1000) * 1000);
		const state = await readBillingState(now);

		// The Umlage share: the loss split evenly over the active Hausbewohner,
		// rounded down to whole cents. A gain (negative loss) is not paid out.
		const lossCents = Math.max(0, toCents(inventoryLoss));
		const hausbewohner =
			lossCents > 0
				? await activeHausbewohner(state.hausbewohnerRoleHolders)
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
			billNumber: state.billNumber,
			createdBy: createdByUserId,
			now,
		};
		const plan = planRows(state, {
			now,
			billPeriodId: period.id,
			hausbewohner,
			umlage,
		});
		try {
			await writeBillingRun(state, plan, period);
		} catch (error) {
			// The bill number was taken by another run (UNIQUE) or nulled by
			// the check for changed data (NOT NULL).
			if (!isConstraintOn(error, billPeriods, billPeriods.billNumber)) {
				throw error;
			}
			await log.warn("billing run conflicted with a concurrent change", {
				err: error,
			});
			return {
				success: false,
				message: BILLING_CONFLICT_MESSAGE,
				error: BILLING_CONFLICT_MESSAGE,
				billsCreated: 0,
				totalAmount: 0,
			};
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
			await mailBills(plan, period, sender.sender);
		} catch (notifyError) {
			await log.error("billing run: mail phase failed", { err: notifyError });
		}

		return {
			success: true,
			message: `Erfolgreich ${
				billsCreated + eventBillsCreated
			} Rechnungen erstellt`,
			billPeriod: {
				id: period.id,
				billNumber: period.billNumber,
			},
			billsCreated,
			eventBillsCreated,
			totalAmount: plan.totalAmount,
			userSummaries: plan.userBillingSummaries,
			createdBillIds: [...plan.memberBills, ...plan.eventBills].map(
				(b) => b.row.id,
			),
		};
	} catch (error) {
		await log.error("billing run failed", { err: error });

		return {
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			error: error instanceof Error ? error.message : "Unbekannter Fehler",
			billsCreated: 0,
			totalAmount: 0,
		};
	}
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
	plan: BillingPlan,
	period: { billNumber: string; now: Date },
	sender: GetraenkeBillSender,
) {
	const { billNumber } = period;
	const recipient = await getBillRecipient();
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
		const recipients = await db
			.select({
				id: users.id,
				email: users.email,
				emailPref: userPreferences.value,
			})
			.from(users)
			.leftJoin(
				userPreferences,
				and(
					eq(userPreferences.userId, users.id),
					eq(userPreferences.key, "notifications.emailEnabled"),
				),
			)
			.where(
				inArray(
					users.id,
					plan.memberBills.map((b) => b.row.userId),
				),
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
