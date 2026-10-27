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
// Round trips (#23): the run reads everything in one batch, computes the
// bills in memory and writes them in one atomic write batch, however many
// members there are. Nothing holds the write lock between round trips. The
// PDFs are rendered from memory and mailed after the commit, a few at a time.

import { and, desc, eq, inArray, isNull, ne, not, or, sql } from "drizzle-orm";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { lateFeeFor } from "~/lib/late-fee";
import {
	fromCents,
	roundToCent,
	shareDown,
	sumMoney,
	toCents,
} from "~/lib/money";
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
import { groupBy } from "~/server/lib/group-by";
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
			// their debt can sit several periods back.
			db
				.select({
					id: bills.id,
					userId: bills.userId,
					userName: bills.userName,
					total: bills.total,
					status: bills.status,
				})
				.from(bills)
				.where(isOutstanding()),
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

/** One bill line per drink and price, consolidating repeated orders. */
function drinkLines(
	billId: string,
	billOrders: OrderWithDetails[],
	now: Date,
): BillItemRow[] {
	const drinkSummary = new Map<string, BillItemRow>();
	for (const order of billOrders) {
		const key = `${order.drinkName}-${order.pricePerUnit}`;
		const existing = drinkSummary.get(key);
		if (existing) {
			existing.amount += order.amount;
			existing.totalPricePerDrink = sumMoney([
				existing.totalPricePerDrink,
				order.total,
			]);
		} else {
			drinkSummary.set(key, {
				id: crypto.randomUUID(),
				billId,
				drinkName: order.drinkName,
				amount: order.amount,
				pricePerDrink: order.pricePerUnit,
				totalPricePerDrink: roundToCent(order.total),
				createdAt: now,
			});
		}
	}
	return [...drinkSummary.values()];
}

/**
 * What each member still owes from earlier periods, in whole cents so
 * legacy sub-cent totals can't add up to drift, and whether any of it was
 * deferred.
 */
function outstandingByUser(rows: BillingState["outstanding"]) {
	const unpaidCentsMap = new Map<string, number>();
	const deferredStatusMap = new Map<string, boolean>();
	const outstandingUserNameMap = new Map<string, string>();
	for (const row of rows) {
		// Gruppenrechnungen (event bills) are settled directly, never carried.
		if (row.userId.startsWith("event-")) {
			continue;
		}
		unpaidCentsMap.set(
			row.userId,
			(unpaidCentsMap.get(row.userId) ?? 0) + toCents(Number(row.total) || 0),
		);
		outstandingUserNameMap.set(row.userId, row.userName);
		if (row.status === "Gestundet") {
			deferredStatusMap.set(row.userId, true);
		}
	}
	return { unpaidCentsMap, deferredStatusMap, outstandingUserNameMap };
}

/** Every row the run writes, and what it reports and mails. */
function planBillingRun(
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
	const umlageFor = (userId: string) => (hausbewohner.has(userId) ? umlage : 0);
	const { unpaidCentsMap, deferredStatusMap, outstandingUserNameMap } =
		outstandingByUser(state.outstanding);

	// Personal orders by user, event orders by event name (bookingFor).
	const userOrderMap = groupBy(
		state.unbilledOrders.filter((o) => !o.bookingFor),
		(o) => o.userId,
	);
	const eventOrderMap = groupBy(
		state.unbilledOrders.filter((o) => o.bookingFor),
		(o) => o.bookingFor || "Unknown Event",
	);

	const memberBills: { row: BillRow; items: BillItemRow[] }[] = [];
	const eventBills: { row: BillRow; items: BillItemRow[] }[] = [];
	const userBillingSummaries: UserBillingSummary[] = [];
	// Members whose old bills move into their new one.
	const settledUserIds: string[] = [];

	// A member's bill: new drinks, the carried amount with its late fee
	// (LATE_FEE, the same rule the bill letter states) unless deferred, and
	// the Umlage. Every stored amount is whole cents and the total is the sum
	// of the stored parts, so the PDF lines always add up to the total (#13).
	const addMemberBill = (
		userId: string,
		userName: string,
		userOrders: OrderWithDetails[],
	) => {
		const drinksTotal =
			userOrders.length > 0 ? sumMoney(userOrders.map((o) => o.total)) : 0;
		const oldBillingAmount = fromCents(unpaidCentsMap.get(userId) ?? 0);
		const wasDeferred = deferredStatusMap.get(userId) || false;
		const fees = lateFeeFor(oldBillingAmount, wasDeferred);
		const share = umlageFor(userId);
		const finalTotal = sumMoney([drinksTotal, oldBillingAmount, fees, share]);

		const billId = crypto.randomUUID();
		memberBills.push({
			row: {
				id: billId,
				billPeriodId,
				userId,
				userName,
				status: "Unbezahlt",
				oldBillingAmount,
				fees,
				umlage: share,
				drinksTotal,
				total: finalTotal,
				createdAt: now,
			},
			items: drinkLines(billId, userOrders, now),
		});
		// The rolled-in old bills are settled as "Übertragen" so the member
		// isn't listed (and counted) twice.
		if (oldBillingAmount > 0) {
			settledUserIds.push(userId);
		}
		userBillingSummaries.push({
			userId,
			userName,
			orders: userOrders,
			drinksTotal,
			oldBillingAmount,
			fees,
			umlage: share,
			finalTotal,
		});
	};

	for (const [userId, userOrders] of userOrderMap) {
		addMemberBill(userId, userOrders[0]?.userName ?? "", userOrders);
	}

	// Members without new orders who still get a bill:
	// - outstanding debt: a carry-over bill, so the Altbetrag always moves
	//   into the newest Abrechnung. Without it, their old bill stays behind
	//   and the next run (which only sees the new period) would lose track
	//   of it.
	// - Hausbewohner: their Umlage share (#10), on the same bill as any
	//   carried debt, otherwise as an Umlage-only bill.
	const withoutOrders = new Map<string, string>();
	for (const [userId, unpaidCents] of unpaidCentsMap) {
		if (unpaidCents > 0) {
			withoutOrders.set(userId, outstandingUserNameMap.get(userId) ?? "");
		}
	}
	if (umlage > 0) {
		for (const [userId, name] of hausbewohner) {
			if (!withoutOrders.has(userId)) {
				withoutOrders.set(userId, name);
			}
		}
	}
	for (const [userId, userName] of withoutOrders) {
		if (!userOrderMap.has(userId)) {
			addMemberBill(userId, userName, []);
		}
	}

	// One bill per event, with a special userId to mark it as an event.
	// Events don't have old billing, fees or Umlage.
	for (const [eventName, eventOrdersList] of eventOrderMap) {
		const drinksTotal = sumMoney(eventOrdersList.map((o) => o.total));
		const billId = crypto.randomUUID();
		eventBills.push({
			row: {
				id: billId,
				billPeriodId,
				userId: `event-${eventName.toLowerCase().replace(/\s+/g, "-")}`,
				userName: eventName,
				status: "Unbezahlt",
				oldBillingAmount: 0,
				fees: 0,
				umlage: 0,
				drinksTotal,
				total: drinksTotal,
				createdAt: now,
			},
			items: drinkLines(billId, eventOrdersList, now),
		});
	}

	const totalAmount = fromCents(
		[...memberBills, ...eventBills].reduce(
			(cents, bill) => cents + toCents(bill.row.total),
			0,
		),
	);

	return {
		memberBills,
		eventBills,
		userBillingSummaries,
		settledUserIds,
		orderIds: state.unbilledOrders.map((o) => o.id),
		totalAmount,
	};
}

type BillingPlan = ReturnType<typeof planBillingRun>;

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
		const umlageCents =
			hausbewohner.size > 0 ? shareDown(lossCents, hausbewohner.size) : 0;
		const umlage = fromCents(umlageCents);

		// An Umlage to charge is reason enough for a run, orders or not.
		if (state.unbilledOrders.length === 0 && umlageCents === 0) {
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
		const plan = planBillingRun(state, {
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
			console.error("Billing run conflicted with a concurrent change:", error);
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
		log.info("billing run completed", {
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
			console.error("Error during email notification phase:", notifyError);
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
		console.error("Error creating billing:", error);

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
	/** Logged when the mail fails. */
	failure: string;
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
				failure: `Failed to send bill of ${bill.row.userName} to the treasurer:`,
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
				failure: `Failed to send email to ${user.email}:`,
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
	await forEachLimited(
		jobs,
		MAIL_CONCURRENCY,
		async ({ bill, failure, send }) => {
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
				console.error(
					`Failed to generate PDF for bill ${bill.row.id}:`,
					pdfError,
				);
				return;
			}
			try {
				await send(pdf, userBillPdfFileName(billNumber, bill.row.userName));
			} catch (emailError) {
				// Log but don't fail the whole billing process
				failed++;
				console.error(failure, emailError);
			}
		},
	);
	log.info("billing mails sent", {
		mode: recipient.mode,
		sent: jobs.length - failed,
		failed,
	});
}
