// repo.ts — the booking accounts in the tenant DB: the `booking_account`
// rows and what the orders say about them. No auth, no rules.

import "server-only";

import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import { bookingAccounts, orders } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type BookingAccountRow = typeof bookingAccounts.$inferSelect;

/** Every account, archived ones included, in display order. */
export async function listAccounts(db: TenantDb): Promise<BookingAccountRow[]> {
	return db
		.select()
		.from(bookingAccounts)
		.orderBy(asc(bookingAccounts.sortOrder), asc(bookingAccounts.createdAt));
}

export async function findAccount(
	db: TenantDb,
	id: string,
): Promise<BookingAccountRow | null> {
	const [row] = await db
		.select()
		.from(bookingAccounts)
		.where(eq(bookingAccounts.id, id))
		.limit(1);
	return row ?? null;
}

/** The active (not archived) account with exactly this name, or null. */
export async function findActiveAccountByName(
	db: TenantDb,
	name: string,
): Promise<BookingAccountRow | null> {
	const [row] = await db
		.select()
		.from(bookingAccounts)
		.where(
			and(eq(bookingAccounts.name, name), eq(bookingAccounts.archived, false)),
		)
		.limit(1);
	return row ?? null;
}

export async function insertAccount(
	db: TenantDb,
	values: typeof bookingAccounts.$inferInsert,
) {
	await db.insert(bookingAccounts).values(values);
}

export async function updateAccount(
	db: TenantDb,
	id: string,
	values: Partial<Pick<BookingAccountRow, "pinned" | "archived">>,
) {
	await db
		.update(bookingAccounts)
		.set(values)
		.where(eq(bookingAccounts.id, id));
}

/** Writes `ids` as the new order, 0..n-1, in one batch. */
export async function saveOrder(db: TenantDb, ids: readonly string[]) {
	const [first, ...rest] = ids.map((id, sortOrder) =>
		db
			.update(bookingAccounts)
			.set({ sortOrder })
			.where(eq(bookingAccounts.id, id)),
	);
	if (first) {
		await db.batch([first, ...rest]);
	}
}

export async function deleteAccount(db: TenantDb, id: string) {
	await db.delete(bookingAccounts).where(eq(bookingAccounts.id, id));
}

/** How many orders were ever booked on `name`. */
export async function ordersOn(db: TenantDb, name: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(orders)
		.where(eq(orders.bookingFor, name));
	return row?.n ?? 0;
}

/**
 * Orders not billed yet, per group account: what the next billing run puts
 * on each group bill. Reads only the unbilled orders (partial index).
 */
export async function unbilledByAccount(db: TenantDb) {
	return db
		.select({
			name: orders.bookingFor,
			orders: count(),
			total: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
		})
		.from(orders)
		.where(and(eq(orders.inBill, false), isNotNull(orders.bookingFor)))
		.groupBy(orders.bookingFor);
}
