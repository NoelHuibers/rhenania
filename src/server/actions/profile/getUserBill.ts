"use server";

import { desc, eq } from "drizzle-orm";
import { dayKeyInTZ } from "~/lib/time";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { billItems, billPeriods, bills } from "~/server/db/schema";
import {
	type GetraenkekassePayment,
	getGetraenkekassePayment,
} from "~/server/lib/getraenkekasse-payment";
import { log } from "~/server/lib/log";

export type BillData = {
	status: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen";
	total: number;
	drinksTotal: number;
	fees: number;
	oldBalance: number;
	billNumber: string;
	lastUpdated: string;
	umlage: number;
	billId: string;
	userName: string;
};

export type BillItem = {
	item: string;
	quantity: number;
	price: number;
	total: number;
};

export type BillPayment = GetraenkekassePayment;

export async function getUserBillingData(): Promise<{
	billData: BillData | null;
	billItems: BillItem[];
	/** Where to pay: same account + PayPal link the bill PDF prints. */
	payment: BillPayment | null;
}> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}

	try {
		// Get the user's most recent bill
		const userBills = await db
			.select({
				bill: bills,
				billPeriod: billPeriods,
			})
			.from(bills)
			.leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
			.where(eq(bills.userId, session.user.id))
			.orderBy(desc(bills.createdAt))
			.limit(1);

		if (userBills.length === 0) {
			return {
				billData: null,
				billItems: [],
				payment: null,
			};
		}

		// biome-ignore lint/style/noNonNullAssertion: guarded by length check above
		const userBill = userBills[0]!;
		const bill = userBill.bill;
		const billPeriod = userBill.billPeriod;

		// Get bill items for this bill
		const [items, payment] = await Promise.all([
			db.select().from(billItems).where(eq(billItems.billId, bill.id)),
			getGetraenkekassePayment(),
		]);

		// Transform data to match the component's expected format
		const billData: BillData = {
			status: bill.status,
			total: bill.total,
			drinksTotal: bill.drinksTotal,
			fees: bill.fees,
			oldBalance: bill.oldBillingAmount,
			umlage: bill.umlage,
			billNumber: billPeriod?.billNumber?.toString() ?? "N/A",
			lastUpdated: dayKeyInTZ(bill.updatedAt ?? bill.createdAt),
			billId: bill.id,
			userName: bill.userName,
		};

		const transformedBillItems: BillItem[] = items.map((item) => ({
			item: item.drinkName,
			quantity: item.amount,
			price: item.pricePerDrink,
			total: item.totalPricePerDrink,
		}));

		// Add fees as a separate item if they exist
		if (bill.fees > 0) {
			transformedBillItems.push({
				item: "Service Fee",
				quantity: 1,
				price: bill.fees,
				total: bill.fees,
			});
		}

		return {
			billData,
			billItems: transformedBillItems,
			payment,
		};
	} catch (error) {
		await log.error("Error fetching billing data", { err: error });
		throw new Error("Failed to fetch billing data");
	}
}
