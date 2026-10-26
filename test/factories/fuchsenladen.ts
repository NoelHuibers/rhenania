// Fixtures for the Fuchsenladen (shop items, orders, bills). Rows are written
// straight into the current tenant DB so tests can set up any history
// (old periods, paid bills) without going through the actions.

import {
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenItems,
	fuchsenOrders,
} from "~/server/db/schema";
import { requireTenant, testState } from "../state";

let counter = 0;
const next = () => ++counter;

export async function createFuchsenItem(
	opts: Partial<typeof fuchsenItems.$inferInsert> = {},
	tenantId = testState.tenantId,
) {
	const [item] = await requireTenant(tenantId)
		.db.insert(fuchsenItems)
		.values({ name: `Artikel ${next()}`, price: 1, ...opts })
		.returning();
	if (!item) {
		throw new Error("Could not create fuchsen item");
	}
	return item;
}

/** An order of `amount` x `item` at the item's price, booked to `user`. */
export async function createFuchsenOrder(
	opts: {
		user: { id: string; name: string | null };
		item: { id: string; name: string; price: number };
		amount?: number;
		status?: "Offen" | "Bezahlt";
		billId?: string | null;
		createdAt?: Date;
	},
	tenantId = testState.tenantId,
) {
	const amount = opts.amount ?? 1;
	const [order] = await requireTenant(tenantId)
		.db.insert(fuchsenOrders)
		.values({
			userId: opts.user.id,
			userName: opts.user.name ?? "",
			itemId: opts.item.id,
			itemName: opts.item.name,
			amount,
			pricePerUnit: opts.item.price,
			total: opts.item.price * amount,
			status: opts.status ?? "Offen",
			billId: opts.billId ?? null,
			...(opts.createdAt && { createdAt: opts.createdAt }),
		})
		.returning();
	if (!order) {
		throw new Error("Could not create fuchsen order");
	}
	return order;
}

/** A bill period with one bill per entry, as a past billing run left it. */
export async function createFuchsenBillPeriod(
	opts: {
		billNumber?: string;
		createdAt?: Date;
		closedAt?: Date | null;
		bills?: {
			user: { id: string; name: string | null };
			itemsTotal: number;
			oldBillingAmount?: number;
			status?: "Bezahlt" | "Unbezahlt" | "Gestundet";
		}[];
	} = {},
	tenantId = testState.tenantId,
) {
	const db = requireTenant(tenantId).db;
	const bills = opts.bills ?? [];
	const totalOf = (b: (typeof bills)[number]) =>
		b.itemsTotal + (b.oldBillingAmount ?? 0);
	const [period] = await db
		.insert(fuchsenBillPeriods)
		.values({
			billNumber: opts.billNumber ?? `KW-TEST-${next()}`,
			totalAmount: bills.reduce((sum, b) => sum + totalOf(b), 0),
			closedAt: opts.closedAt ?? null,
			...(opts.createdAt && { createdAt: opts.createdAt }),
		})
		.returning();
	if (!period) {
		throw new Error("Could not create fuchsen bill period");
	}
	const created: (typeof fuchsenBills.$inferSelect)[] = [];
	for (const b of bills) {
		const [bill] = await db
			.insert(fuchsenBills)
			.values({
				billPeriodId: period.id,
				userId: b.user.id,
				userName: b.user.name ?? "",
				status: b.status ?? "Unbezahlt",
				itemsTotal: b.itemsTotal,
				oldBillingAmount: b.oldBillingAmount ?? 0,
				total: totalOf(b),
				...(opts.createdAt && { createdAt: opts.createdAt }),
			})
			.returning();
		if (!bill) {
			throw new Error("Could not create fuchsen bill");
		}
		created.push(bill);
	}
	return { period, bills: created };
}
