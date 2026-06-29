"use server";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	fuchsenBillItems,
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
} from "~/server/db/schema";
import { hasRole } from "../admin/userRoles";

export type FuchsenBillPeriod = typeof fuchsenBillPeriods.$inferSelect;
export type FuchsenBill = typeof fuchsenBills.$inferSelect;

// Shape consumed by the generic <BillingTable> component (see BillingDashboard).
export interface FuchsenBillingEntry {
	id: string;
	name: string;
	totalDue: number;
	status?: "Bezahlt" | "Unbezahlt" | "Gestundet";
	oldBillingAmount?: number;
	itemsTotal?: number;
	paidAt?: Date | null;
	items: {
		id: string;
		name: string;
		quantity: number;
		unitPrice: number;
		subtotal: number;
	}[];
}

async function requireFuchsenwart() {
	const session = await auth();
	if (!session?.user?.id) {
		return { ok: false as const, error: "Authentifizierung erforderlich" };
	}
	const [isFuchs, isAdmin] = await Promise.all([
		hasRole(session.user.id, "Fuchs"),
		hasRole(session.user.id, "Admin"),
	]);
	if (!isFuchs && !isAdmin) {
		return { ok: false as const, error: "Keine Berechtigung" };
	}
	return { ok: true as const, userId: session.user.id };
}

/** ISO week number for a date (identical to the drinks billing helper). */
function getISOWeek(date: Date): number {
	const target = new Date(date.valueOf());
	const dayNumber = (date.getDay() + 6) % 7;
	target.setDate(target.getDate() - dayNumber + 3);
	const firstThursday = target.valueOf();
	target.setMonth(0, 1);
	if (target.getDay() !== 4) {
		target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
	}
	return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction type is complex
async function generateBillNumber(tx: any, date: Date): Promise<string> {
	const week = getISOWeek(date);
	const year = date.getFullYear().toString().slice(-2);
	const baseNumber = `KW-${week.toString().padStart(2, "0")}-${year}`;

	const existingBills = await tx
		.select({ billNumber: fuchsenBillPeriods.billNumber })
		.from(fuchsenBillPeriods)
		.where(sql`${fuchsenBillPeriods.billNumber} LIKE ${`${baseNumber}%`}`);

	if (existingBills.length === 0) return baseNumber;

	let maxSuffix = 1;
	existingBills.forEach((bill: { billNumber: string }) => {
		const match = bill.billNumber.match(
			new RegExp(`^${baseNumber}(?:-(\\d+))?$`),
		);
		if (match) {
			const suffix = match[1] ? parseInt(match[1], 10) : 1;
			maxSuffix = Math.max(maxSuffix, suffix);
		}
	});

	return `${baseNumber}-${maxSuffix + 1}`;
}

/**
 * Run a new fuchsen billing period: aggregate every not-yet-billed order into
 * one bill per user, carry forward any still-unpaid amount from the previous
 * period, close the previous period and open a new one.
 */
export async function createNewFuchsenBilling() {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) {
		return { success: false, message: authCheck.error, billsCreated: 0 };
	}

	try {
		const result = await db.transaction(async (tx) => {
			// 1. All orders not yet attached to a bill.
			const unbilledOrders = await tx
				.select()
				.from(fuchsenOrders)
				.where(isNull(fuchsenOrders.billId))
				.orderBy(fuchsenOrders.userId, fuchsenOrders.createdAt);

			if (unbilledOrders.length === 0) {
				return {
					success: true,
					message: "Keine offenen Bestellungen zum Abrechnen gefunden",
					billsCreated: 0,
					totalAmount: 0,
				};
			}

			const now = new Date();
			const nextBillNumber = await generateBillNumber(tx, now);

			// 2. Close the previous open period.
			const [lastPeriod] = await tx
				.select({
					id: fuchsenBillPeriods.id,
					billNumber: fuchsenBillPeriods.billNumber,
					closedAt: fuchsenBillPeriods.closedAt,
				})
				.from(fuchsenBillPeriods)
				.where(isNull(fuchsenBillPeriods.closedAt))
				.orderBy(desc(fuchsenBillPeriods.createdAt))
				.limit(1);

			if (lastPeriod && !lastPeriod.closedAt) {
				await tx
					.update(fuchsenBillPeriods)
					.set({ closedAt: now, updatedAt: now })
					.where(eq(fuchsenBillPeriods.id, lastPeriod.id));
			}

			// 3. Open the new period.
			const billPeriodId = crypto.randomUUID();
			await tx.insert(fuchsenBillPeriods).values({
				id: billPeriodId,
				billNumber: nextBillNumber,
				totalAmount: 0,
				createdBy: authCheck.userId,
				createdAt: now,
			});

			// 4. Carry forward outstanding amounts from the last period.
			const oldBalanceMap = new Map<string, number>();
			if (lastPeriod) {
				const outstanding = await tx
					.select({ userId: fuchsenBills.userId, total: fuchsenBills.total })
					.from(fuchsenBills)
					.where(
						and(
							eq(fuchsenBills.billPeriodId, lastPeriod.id),
							or(
								eq(fuchsenBills.status, "Unbezahlt"),
								eq(fuchsenBills.status, "Gestundet"),
							),
						),
					);
				outstanding.forEach((row) => {
					oldBalanceMap.set(row.userId, Number(row.total) || 0);
				});
			}

			// 5. Group unbilled orders by user.
			const userOrderMap = new Map<string, typeof unbilledOrders>();
			for (const order of unbilledOrders) {
				const list = userOrderMap.get(order.userId) ?? [];
				list.push(order);
				userOrderMap.set(order.userId, list);
			}

			let totalBillingAmount = 0;
			let billsCreated = 0;

			for (const [userId, userOrders] of userOrderMap.entries()) {
				const userName = userOrders[0]?.userName ?? "";
				const itemsTotal = userOrders.reduce((sum, o) => sum + o.total, 0);
				const oldBillingAmount = oldBalanceMap.get(userId) ?? 0;
				const total = itemsTotal + oldBillingAmount;

				const billId = crypto.randomUUID();
				await tx.insert(fuchsenBills).values({
					id: billId,
					billPeriodId,
					userId,
					userName,
					status: "Unbezahlt",
					oldBillingAmount,
					itemsTotal,
					total,
					createdAt: now,
				});

				// Consolidate identical items (same name + price) into one line.
				const itemSummary = new Map<
					string,
					{ name: string; amount: number; price: number; total: number }
				>();
				for (const order of userOrders) {
					const key = `${order.itemName}-${order.pricePerUnit}`;
					const existing = itemSummary.get(key);
					if (existing) {
						existing.amount += order.amount;
						existing.total += order.total;
					} else {
						itemSummary.set(key, {
							name: order.itemName,
							amount: order.amount,
							price: order.pricePerUnit,
							total: order.total,
						});
					}
				}
				for (const info of itemSummary.values()) {
					await tx.insert(fuchsenBillItems).values({
						id: crypto.randomUUID(),
						billId,
						itemName: info.name,
						amount: info.amount,
						pricePerItem: info.price,
						totalPrice: info.total,
						createdAt: now,
					});
				}

				// Attach this user's orders to their new bill.
				await tx
					.update(fuchsenOrders)
					.set({ billId, updatedAt: now })
					.where(
						and(eq(fuchsenOrders.userId, userId), isNull(fuchsenOrders.billId)),
					);

				billsCreated += 1;
				totalBillingAmount += total;
			}

			await tx
				.update(fuchsenBillPeriods)
				.set({ totalAmount: totalBillingAmount, updatedAt: now })
				.where(eq(fuchsenBillPeriods.id, billPeriodId));

			return {
				success: true,
				message: `Erfolgreich ${billsCreated} Rechnung(en) erstellt`,
				billsCreated,
				totalAmount: totalBillingAmount,
				billPeriod: { id: billPeriodId, billNumber: nextBillNumber },
			};
		});

		return result;
	} catch (error) {
		console.error("Error creating fuchsen billing:", error);
		return {
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			billsCreated: 0,
		};
	}
}

export async function getLatestFuchsenBillPeriod() {
	try {
		const [latest] = await db
			.select()
			.from(fuchsenBillPeriods)
			.orderBy(desc(fuchsenBillPeriods.createdAt))
			.limit(1);
		return latest ?? null;
	} catch (error) {
		console.error("Error getting latest fuchsen bill period:", error);
		return null;
	}
}

export async function getAllFuchsenBillPeriods() {
	try {
		return await db
			.select()
			.from(fuchsenBillPeriods)
			.orderBy(desc(fuchsenBillPeriods.createdAt));
	} catch (error) {
		console.error("Error getting fuchsen bill periods:", error);
		return [];
	}
}

export async function getFuchsenBillsForPeriod(
	billPeriodId: string,
): Promise<FuchsenBillingEntry[]> {
	try {
		const billsData = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.billPeriodId, billPeriodId))
			.orderBy(fuchsenBills.userName);

		return await Promise.all(
			billsData.map(async (bill) => {
				const items = await db
					.select()
					.from(fuchsenBillItems)
					.where(eq(fuchsenBillItems.billId, bill.id));
				return {
					id: bill.id,
					name: bill.userName,
					totalDue: bill.total,
					status: bill.status,
					oldBillingAmount: bill.oldBillingAmount,
					itemsTotal: bill.itemsTotal,
					paidAt: bill.paidAt,
					items: items.map((item) => ({
						id: item.id,
						name: item.itemName,
						quantity: item.amount,
						unitPrice: item.pricePerItem,
						subtotal: item.totalPrice,
					})),
				};
			}),
		);
	} catch (error) {
		console.error("Error getting fuchsen bills for period:", error);
		return [];
	}
}

/**
 * Per-user aggregation of orders that haven't been billed yet — drives the
 * "Aktuelle Bestellungen" tab (preview of the next billing run).
 */
export async function getUnbilledFuchsenOrdersGrouped(): Promise<
	FuchsenBillingEntry[]
> {
	try {
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(isNull(fuchsenOrders.billId))
			.orderBy(fuchsenOrders.userName, fuchsenOrders.createdAt);

		const byUser = new Map<string, FuchsenBillingEntry>();
		for (const order of orders) {
			const entry = byUser.get(order.userId) ?? {
				id: order.userId,
				name: order.userName,
				totalDue: 0,
				items: [],
			};
			entry.totalDue += order.total;
			const existing = entry.items.find(
				(i) => i.name === order.itemName && i.unitPrice === order.pricePerUnit,
			);
			if (existing) {
				existing.quantity += order.amount;
				existing.subtotal += order.total;
			} else {
				entry.items.push({
					id: order.id,
					name: order.itemName,
					quantity: order.amount,
					unitPrice: order.pricePerUnit,
					subtotal: order.total,
				});
			}
			byUser.set(order.userId, entry);
		}

		return Array.from(byUser.values()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	} catch (error) {
		console.error("Error grouping unbilled fuchsen orders:", error);
		return [];
	}
}

export async function closeFuchsenBillPeriod(billPeriodId: string) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) return { success: false, message: authCheck.error };
	try {
		const now = new Date();
		await db
			.update(fuchsenBillPeriods)
			.set({ closedAt: now, updatedAt: now })
			.where(eq(fuchsenBillPeriods.id, billPeriodId));
		return { success: true, message: "Abrechnungsperiode abgeschlossen" };
	} catch (error) {
		console.error("Error closing fuchsen bill period:", error);
		return { success: false, message: "Fehler beim Abschließen" };
	}
}

export async function updateFuchsenBillStatus(
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet",
) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) return { success: false, error: authCheck.error };
	try {
		const now = new Date();
		const paidAt = newStatus === "Bezahlt" ? now : null;

		await db
			.update(fuchsenBills)
			.set({ status: newStatus, paidAt, updatedAt: now })
			.where(eq(fuchsenBills.id, billId));

		// Keep the underlying orders in sync so the per-order views (profile) and
		// the bill-level status never disagree.
		await db
			.update(fuchsenOrders)
			.set({
				status: newStatus === "Bezahlt" ? "Bezahlt" : "Offen",
				paidAt,
				updatedAt: now,
			})
			.where(eq(fuchsenOrders.billId, billId));

		return { success: true };
	} catch (error) {
		console.error("Error updating fuchsen bill status:", error);
		return { success: false, error: "Fehler beim Aktualisieren des Status" };
	}
}

export async function getFuchsenBillingStatistics() {
	try {
		const [unbilled] = await db
			.select({
				count: sql<number>`count(*)`,
				total: sql<number>`coalesce(sum(${fuchsenOrders.total}), 0)`,
			})
			.from(fuchsenOrders)
			.where(isNull(fuchsenOrders.billId));

		const [periods] = await db
			.select({ count: sql<number>`count(*)` })
			.from(fuchsenBillPeriods);

		const [pending] = await db
			.select({ total: sql<number>`coalesce(sum(${fuchsenBills.total}), 0)` })
			.from(fuchsenBills)
			.where(eq(fuchsenBills.status, "Unbezahlt"));

		return {
			unbilledOrders: {
				count: unbilled?.count ?? 0,
				totalAmount: unbilled?.total ?? 0,
			},
			totalBillPeriods: periods?.count ?? 0,
			pendingBillsAmount: pending?.total ?? 0,
		};
	} catch (error) {
		console.error("Error getting fuchsen billing statistics:", error);
		return null;
	}
}

/** The current user's own fuchsen bills (newest first), with line items. */
export async function getMyFuchsenBills(): Promise<
	{ period: FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
> {
	try {
		const session = await auth();
		if (!session?.user?.id) return [];

		const rows = await db
			.select({ bill: fuchsenBills, period: fuchsenBillPeriods })
			.from(fuchsenBills)
			.leftJoin(
				fuchsenBillPeriods,
				eq(fuchsenBills.billPeriodId, fuchsenBillPeriods.id),
			)
			.where(eq(fuchsenBills.userId, session.user.id))
			.orderBy(desc(fuchsenBills.createdAt));

		return await Promise.all(
			rows.map(async ({ bill, period }) => {
				const items = await db
					.select()
					.from(fuchsenBillItems)
					.where(eq(fuchsenBillItems.billId, bill.id));
				return {
					period,
					bill: {
						id: bill.id,
						name: bill.userName,
						totalDue: bill.total,
						status: bill.status,
						oldBillingAmount: bill.oldBillingAmount,
						itemsTotal: bill.itemsTotal,
						paidAt: bill.paidAt,
						items: items.map((item) => ({
							id: item.id,
							name: item.itemName,
							quantity: item.amount,
							unitPrice: item.pricePerItem,
							subtotal: item.totalPrice,
						})),
					},
				};
			}),
		);
	} catch (error) {
		console.error("Error getting my fuchsen bills:", error);
		return [];
	}
}

/** On-demand CSV (semicolon-delimited) for a whole period; no blob storage. */
export async function getFuchsenBillPeriodCSV(billPeriodId: string) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) return { success: false, error: authCheck.error };
	try {
		const [period] = await db
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, billPeriodId))
			.limit(1);
		if (!period) return { success: false, error: "Periode nicht gefunden" };

		const billsData = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.billPeriodId, billPeriodId))
			.orderBy(fuchsenBills.userName);

		const fmt = (n: number) => n.toFixed(2).replace(".", ",");
		const lines = [
			["Name", "Status", "Artikel", "Alter Saldo", "Gesamt"].join(";"),
			...billsData.map((b) =>
				[
					b.userName,
					b.status,
					fmt(b.itemsTotal),
					fmt(b.oldBillingAmount),
					fmt(b.total),
				].join(";"),
			),
			["Gesamt", "", "", "", fmt(period.totalAmount)].join(";"),
		];

		return {
			success: true,
			csvContent: `﻿${lines.join("\r\n")}`,
			fileName: `Fuchsenrechnung_${period.billNumber}.csv`,
		};
	} catch (error) {
		console.error("Error generating fuchsen CSV:", error);
		return { success: false, error: "Fehler beim Erstellen der CSV" };
	}
}
