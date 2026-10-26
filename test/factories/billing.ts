// Billing fixtures: orders, bill periods, bills (with items), user
// preferences and kontos written straight into the current tenant DB, so a
// test can start from any point of the billing lifecycle.

import { eq } from "drizzle-orm";

import {
	billItems,
	billPeriods,
	bills,
	kontos,
	orders,
	userPreferences,
} from "~/server/db/schema";
import { createDrink, type TestUser, tenantDb } from "../harness";

/** Valid German IBANs (mod-97 checked) for konto fixtures. */
export const VALID_IBAN = "DE89370400440532013000";
export const OTHER_VALID_IBAN = "DE02120300000000202051";

type BillStatus = (typeof bills.$inferSelect)["status"];

let counter = 0;

/**
 * Inserts an unbilled order. Defaults to one unit of a fresh 1.50 € drink
 * booked by `user` for themselves.
 */
export async function createOrderRow(opts: {
	user: Pick<TestUser, "id" | "name">;
	drink?: { id: string; name: string; price: number };
	amount?: number;
	pricePerUnit?: number;
	bookingFor?: string | null;
	inBill?: boolean;
	createdAt?: Date;
}) {
	const drink = opts.drink ?? (await createDrink());
	const amount = opts.amount ?? 1;
	const pricePerUnit = opts.pricePerUnit ?? drink.price;
	const [row] = await tenantDb()
		.insert(orders)
		.values({
			userId: opts.user.id,
			userName: opts.user.name ?? "",
			drinkId: drink.id,
			drinkName: drink.name,
			amount,
			pricePerUnit,
			total: amount * pricePerUnit,
			bookingFor: opts.bookingFor ?? null,
			inBill: opts.inBill ?? false,
			...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
		})
		.returning();
	if (!row) {
		throw new Error("Could not create order");
	}
	return row;
}

export async function createBillPeriodRow(
	opts: { billNumber?: string; createdAt?: Date; closedAt?: Date | null } = {},
) {
	const [row] = await tenantDb()
		.insert(billPeriods)
		.values({
			billNumber: opts.billNumber ?? `KW-TEST-${++counter}`,
			createdAt: opts.createdAt ?? new Date(),
			closedAt: opts.closedAt ?? null,
		})
		.returning();
	if (!row) {
		throw new Error("Could not create bill period");
	}
	return row;
}

/**
 * Inserts a bill (and optional items) in `periodId`. `total` defaults to
 * drinks + old amount + fees + Umlage.
 */
export async function createBillRow(opts: {
	periodId: string;
	user: Pick<TestUser, "id" | "name">;
	status?: BillStatus;
	drinksTotal?: number;
	oldBillingAmount?: number;
	fees?: number;
	umlage?: number;
	total?: number;
	createdAt?: Date;
	paidAt?: Date | null;
	items?: Array<{ drinkName: string; amount: number; pricePerDrink: number }>;
}) {
	const drinksTotal = opts.drinksTotal ?? 0;
	const oldBillingAmount = opts.oldBillingAmount ?? 0;
	const fees = opts.fees ?? 0;
	const umlage = opts.umlage ?? 0;
	const [bill] = await tenantDb()
		.insert(bills)
		.values({
			billPeriodId: opts.periodId,
			userId: opts.user.id,
			userName: opts.user.name ?? "",
			status: opts.status ?? "Unbezahlt",
			drinksTotal,
			oldBillingAmount,
			fees,
			umlage,
			total: opts.total ?? drinksTotal + oldBillingAmount + fees + umlage,
			createdAt: opts.createdAt ?? new Date(),
			paidAt: opts.paidAt ?? null,
		})
		.returning();
	if (!bill) {
		throw new Error("Could not create bill");
	}
	for (const item of opts.items ?? []) {
		await tenantDb()
			.insert(billItems)
			.values({
				billId: bill.id,
				drinkName: item.drinkName,
				amount: item.amount,
				pricePerDrink: item.pricePerDrink,
				totalPricePerDrink: item.amount * item.pricePerDrink,
			});
	}
	return bill;
}

/** A group (event) pseudo-user as `createNewBilling` derives it. */
export function eventUser(name: string) {
	return { id: `event-${name.toLowerCase().replace(/\s+/g, "-")}`, name };
}

export async function setUserPreference(
	userId: string,
	key: string,
	value: string,
) {
	await tenantDb()
		.insert(userPreferences)
		.values({ userId, key, value, valueType: "boolean" });
}

export async function createKontoRow(
	opts: Partial<typeof kontos.$inferInsert> = {},
) {
	const [row] = await tenantDb()
		.insert(kontos)
		.values({
			kasseType: "Getränkekasse",
			iban: VALID_IBAN,
			bic: "COBADEFFXXX",
			bankName: "Testbank",
			...opts,
		})
		.returning();
	if (!row) {
		throw new Error("Could not create konto");
	}
	return row;
}

export async function billsOf(userId: string) {
	return tenantDb()
		.select()
		.from(bills)
		.where(eq(bills.userId, userId))
		.orderBy(bills.createdAt);
}

/** The text runs of an uncompressed jsPDF document, in drawing order. */
export function pdfText(pdf: Buffer): string[] {
	const raw = pdf.toString("latin1");
	return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
		(m[1] ?? "").replace(/\\(.)/g, "$1"),
	);
}

/** The text run drawn right after `label` (e.g. the amount of a summary row). */
export function pdfValueAfter(pdf: Buffer, label: string): string | undefined {
	const runs = pdfText(pdf);
	const index = runs.indexOf(label);
	return index === -1 ? undefined : runs[index + 1];
}

export async function itemsOf(billId: string) {
	return tenantDb()
		.select()
		.from(billItems)
		.where(eq(billItems.billId, billId))
		.orderBy(billItems.drinkName);
}
