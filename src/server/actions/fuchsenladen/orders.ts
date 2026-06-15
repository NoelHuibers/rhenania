"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { fuchsenOrders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
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

		if (data.amount <= 0) {
			return { success: false, error: "Bestellmenge muss größer als 0 sein" };
		}

		if (
			Math.abs(data.total - data.pricePerUnit * data.amount) > 0.001
		) {
			return { success: false, error: "Gesamtpreis-Berechnung ist inkorrekt" };
		}

		const userId = session.user.id;
		const userName = await getUserName();

		if (!userName || typeof userName !== "string") {
			return { success: false, error: "Benutzername konnte nicht ermittelt werden" };
		}

		const [order] = await db
			.insert(fuchsenOrders)
			.values({
				userId,
				userName,
				itemId: data.itemId,
				itemName: data.itemName,
				amount: data.amount,
				pricePerUnit: data.pricePerUnit,
				total: data.total,
			})
			.returning();

		revalidatePath("/fuchsenladen");
		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, orderId: order?.id };
	} catch (error) {
		console.error("Error creating fuchsen order:", error);
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
		console.error("Error fetching user fuchsen orders:", error);
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

		const openTotal = orders
			.filter((o) => o.status === "Offen")
			.reduce((sum, o) => sum + o.total, 0);
		const paidTotal = orders
			.filter((o) => o.status === "Bezahlt")
			.reduce((sum, o) => sum + o.total, 0);
		const openCount = orders.filter((o) => o.status === "Offen").length;

		return { openTotal, paidTotal, openCount };
	} catch (error) {
		console.error("Error fetching fuchsen summary:", error);
		return { openTotal: 0, paidTotal: 0, openCount: 0 };
	}
}

export async function getAllFuchsenOrders() {
	try {
		const db = await getCurrentTenantDb();
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.orderBy(desc(fuchsenOrders.createdAt));
		return orders;
	} catch (error) {
		console.error("Error fetching all fuchsen orders:", error);
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
				existing.openTotal += order.total;
				existing.openCount += 1;
			} else {
				existing.paidTotal += order.total;
			}
			byUser.set(order.userId, existing);
		}

		return Array.from(byUser.values()).sort(
			(a, b) => b.openTotal - a.openTotal,
		);
	} catch (error) {
		console.error("Error aggregating fuchsen bills:", error);
		return [];
	}
}

export async function getFuchsenOrdersForUser(userId: string) {
	try {
		const db = await getCurrentTenantDb();
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, userId))
			.orderBy(desc(fuchsenOrders.createdAt));
		return orders;
	} catch (error) {
		console.error("Error fetching fuchsen orders for user:", error);
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
		if (!auth.ok) return { success: false, error: auth.error };

		const db = await getCurrentTenantDb();
		const [updated] = await db
			.update(fuchsenOrders)
			.set({
				status,
				paidAt: status === "Bezahlt" ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(fuchsenOrders.id, orderId))
			.returning();

		if (!updated) {
			return { success: false, error: "Bestellung nicht gefunden" };
		}

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, data: updated };
	} catch (error) {
		console.error("Error updating fuchsen order status:", error);
		return { success: false, error: "Fehler beim Aktualisieren des Status" };
	}
}

export async function markAllUserFuchsenOrdersPaid(userId: string) {
	try {
		const authCheck = await requireFuchsenwart();
		if (!authCheck.ok) return { success: false, error: authCheck.error };

		const db = await getCurrentTenantDb();
		const result = await db
			.update(fuchsenOrders)
			.set({
				status: "Bezahlt",
				paidAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(fuchsenOrders.userId, userId),
					eq(fuchsenOrders.status, "Offen"),
				),
			)
			.returning();

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true, count: result.length };
	} catch (error) {
		console.error("Error marking all orders paid:", error);
		return { success: false, error: "Fehler beim Markieren als bezahlt" };
	}
}

export async function deleteFuchsenOrder(orderId: string) {
	try {
		const authCheck = await requireFuchsenwart();
		if (!authCheck.ok) return { success: false, error: authCheck.error };

		const db = await getCurrentTenantDb();
		await db.delete(fuchsenOrders).where(eq(fuchsenOrders.id, orderId));

		revalidatePath("/fuchsenwart");
		revalidatePath("/profile");

		return { success: true };
	} catch (error) {
		console.error("Error deleting fuchsen order:", error);
		return { success: false, error: "Fehler beim Löschen der Bestellung" };
	}
}
