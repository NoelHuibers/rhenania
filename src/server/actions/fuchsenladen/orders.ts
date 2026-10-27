"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isValidOrderAmount, MAX_ORDER_AMOUNT } from "~/lib/drink-order";
import { addMoney, roundToCent, sumMoney } from "~/lib/money";
import { auth } from "~/server/auth";
import { fuchsenBills, fuchsenItems, fuchsenOrders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { ROLES, requireRole } from "~/server/lib/authz";
import { log } from "~/server/lib/log";
import { hasRole } from "../admin/userRoles";
import { getUserName } from "../getUserName";

export type FuchsenOrder = typeof fuchsenOrders.$inferSelect;

export interface CreateFuchsenOrderRequest {
	itemId: string;
	itemName: string;
	amount: number;
	pricePerUnit: number;
	total: number;
}

export interface FuchsenOrderResult {
	success: boolean;
	error?: string;
	orderId?: string;
}

export async function createFuchsenOrder(
	data: CreateFuchsenOrderRequest,
): Promise<FuchsenOrderResult> {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();

		if (!session?.user?.id) {
			return {
				success: false,
				error: "Du musst angemeldet sein, um zu bestellen",
			};
		}

		if (!isValidOrderAmount(data.amount)) {
			return {
				success: false,
				error: `Bitte eine ganze Anzahl zwischen 1 und ${MAX_ORDER_AMOUNT} wählen`,
			};
		}

		// The server decides name and price from the item; client values are
		// display-only and never stored.
		const [item] = await db
			.select({
				id: fuchsenItems.id,
				name: fuchsenItems.name,
				price: fuchsenItems.price,
				available: fuchsenItems.isCurrentlyAvailable,
			})
			.from(fuchsenItems)
			.where(eq(fuchsenItems.id, data.itemId))
			.limit(1);
		if (!item?.available) {
			return { success: false, error: "Artikel nicht verfügbar" };
		}
		const pricePerUnit = item.price;
		const total = roundToCent(pricePerUnit * data.amount);

		const userId = session.user.id;
		const userName = await getUserName();

		if (!userName || typeof userName !== "string") {
			return {
				success: false,
				error: "Benutzername konnte nicht ermittelt werden",
			};
		}

		const [order] = await db
			.insert(fuchsenOrders)
			.values({
				userId,
				userName,
				itemId: item.id,
				itemName: item.name,
				amount: data.amount,
				pricePerUnit,
				total,
			})
			.returning();

		revalidatePath("/fuchsenladen");
		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, orderId: order?.id };
	} catch (error) {
		await log.error("Error creating fuchsen order", { err: error });
		return {
			success: false,
			error: "Bestellung konnte nicht erstellt werden. Bitte erneut versuchen.",
		};
	}
}

export async function getMyFuchsenOrders() {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();
		if (!session?.user?.id) {
			throw new Error("Authentifizierung erforderlich");
		}

		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, session.user.id))
			.orderBy(desc(fuchsenOrders.createdAt));

		return orders;
	} catch (error) {
		await log.error("Error fetching user fuchsen orders", { err: error });
		return [];
	}
}

export async function getMyFuchsenSummary() {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();
		if (!session?.user?.id) {
			return { openTotal: 0, paidTotal: 0, openCount: 0 };
		}

		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, session.user.id));

		const openTotal = sumMoney(
			orders.filter((o) => o.status === "Offen").map((o) => o.total),
		);
		const paidTotal = sumMoney(
			orders.filter((o) => o.status === "Bezahlt").map((o) => o.total),
		);
		const openCount = orders.filter((o) => o.status === "Offen").length;

		return { openTotal, paidTotal, openCount };
	} catch (error) {
		await log.error("Error fetching fuchsen summary", { err: error });
		return { openTotal: 0, paidTotal: 0, openCount: 0 };
	}
}

export async function getAllFuchsenOrders() {
	await requireRole(ROLES.fuchsen);
	try {
		const db = await getCurrentTenantDb();
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.orderBy(desc(fuchsenOrders.createdAt));
		return orders;
	} catch (error) {
		await log.error("Error fetching all fuchsen orders", { err: error });
		return [];
	}
}

// Aggregated bills per user (Fuchsenwart view): one row per user with totals.
export interface FuchsenUserBill {
	userId: string;
	userName: string;
	openTotal: number;
	paidTotal: number;
	openCount: number;
	totalCount: number;
}

export async function getFuchsenBillsByUser(): Promise<FuchsenUserBill[]> {
	await requireRole(ROLES.fuchsen);
	try {
		const db = await getCurrentTenantDb();
		const orders = await db.select().from(fuchsenOrders);

		const byUser = new Map<string, FuchsenUserBill>();
		for (const order of orders) {
			const existing = byUser.get(order.userId) ?? {
				userId: order.userId,
				userName: order.userName,
				openTotal: 0,
				paidTotal: 0,
				openCount: 0,
				totalCount: 0,
			};
			existing.totalCount += 1;
			if (order.status === "Offen") {
				existing.openTotal = addMoney(existing.openTotal, order.total);
				existing.openCount += 1;
			} else {
				existing.paidTotal = addMoney(existing.paidTotal, order.total);
			}
			byUser.set(order.userId, existing);
		}

		return Array.from(byUser.values()).sort(
			(a, b) => b.openTotal - a.openTotal,
		);
	} catch (error) {
		await log.error("Error aggregating fuchsen bills", { err: error });
		return [];
	}
}

export async function getFuchsenOrdersForUser(userId: string) {
	await requireRole(ROLES.fuchsen);
	try {
		const db = await getCurrentTenantDb();
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, userId))
			.orderBy(desc(fuchsenOrders.createdAt));
		return orders;
	} catch (error) {
		await log.error("Error fetching fuchsen orders for user", { err: error });
		return [];
	}
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
	return { ok: true as const };
}

export async function updateFuchsenOrderStatus(
	orderId: string,
	status: "Offen" | "Bezahlt",
) {
	try {
		const auth = await requireFuchsenwart();
		if (!auth.ok) {
			return { success: false, error: auth.error };
		}

		const db = await getCurrentTenantDb();
		const [order] = await db
			.select({ billId: fuchsenOrders.billId })
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.id, orderId))
			.limit(1);
		if (!order) {
			return { success: false, error: "Bestellung nicht gefunden" };
		}
		// A billed order is part of its bill's total; paying it alone would
		// leave the bill open and the amount would be carried again (#143).
		if (order.billId) {
			return {
				success: false,
				error:
					"Bestellung ist bereits abgerechnet. Bitte den Status der Rechnung ändern.",
			};
		}

		const [updated] = await db
			.update(fuchsenOrders)
			.set({
				status,
				paidAt: status === "Bezahlt" ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(fuchsenOrders.id, orderId))
			.returning();

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, data: updated };
	} catch (error) {
		await log.error("Error updating fuchsen order status", { err: error });
		return { success: false, error: "Fehler beim Aktualisieren des Status" };
	}
}

export async function markAllUserFuchsenOrdersPaid(userId: string) {
	try {
		const authCheck = await requireFuchsenwart();
		if (!authCheck.ok) {
			return { success: false, error: authCheck.error };
		}

		const db = await getCurrentTenantDb();
		const now = new Date();
		// "Alle bezahlt" settles everything the member owes: every open order
		// and every bill that is still open or was carried into a later one,
		// so the next billing run carries nothing forward (#143).
		const result = await db.transaction(async (tx) => {
			const paid = await tx
				.update(fuchsenOrders)
				.set({ status: "Bezahlt", paidAt: now, updatedAt: now })
				.where(
					and(
						eq(fuchsenOrders.userId, userId),
						eq(fuchsenOrders.status, "Offen"),
					),
				)
				.returning({ id: fuchsenOrders.id });
			await tx
				.update(fuchsenBills)
				.set({ status: "Bezahlt", paidAt: now, updatedAt: now })
				.where(
					and(
						eq(fuchsenBills.userId, userId),
						inArray(fuchsenBills.status, [
							"Unbezahlt",
							"Gestundet",
							"Übertragen",
						]),
					),
				);
			return paid;
		});

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, count: result.length };
	} catch (error) {
		await log.error("Error marking all orders paid", { err: error });
		return { success: false, error: "Fehler beim Markieren als bezahlt" };
	}
}

export async function deleteFuchsenOrder(orderId: string) {
	try {
		const authCheck = await requireFuchsenwart();
		if (!authCheck.ok) {
			return { success: false, error: authCheck.error };
		}

		const db = await getCurrentTenantDb();
		await db.delete(fuchsenOrders).where(eq(fuchsenOrders.id, orderId));

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true };
	} catch (error) {
		await log.error("Error deleting fuchsen order", { err: error });
		return { success: false, error: "Fehler beim Löschen der Bestellung" };
	}
}
