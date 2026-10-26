"use server";

import { and, count, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
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
import { log } from "~/server/lib/log";
import {
	sendBillNotificationEmail,
	sendTreasurerBillEmail,
} from "../newuser/email";
import { generateUserBillPDF } from "./createUserPDF";

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
export async function createNewBilling(totalInventoryLoss: number = 0) {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}

	const createdByUserId = session.user.id;

	try {
		const result = await db.transaction(async (tx) => {
			// 1. Get all unbilled orders (both personal and event)
			const allUnbilledOrders = await tx
				.select()
				.from(orders)
				.where(eq(orders.inBill, false))
				.orderBy(orders.userId, orders.createdAt);

			if (allUnbilledOrders.length === 0) {
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
			const unpaidAmountMap = new Map<string, number>();
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
				unpaidAmountMap.set(
					row.userId,
					(unpaidAmountMap.get(row.userId) ?? 0) + (Number(row.total) || 0),
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
			let totalBillingAmount = 0;

			// Calculate Umlage based on inventory loss
			const hausbewohnerCountResult = await tx
				.select({ count: count() })
				.from(userRoles)
				.innerJoin(roles, eq(userRoles.roleId, roles.id))
				.where(eq(roles.name, "Hausbewohner"))
				.execute();
			const hausbewohnerCount = hausbewohnerCountResult[0]?.count || 1;
			const umlage = totalInventoryLoss / hausbewohnerCount;

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
				const drinksTotal = userOrders.reduce(
					(sum, order) => sum + order.total,
					0,
				);

				const oldBillingAmount = unpaidAmountMap.get(userId) || 0;

				const wasDeferred = deferredStatusMap.get(userId) || false;
				const fees = wasDeferred
					? 0
					: oldBillingAmount > 5
						? oldBillingAmount * 0.1
						: 0;

				const finalTotal = drinksTotal + oldBillingAmount + fees + umlage;

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
							existing.totalPrice += order.total;
						} else {
							drinkSummary.set(key, {
								drinkName: order.drinkName,
								totalAmount: order.amount,
								pricePerUnit: order.pricePerUnit,
								totalPrice: order.total,
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
					finalTotal,
				});

				createdBills.push(billId);
				totalBillingAmount += finalTotal;
			}

			// 7b. Members with outstanding debt but NO new orders: create a
			// carry-over-only bill so the Altbetrag always moves into the newest
			// Abrechnung. Without this, their old bill stays behind and the next
			// run (which only sees the new period) would lose track of it.
			for (const [userId, oldBillingAmount] of unpaidAmountMap.entries()) {
				if (userOrderMap.has(userId)) {
					continue; // already rolled in above
				}
				if (oldBillingAmount <= 0) {
					continue;
				}

				const userName = outstandingUserNameMap.get(userId) ?? "";
				const wasDeferred = deferredStatusMap.get(userId) || false;
				const fees = wasDeferred
					? 0
					: oldBillingAmount > 5
						? oldBillingAmount * 0.1
						: 0;
				// No drinks, no Umlage — this bill only carries the old amount.
				const finalTotal = oldBillingAmount + fees;

				const billId = crypto.randomUUID();
				await tx.insert(bills).values({
					id: billId,
					billPeriodId: billPeriodId,
					userId: userId,
					userName: userName,
					status: "Unbezahlt",
					oldBillingAmount: oldBillingAmount,
					fees: fees,
					umlage: 0,
					drinksTotal: 0,
					total: finalTotal,
					createdAt: now,
				});
				await settleCarriedBills(userId);

				userBillingSummaries.push({
					userId,
					userName,
					orders: [],
					drinksTotal: 0,
					oldBillingAmount,
					fees,
					finalTotal,
				});

				createdBills.push(billId);
				totalBillingAmount += finalTotal;
			}

			// 8. Process event bills - Create one bill per event
			for (const [eventName, eventOrdersList] of eventOrderMap.entries()) {
				// Calculate totals for this event
				const drinksTotal = eventOrdersList.reduce(
					(sum, order) => sum + order.total,
					0,
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
						existing.totalPrice += order.total;
					} else {
						drinkSummary.set(key, {
							drinkName: order.drinkName,
							totalAmount: order.amount,
							pricePerUnit: order.pricePerUnit,
							totalPrice: order.total,
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
				totalBillingAmount += finalTotal;
			}

			// 9. Update the bill period with total amount
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

// Get the latest bill period
export async function getLatestBillPeriod() {
	try {
		const [latestPeriod] = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt))
			.limit(1);

		return latestPeriod || null;
	} catch (error) {
		console.error("Error getting latest bill period:", error);
		return null;
	}
}

// Get all bill periods (for displaying tabs)
export async function getAllBillPeriods() {
	try {
		const periods = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt));

		return periods;
	} catch (error) {
		console.error("Error getting bill periods:", error);
		return [];
	}
}

// Get bills for a specific period
export async function getBillsForPeriod(billPeriodId: string) {
	try {
		const billsData = await db
			.select({
				id: bills.id,
				userId: bills.userId,
				userName: bills.userName,
				status: bills.status,
				oldBillingAmount: bills.oldBillingAmount,
				fees: bills.fees,
				drinksTotal: bills.drinksTotal,
				total: bills.total,
				createdAt: bills.createdAt,
				paidAt: bills.paidAt,
			})
			.from(bills)
			.where(eq(bills.billPeriodId, billPeriodId))
			.orderBy(bills.userName);

		// Get bill items for each bill
		const billsWithItems = await Promise.all(
			billsData.map(async (bill) => {
				const items = await db
					.select()
					.from(billItems)
					.where(eq(billItems.billId, bill.id));

				return {
					id: bill.id,
					name: bill.userName,
					totalDue: bill.total,
					status: bill.status,
					oldBillingAmount: bill.oldBillingAmount,
					drinksTotal: bill.drinksTotal,
					fees: bill.fees,
					items: items.map((item) => ({
						id: item.id,
						name: item.drinkName,
						quantity: item.amount,
						unitPrice: item.pricePerDrink,
						subtotal: item.totalPricePerDrink,
					})),
				};
			}),
		);

		return billsWithItems;
	} catch (error) {
		console.error("Error getting bills for period:", error);
		return [];
	}
}

// Close/finalize a billing period
export async function closeBillPeriod(billPeriodId: string) {
	try {
		const now = new Date();

		await db
			.update(billPeriods)
			.set({
				closedAt: now,
				updatedAt: now,
			})
			.where(eq(billPeriods.id, billPeriodId));

		return {
			success: true,
			message: "Abrechnungsperiode erfolgreich abgeschlossen",
		};
	} catch (error) {
		console.error("Error closing bill period:", error);
		return {
			success: false,
			message: "Fehler beim Abschließen der Abrechnungsperiode",
		};
	}
}

// Update bill status
export async function updateBillStatus(
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen",
) {
	try {
		const now = new Date();
		// biome-ignore lint/suspicious/noExplicitAny: dynamic update data with optional paidAt field
		const updateData: any = {
			status: newStatus,
			updatedAt: now,
		};

		// Set paidAt if marking as paid
		if (newStatus === "Bezahlt") {
			updateData.paidAt = now;
		} else {
			updateData.paidAt = null;
		}

		await db.update(bills).set(updateData).where(eq(bills.id, billId));

		// When a consolidated bill is paid, also settle the carried-over
		// ("Übertragen") predecessor bills of the same member — their amount was
		// rolled into this bill's Übertrag, so they are now paid too.
		if (newStatus === "Bezahlt") {
			const [paid] = await db
				.select({ userId: bills.userId, createdAt: bills.createdAt })
				.from(bills)
				.where(eq(bills.id, billId))
				.limit(1);
			if (paid) {
				await db
					.update(bills)
					.set({ status: "Bezahlt", paidAt: now, updatedAt: now })
					.where(
						and(
							eq(bills.userId, paid.userId),
							eq(bills.status, "Übertragen"),
							lt(bills.createdAt, paid.createdAt),
						),
					);
			}
		}

		return { success: true };
	} catch (error) {
		console.error("Error updating bill status:", error);
		return { success: false };
	}
}

// Get billing statistics (updated to include detailed event breakdown)
export async function getBillingStatistics() {
	try {
		const [unbilledCount] = await db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(
				and(
					eq(orders.inBill, false),
					isNull(orders.bookingFor), // Only count personal orders
				),
			);

		const [unbilledTotal] = await db
			.select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
			.from(orders)
			.where(
				and(
					eq(orders.inBill, false),
					isNull(orders.bookingFor), // Only sum personal orders
				),
			);

		// Get detailed event orders grouped by event name
		const eventOrdersGrouped = await db
			.select({
				eventName: orders.bookingFor,
				count: sql<number>`count(*)`,
				totalAmount: sql<number>`sum(${orders.total})`,
				bookedBy: sql<string>`GROUP_CONCAT(DISTINCT ${orders.userName})`,
			})
			.from(orders)
			.where(
				and(eq(orders.inBill, false), sql`${orders.bookingFor} IS NOT NULL`),
			)
			.groupBy(orders.bookingFor);

		// Calculate totals for all event orders
		const eventOrdersTotals = eventOrdersGrouped.reduce(
			(acc, event) => ({
				count: acc.count + Number(event.count),
				totalAmount: acc.totalAmount + Number(event.totalAmount),
			}),
			{ count: 0, totalAmount: 0 },
		);

		const [totalPeriods] = await db
			.select({ count: sql<number>`count(*)` })
			.from(billPeriods);

		const [pendingBillsTotal] = await db
			.select({ total: sql<number>`coalesce(sum(${bills.total}), 0)` })
			.from(bills)
			.where(eq(bills.status, "Unbezahlt"));

		return {
			unbilledOrders: {
				count: unbilledCount?.count ?? 0,
				totalAmount: unbilledTotal?.total ?? 0,
			},
			eventOrders: {
				count: eventOrdersTotals.count,
				totalAmount: eventOrdersTotals.totalAmount,
				events: eventOrdersGrouped.map((event) => ({
					name: event.eventName || "Unknown Event",
					orderCount: Number(event.count),
					totalAmount: Number(event.totalAmount),
					bookedBy: event.bookedBy?.split(",") || [],
				})),
			},
			totalBillPeriods: totalPeriods?.count ?? 0,
			pendingBillsAmount: pendingBillsTotal?.total ?? 0,
		};
	} catch (error) {
		console.error("Error getting billing statistics:", error);
		return null;
	}
}

// Get event orders (orders with bookingFor set) - useful for tracking
export async function getEventOrders() {
	try {
		const eventOrders = await db
			.select()
			.from(orders)
			.where(sql`${orders.bookingFor} IS NOT NULL`)
			.orderBy(desc(orders.createdAt));

		return eventOrders;
	} catch (error) {
		console.error("Error getting event orders:", error);
		return [];
	}
}
