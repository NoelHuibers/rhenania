// run.ts — the Fuchsenladen billing run (service, #33).
//
// Like the drinks billing: every open, not-yet-billed order goes onto one
// bill per member; whatever a member still owes (or has as credit) from ANY
// earlier period is carried into their new bill (members with debt but no
// new orders get a carry-only bill), and the carried bills are closed out
// as "Übertragen" so the amount is listed and counted once.
//
// Round trips (#23): one read batch, the plan in memory
// (server/domain/billing/plan.ts, shared with the Getränke run) and one
// atomic write batch, however many members there are.

import "server-only";

import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { fuchsenBillPeriods } from "~/server/db/schema";
import { FUCHSEN_RULES, planBillingRun } from "~/server/domain/billing/plan";
import {
	BILLING_CONFLICT_MESSAGE,
	isConstraintOn,
} from "~/server/lib/billing-batch";
import { ConflictError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type FuchsenRunResult = {
	message: string;
	billsCreated: number;
	totalAmount: number;
	/** The new period; none when there was nothing to bill. */
	billPeriod?: { id: string; billNumber: string };
};

/**
 * Bills every open order on behalf of `actor` and carries open bills over.
 * Throws a ConflictError when another run or a change since the read got
 * in the way; nothing is written then.
 */
export async function runFuchsenBilling(
	{ db, now: clock }: TenantScope,
	actor: { id: string },
): Promise<FuchsenRunResult> {
	// One read for everything the run computes from (#23).
	const now = clock();
	const base = billNumberBase(now);
	const state = await repo.readRunState(db, { billNumberPrefix: base });

	if (state.unbilledOrders.length === 0) {
		return {
			message: "Keine offenen Bestellungen zum Abrechnen gefunden",
			billsCreated: 0,
			totalAmount: 0,
		};
	}

	// KW-WW-YY (ISO week in Europe/Berlin); further runs in the same week
	// get -2, -3, etc.
	const billNumber = nextBillNumber(base, state.billNumbers);
	const billPeriodId = crypto.randomUUID();

	// Plan the bills: new orders and carried debt per member.
	const plan = planBillingRun({
		unbilledOrders: state.unbilledOrders.map((o) => ({
			...o,
			name: o.itemName,
		})),
		outstandingBills: state.outstanding,
		rules: FUCHSEN_RULES,
	});

	// One atomic write. It is refused when another run took the bill
	// number, or (a NULL bill number) when the debts or orders read above
	// changed in the meantime.
	try {
		await repo.writeRun(db, {
			period: {
				id: billPeriodId,
				billNumber,
				totalAmount: plan.periodTotal,
				createdBy: actor.id,
				now,
			},
			read: state,
			bills: plan.bills.map((bill) => ({
				id: bill.id,
				billPeriodId,
				userId: bill.userId,
				userName: bill.userName,
				status: "Unbezahlt",
				oldBillingAmount: bill.oldBillingAmount,
				itemsTotal: bill.ordersTotal,
				total: bill.total,
				createdAt: now,
			})),
			items: plan.items.map((line) => ({
				id: line.id,
				billId: line.billId,
				itemName: line.name,
				amount: line.amount,
				pricePerItem: line.pricePerUnit,
				totalPrice: line.total,
				createdAt: now,
			})),
			settledUserIds: plan.settleUserIds,
			billedOrders: plan.bills
				.filter((bill) => bill.orders.length > 0)
				.map((bill) => ({
					billId: bill.id,
					ids: bill.orders.map((o) => o.id),
				})),
			orderIds: plan.orderIds,
		});
	} catch (error) {
		if (
			!isConstraintOn(error, fuchsenBillPeriods, fuchsenBillPeriods.billNumber)
		) {
			throw error;
		}
		await log.error("Fuchsen billing conflicted with a concurrent change", {
			err: error,
		});
		throw new ConflictError(BILLING_CONFLICT_MESSAGE);
	}

	return {
		message: `Erfolgreich ${plan.bills.length} Rechnung(en) erstellt`,
		billsCreated: plan.bills.length,
		totalAmount: plan.periodTotal,
		billPeriod: { id: billPeriodId, billNumber },
	};
}
