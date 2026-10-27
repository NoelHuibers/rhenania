// open-bill.ts — "you have an open bill of 23,40 €" (#80).
//
// The member's latest Getränke bill, when it still has to be paid, with
// everything the pay button needs: amount, due date, reference and where to
// pay. Server-only (not a server action): the user id comes from the
// page's session. The payment target is the same one the bill PDF prints.

import { desc, eq } from "drizzle-orm";

import { paymentReference } from "~/lib/bill-payment";
import { roundToCent } from "~/lib/money";
import { addDaysInTZ, dayKeyInTZ } from "~/lib/time";
import { db } from "~/server/db";
import { billPeriods, bills } from "~/server/db/schema";
import {
	type GetraenkekassePayment,
	getActiveGetraenkekasseKontos,
	getGetraenkeBillingProfile,
	resolveGetraenkekassePayment,
} from "~/server/lib/getraenkekasse-payment";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export type OpenBill = {
	billId: string;
	billNumber: string;
	total: number;
	/** Last day to pay (YYYY-MM-DD, Berlin), from the bill date and the Kasse's payment terms. */
	dueDate: string | null;
	/** Verwendungszweck and PayPal note. */
	reference: string;
	/** Where to pay; null while the Corps has not set up its Getränkekasse. */
	payment: GetraenkekassePayment | null;
};

type BillState = { status: string; total: number };

/**
 * Whether the member still has to pay this (their latest) bill. Paid,
 * deferred (Gestundet) and carried-over bills are not open, and neither is
 * a bill that comes to nothing.
 */
export function isOpenBill(bill: BillState | null | undefined): boolean {
	return !!bill && bill.status === "Unbezahlt" && roundToCent(bill.total) > 0;
}

/** The member's open bill, or null when there is nothing to pay. */
export async function getOpenBill(userId: string): Promise<OpenBill | null> {
	const [latest] = await db
		.select({
			id: bills.id,
			status: bills.status,
			total: bills.total,
			userName: bills.userName,
			createdAt: bills.createdAt,
			billNumber: billPeriods.billNumber,
			periodCreatedAt: billPeriods.createdAt,
		})
		.from(bills)
		.leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
		.where(eq(bills.userId, userId))
		.orderBy(desc(bills.createdAt))
		.limit(1);
	if (!latest || !isOpenBill(latest)) {
		return null;
	}

	const [tenant, activeKontos, profile] = await Promise.all([
		getCurrentTenant(),
		getActiveGetraenkekasseKontos(),
		getGetraenkeBillingProfile(),
	]);
	const billNumber = latest.billNumber ?? "N/A";
	const billedAt = latest.periodCreatedAt ?? latest.createdAt;
	return {
		billId: latest.id,
		billNumber,
		total: roundToCent(latest.total),
		dueDate:
			profile.paymentDueDays > 0
				? dayKeyInTZ(addDaysInTZ(billedAt, profile.paymentDueDays))
				: null,
		reference: paymentReference(latest.userName, billNumber),
		payment: resolveGetraenkekassePayment(
			activeKontos,
			profile.accountHolder,
			tenant?.branding?.paypalUrl,
		),
	};
}
