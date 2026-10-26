// user-bill-data.ts — what a member's Getränke bill PDF shows.
//
// Pure, so the printed lines can be checked against the stored total: the
// summary lines (Rechnungsbetrag, Alte Rechnung, Mahnung, Umlage) are the
// stored parts of the bill and add up to `bill.total` (#11, #13).

import { sumMoney } from "~/lib/money";
import type { billItems, billPeriods, bills } from "~/server/db/schema";

type Bill = Pick<
	typeof bills.$inferSelect,
	| "id"
	| "userId"
	| "userName"
	| "status"
	| "drinksTotal"
	| "oldBillingAmount"
	| "fees"
	| "umlage"
	| "total"
	| "paidAt"
>;
type Period = Pick<typeof billPeriods.$inferSelect, "billNumber" | "createdAt">;
type Item = Pick<
	typeof billItems.$inferSelect,
	"drinkName" | "amount" | "pricePerDrink" | "totalPricePerDrink"
>;

export type BillSummaryLine = { label: string; amount: number };

export type UserBillData = {
	bill: Bill;
	billPeriod: Period;
	items: Item[];
	/** Rows under the item table, in print order. */
	summary: BillSummaryLine[];
	total: number;
};

export function buildUserBillData(
	bill: Bill,
	period: Period,
	items: Item[],
): UserBillData {
	return {
		bill,
		billPeriod: { billNumber: period.billNumber, createdAt: period.createdAt },
		items,
		summary: [
			{ label: "Rechnungsbetrag:", amount: bill.drinksTotal },
			{ label: "Alte Rechnung:", amount: bill.oldBillingAmount },
			{ label: "Mahnung:", amount: bill.fees },
			{ label: "Umlage:", amount: bill.umlage },
		],
		total: bill.total,
	};
}

/** Sum of the summary lines in whole cents. */
export function summaryTotal(data: UserBillData): number {
	return sumMoney(data.summary.map((line) => line.amount));
}
