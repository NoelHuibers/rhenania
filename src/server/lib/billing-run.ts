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

import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { lateFeeFor } from "~/lib/late-fee";
import {
	fromCents,
	roundToCent,
	shareDown,
	sumMoney,
	toCents,
} from "~/lib/money";
import { generateUserBillPDF } from "~/server/actions/billings/createUserPDF";
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
import { getBillRecipient } from "~/server/lib/getraenke-settings";
import {
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
} from "~/server/lib/getraenkekasse-payment";
import { log } from "~/server/lib/log";
import { getTenantId } from "~/server/lib/tenant-context";

/** The role whose members carry the inventory-loss Umlage. */
const HAUSBEWOHNER_ROLE = "Hausbewohner";

/**
 * The active Hausbewohner of the current tenant (id → name): members with
 * the role in this tenant's DB whose membership in the control DB is active.
 * Suspended and pending members are left out.
 */
async function activeHausbewohner(): Promise<Map<string, string>> {
	const holders = await db
		.selectDistinct({ id: users.id, name: users.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.innerJoin(users, eq(userRoles.userId, users.id))
		.where(eq(roles.name, HAUSBEWOHNER_ROLE));
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

interface OrderWithDetails {
	id: string;
	userId: string;
	userName: string;
	drinkId: string;
	drinkName: string;
	amount: number;
	pricePerUnit: number;
	total: number;
	createdAt: Date;
	bookingFor: string | null;
}

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

/**
 * Next bill number in KW-WW-YY format (ISO week in Europe/Berlin); further
 * runs in the same week get -2, -3, etc.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction type is complex
async function generateBillNumber(tx: any, date: Date): Promise<string> {
	const base = billNumberBase(date);
	const existingBills: { billNumber: string }[] = await tx
		.select({ billNumber: billPeriods.billNumber })
		.from(billPeriods)
		.where(sql`${billPeriods.billNumber} LIKE ${`${base}%`}`);
	return nextBillNumber(
		base,
		existingBills.map((b) => b.billNumber),
	);
}

/**
 * Bills every unbilled order, carries open bills over and charges
 * `inventoryLoss` as Umlage to the active Hausbewohner. Only server code may
 * pass a loss: the one read from the inventory just closed.
 */
export async function runGetraenkeBilling({
	inventoryLoss,
}: {
	inventoryLoss: number;
}) {
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
		// The Umlage share: the loss split evenly over the active Hausbewohner,
		// rounded down to whole cents. A gain (negative loss) is not paid out.
		const lossCents = Math.max(0, toCents(inventoryLoss));
		const hausbewohner =
			lossCents > 0 ? await activeHausbewohner() : new Map<string, string>();
		const umlageCents =
			hausbewohner.size > 0 ? shareDown(lossCents, hausbewohner.size) : 0;
		const umlage = fromCents(umlageCents);
		const umlageFor = (userId: string) =>
			hausbewohner.has(userId) ? umlage : 0;

		const result = await db.transaction(async (tx) => {
			// 1. Get all unbilled orders (both personal and event)
			const allUnbilledOrders = await tx
				.select()
				.from(orders)
				.where(eq(orders.inBill, false))
				.orderBy(orders.userId, orders.createdAt);

			// An Umlage to charge is reason enough for a run, orders or not.
			if (allUnbilledOrders.length === 0 && umlageCents === 0) {
				return {
					success: true,
					message: "Keine unbezahlten Bestellungen gefunden",
					billsCreated: 0,
					totalAmount: 0,
					eventBillsCreated: 0,
				};
			}

			// Separate personal and event orders
			const personalOrders = allUnbilledOrders.filter(
				(order) => !order.bookingFor,
			);
			const eventOrders = allUnbilledOrders.filter((order) => order.bookingFor);

			// 2. Generate the new bill number and close the previous bill period
			const now = new Date();
			const nextBillNumber = await generateBillNumber(tx, now);

			// Get the last open bill period to close it
			const [lastBillPeriod] = await tx
				.select({
					id: billPeriods.id,
					billNumber: billPeriods.billNumber,
					closedAt: billPeriods.closedAt,
				})
				.from(billPeriods)
				.where(isNull(billPeriods.closedAt))
				.orderBy(desc(billPeriods.createdAt))
				.limit(1);

			// Close the previous bill period if it's not already closed
			if (lastBillPeriod && !lastBillPeriod.closedAt) {
				await tx
					.update(billPeriods)
					.set({
						closedAt: now,
						updatedAt: now,
					})
					.where(eq(billPeriods.id, lastBillPeriod.id));
			}

			// 3. Create the new bill period
			const billPeriodId = crypto.randomUUID();

			await tx.insert(billPeriods).values({
				id: billPeriodId,
				billNumber: nextBillNumber,
				totalAmount: 0, // Will be updated later
				createdBy: createdByUserId,
				createdAt: now,
			});

			// 4. Get unpaid and deferred amounts from ALL previous periods for each
			// user — not just the last one. A member without new orders gets skipped
			// by intermediate billing runs, so their debt can sit several periods
			// back (and would otherwise never be carried over).
			// Kept in whole cents so legacy sub-cent totals can't add up to drift.
			const unpaidCentsMap = new Map<string, number>();
			const deferredStatusMap = new Map<string, boolean>();
			const outstandingUserNameMap = new Map<string, string>();

			const outstandingBills = await tx
				.select({
					userId: bills.userId,
					userName: bills.userName,
					total: bills.total,
					status: bills.status,
				})
				.from(bills)
				.where(
					or(eq(bills.status, "Unbezahlt"), eq(bills.status, "Gestundet")),
				);

			for (const row of outstandingBills) {
				// Gruppenrechnungen (event bills) are settled directly, never carried.
				if (row.userId.startsWith("event-")) {
					continue;
				}
				unpaidCentsMap.set(
					row.userId,
					(unpaidCentsMap.get(row.userId) ?? 0) +
						toCents(Number(row.total) || 0),
				);
				outstandingUserNameMap.set(row.userId, row.userName);
				// Track if any of this user's outstanding bills was deferred
				if (row.status === "Gestundet") {
					deferredStatusMap.set(row.userId, true);
				}
			}

			// 5. Process personal orders - Group by user
			const userOrderMap = new Map<string, OrderWithDetails[]>();
			for (const order of personalOrders) {
				const userId = order.userId;
				if (!userOrderMap.has(userId)) {
					userOrderMap.set(userId, []);
				}
				userOrderMap.get(userId)?.push(order);
			}

			// 6. Process event orders - Group by event name (bookingFor)
			const eventOrderMap = new Map<string, OrderWithDetails[]>();
			for (const order of eventOrders) {
				const eventName = order.bookingFor || "Unknown Event";
				if (!eventOrderMap.has(eventName)) {
					eventOrderMap.set(eventName, []);
				}
				eventOrderMap.get(eventName)?.push(order);
			}

			// 7. Process each user's billing
			const userBillingSummaries: UserBillingSummary[] = [];
			const createdBills: string[] = [];
			const createdEventBills: string[] = [];
			let totalBillingCents = 0;

			// Late fee on a carried amount (LATE_FEE, the same rule the bill
			// letter states), unless it was deferred. Every stored amount is
			// whole cents and the total is the sum of the stored parts, so the
			// PDF lines always add up to the total (#13).
			const lateFee = lateFeeFor;

			// The rolled-in old bills are settled as "Übertragen" so the member
			// isn't listed (and counted) twice. Everything outstanding outside the
			// period being created right now.
			const settleCarriedBills = (userId: string) =>
				tx
					.update(bills)
					.set({ status: "Übertragen", updatedAt: now })
					.where(
						and(
							eq(bills.userId, userId),
							or(eq(bills.status, "Unbezahlt"), eq(bills.status, "Gestundet")),
							ne(bills.billPeriodId, billPeriodId),
						),
					);

			// Process personal bills
			for (const [userId, userOrders] of userOrderMap.entries()) {
				const userName =
					userOrders.length > 0 ? (userOrders[0]?.userName ?? "") : "";

				// Calculate totals for this user
				const drinksTotal = sumMoney(userOrders.map((order) => order.total));

				const oldBillingAmount = fromCents(unpaidCentsMap.get(userId) ?? 0);

				const wasDeferred = deferredStatusMap.get(userId) || false;
				const fees = lateFee(oldBillingAmount, wasDeferred);
				const umlage = umlageFor(userId);

				const finalTotal = sumMoney([
					drinksTotal,
					oldBillingAmount,
					fees,
					umlage,
				]);

				// Create the bill
				const billId = crypto.randomUUID();

				await tx.insert(bills).values({
					id: billId,
					billPeriodId: billPeriodId,
					userId: userId,
					userName: userName,
					status: "Unbezahlt",
					oldBillingAmount: oldBillingAmount,
					fees: fees,
					umlage: umlage,
					drinksTotal: drinksTotal,
					total: finalTotal,
					createdAt: now,
				});

				if (oldBillingAmount > 0) {
					await settleCarriedBills(userId);
				}

				// Group orders by drink to consolidate quantities (only if there are new orders)
				if (userOrders.length > 0) {
					const drinkSummary = new Map<
						string,
						{
							drinkName: string;
							totalAmount: number;
							pricePerUnit: number;
							totalPrice: number;
						}
					>();

					for (const order of userOrders) {
						const key = `${order.drinkName}-${order.pricePerUnit}`;

						if (drinkSummary.has(key)) {
							// biome-ignore lint/style/noNonNullAssertion: guarded by has() check above
							const existing = drinkSummary.get(key)!;
							existing.totalAmount += order.amount;
							existing.totalPrice = sumMoney([
								existing.totalPrice,
								order.total,
							]);
						} else {
							drinkSummary.set(key, {
								drinkName: order.drinkName,
								totalAmount: order.amount,
								pricePerUnit: order.pricePerUnit,
								totalPrice: roundToCent(order.total),
							});
						}
					}

					// Create bill items for each unique drink
					for (const drinkInfo of drinkSummary.values()) {
						await tx.insert(billItems).values({
							id: crypto.randomUUID(),
							billId: billId,
							drinkName: drinkInfo.drinkName,
							amount: drinkInfo.totalAmount,
							pricePerDrink: drinkInfo.pricePerUnit,
							totalPricePerDrink: drinkInfo.totalPrice,
							createdAt: now,
						});
					}
				}

				// Store summary for return data
				userBillingSummaries.push({
					userId,
					userName,
					orders: userOrders,
					drinksTotal,
					oldBillingAmount,
					fees,
					umlage,
					finalTotal,
				});

				createdBills.push(billId);
				totalBillingCents += toCents(finalTotal);
			}

			// 7b. Members without new orders who still get a bill:
			// - outstanding debt: a carry-over bill, so the Altbetrag always
			//   moves into the newest Abrechnung. Without it, their old bill
			//   stays behind and the next run (which only sees the new period)
			//   would lose track of it.
			// - Hausbewohner: their Umlage share (#10), on the same bill as any
			//   carried debt, otherwise as an Umlage-only bill.
			const withoutOrders = new Map<string, string>();
			for (const [userId, unpaidCents] of unpaidCentsMap.entries()) {
				if (unpaidCents > 0) {
					withoutOrders.set(userId, outstandingUserNameMap.get(userId) ?? "");
				}
			}
			if (umlageCents > 0) {
				for (const [userId, name] of hausbewohner.entries()) {
					if (!withoutOrders.has(userId)) {
						withoutOrders.set(userId, name);
					}
				}
			}

			for (const [userId, userName] of withoutOrders.entries()) {
				if (userOrderMap.has(userId)) {
					continue; // already billed above
				}

				const oldBillingAmount = fromCents(unpaidCentsMap.get(userId) ?? 0);
				const wasDeferred = deferredStatusMap.get(userId) || false;
				const fees = lateFee(oldBillingAmount, wasDeferred);
				const umlage = umlageFor(userId);
				// No drinks: only the carried amount and/or the Umlage.
				const finalTotal = sumMoney([oldBillingAmount, fees, umlage]);

				const billId = crypto.randomUUID();
				await tx.insert(bills).values({
					id: billId,
					billPeriodId: billPeriodId,
					userId: userId,
					userName: userName,
					status: "Unbezahlt",
					oldBillingAmount: oldBillingAmount,
					fees: fees,
					umlage: umlage,
					drinksTotal: 0,
					total: finalTotal,
					createdAt: now,
				});
				if (oldBillingAmount > 0) {
					await settleCarriedBills(userId);
				}

				userBillingSummaries.push({
					userId,
					userName,
					orders: [],
					drinksTotal: 0,
					oldBillingAmount,
					fees,
					umlage,
					finalTotal,
				});

				createdBills.push(billId);
				totalBillingCents += toCents(finalTotal);
			}

			// 8. Process event bills - Create one bill per event
			for (const [eventName, eventOrdersList] of eventOrderMap.entries()) {
				// Calculate totals for this event
				const drinksTotal = sumMoney(
					eventOrdersList.map((order) => order.total),
				);

				const finalTotal = drinksTotal; // Events don't have old billing or fees

				// Create the event bill with special userId to mark it as an event
				const billId = crypto.randomUUID();
				const eventUserId = `event-${eventName
					.toLowerCase()
					.replace(/\s+/g, "-")}`;

				await tx.insert(bills).values({
					id: billId,
					billPeriodId: billPeriodId,
					userId: eventUserId, // Special ID format for events
					userName: `${eventName}`, // Event name with emoji prefix
					status: "Unbezahlt",
					oldBillingAmount: 0,
					fees: 0,
					drinksTotal: drinksTotal,
					total: finalTotal,
					createdAt: now,
				});

				// Group orders by drink to consolidate quantities
				const drinkSummary = new Map<
					string,
					{
						drinkName: string;
						totalAmount: number;
						pricePerUnit: number;
						totalPrice: number;
					}
				>();

				for (const order of eventOrdersList) {
					const key = `${order.drinkName}-${order.pricePerUnit}`;

					if (drinkSummary.has(key)) {
						// biome-ignore lint/style/noNonNullAssertion: guarded by has() check above
						const existing = drinkSummary.get(key)!;
						existing.totalAmount += order.amount;
						existing.totalPrice = sumMoney([existing.totalPrice, order.total]);
					} else {
						drinkSummary.set(key, {
							drinkName: order.drinkName,
							totalAmount: order.amount,
							pricePerUnit: order.pricePerUnit,
							totalPrice: roundToCent(order.total),
						});
					}
				}

				// Create bill items for each unique drink
				for (const drinkInfo of drinkSummary.values()) {
					await tx.insert(billItems).values({
						id: crypto.randomUUID(),
						billId: billId,
						drinkName: drinkInfo.drinkName,
						amount: drinkInfo.totalAmount,
						pricePerDrink: drinkInfo.pricePerUnit,
						totalPricePerDrink: drinkInfo.totalPrice,
						createdAt: now,
					});
				}

				createdEventBills.push(billId);
				totalBillingCents += toCents(finalTotal);
			}

			// 9. Update the bill period with total amount
			const totalBillingAmount = fromCents(totalBillingCents);
			await tx
				.update(billPeriods)
				.set({
					totalAmount: totalBillingAmount,
					updatedAt: now,
				})
				.where(eq(billPeriods.id, billPeriodId));

			// 10. Mark all processed orders as billed
			const allOrderIds = allUnbilledOrders.map((order) => order.id);

			if (allOrderIds.length > 0) {
				await tx
					.update(orders)
					.set({
						inBill: true,
						updatedAt: now,
					})
					.where(
						sql`${orders.id} IN (${sql.join(
							allOrderIds.map((id) => sql`${id}`),
							sql`, `,
						)})`,
					);
			}

			return {
				success: true,
				message: `Erfolgreich ${
					createdBills.length + createdEventBills.length
				} Rechnungen erstellt`,
				billPeriod: {
					id: billPeriodId,
					billNumber: nextBillNumber,
				},
				billsCreated: createdBills.length,
				eventBillsCreated: createdEventBills.length,
				totalAmount: totalBillingAmount,
				userSummaries: userBillingSummaries,
				createdBillIds: [...createdBills, ...createdEventBills],
			};
		});

		log.info("billing run completed", {
			bills: result.billsCreated,
			eventBills: result.eventBillsCreated,
			total: result.totalAmount,
			inventoryLoss: fromCents(lossCents),
			umlagePerHausbewohner: umlage,
			hausbewohner: hausbewohner.size,
		});

		// Send the new bills by mail: to the treasurer when the tenant chose that
		// (feature `billing.treasurerRecipient`), otherwise to each member who
		// hasn't opted out.
		if (result.success && result.billPeriod) {
			const billPeriodId = result.billPeriod.id;
			const billNumber = result.billPeriod.billNumber;

			try {
				const recipient = await getBillRecipient();
				if (recipient.mode === "treasurer") {
					await sendBillsToTreasurer(billPeriodId, billNumber, recipient.email);
				} else {
					await sendBillsToMembers(billPeriodId, billNumber);
				}
			} catch (notifyError) {
				console.error("Error during email notification phase:", notifyError);
			}
		}

		return result;
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

// Mails every member their own bill, unless they disabled notifications.
async function sendBillsToMembers(billPeriodId: string, billNumber: string) {
	// Left join on preferences so users without a row default to enabled (true)
	const usersWithBills = await db
		.select({
			billId: bills.id,
			userName: bills.userName,
			total: bills.total,
			email: users.email,
			emailPref: userPreferences.value,
		})
		.from(bills)
		.innerJoin(users, eq(bills.userId, users.id))
		.leftJoin(
			userPreferences,
			and(
				eq(userPreferences.userId, bills.userId),
				eq(userPreferences.key, "notifications.emailEnabled"),
			),
		)
		.where(eq(bills.billPeriodId, billPeriodId));

	// Only notify users who haven't explicitly disabled notifications (default = enabled)
	const toNotify = usersWithBills.filter(
		(u) => u.emailPref === null || u.emailPref === "true",
	);

	for (const user of toNotify) {
		try {
			const pdfResult = await generateUserBillPDF(user.billId);
			if (!pdfResult.success || !pdfResult.pdfContent) {
				console.error(
					`Failed to generate PDF for bill ${user.billId}:`,
					pdfResult.error,
				);
				continue;
			}
			await sendBillNotificationEmail(
				user.email,
				user.userName,
				billNumber,
				user.total,
				pdfResult.pdfContent,
				pdfResult.fileName ?? `Rechnung_${billNumber}.pdf`,
			);
		} catch (emailError) {
			// Log but don't fail the whole billing process
			console.error(`Failed to send email to ${user.email}:`, emailError);
		}
	}
}

// Mails every bill of the period — member and group bills alike — as its own
// message to the treasurer. Members get no mail in this mode.
async function sendBillsToTreasurer(
	billPeriodId: string,
	billNumber: string,
	treasurerEmail: string,
) {
	const periodBills = await db
		.select({ billId: bills.id, userName: bills.userName, total: bills.total })
		.from(bills)
		.where(eq(bills.billPeriodId, billPeriodId))
		.orderBy(bills.userName);

	for (const bill of periodBills) {
		try {
			const pdfResult = await generateUserBillPDF(bill.billId);
			if (!pdfResult.success || !pdfResult.pdfContent) {
				console.error(
					`Failed to generate PDF for bill ${bill.billId}:`,
					pdfResult.error,
				);
				continue;
			}
			await sendTreasurerBillEmail(
				treasurerEmail,
				bill.userName,
				billNumber,
				bill.total,
				pdfResult.pdfContent,
				pdfResult.fileName ?? `Rechnung_${billNumber}.pdf`,
			);
		} catch (emailError) {
			// Log but don't fail the whole billing process
			console.error(
				`Failed to send bill of ${bill.userName} to the treasurer:`,
				emailError,
			);
		}
	}
}
