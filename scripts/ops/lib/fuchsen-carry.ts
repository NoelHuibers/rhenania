// scripts/ops/lib/fuchsen-carry.ts — plan the one-off repair of Fuchsen bills
// that the old billing carried into a later bill without closing them (#12).
//
// The old run copied the total of a member's open bill from the PREVIOUS
// period into the new bill's `oldBillingAmount` and left the old bill
// "Unbezahlt"/"Gestundet". The current billing sums ALL open bills, so those
// amounts would be charged a second time. This module decides, per bill:
//   - carried into a later bill that is still open → "Übertragen"
//   - carried into a later bill that was paid      → "Bezahlt" (with orders)
// Anything that does not match exactly is only reported for a human.

export type FuchsenBillStatus =
	| "Bezahlt"
	| "Unbezahlt"
	| "Gestundet"
	| "Übertragen";

export type PlanBill = {
	id: string;
	billPeriodId: string;
	userId: string;
	userName: string;
	status: FuchsenBillStatus;
	total: number;
	oldBillingAmount: number;
	paidAt: Date | null;
};

export type PlanPeriod = { id: string; billNumber: string; createdAt: Date };

export type BillChange = {
	billId: string;
	userName: string;
	billNumber: string;
	from: FuchsenBillStatus;
	to: "Bezahlt" | "Übertragen";
	paidAt: Date | null;
	/** The later bill whose Übertrag contains this bill's total. */
	carriedInto: string;
};

export type Anomaly = {
	billId: string;
	userName: string;
	billNumber: string;
	reason: string;
};

const isOpen = (s: FuchsenBillStatus) => s === "Unbezahlt" || s === "Gestundet";
const cents = (n: number) => Math.round(n * 100);

type Effective = { status: FuchsenBillStatus; paidAt: Date | null };

/**
 * Decides what to do with the bill carried into `later` (if any). `head` is
 * the effective status of `later` after the repair of newer bills.
 */
function decide(
	later: PlanBill,
	earlier: PlanBill | undefined,
	head: Effective,
):
	| { change: { status: BillChange["to"]; paidAt: Date | null } }
	| { anomaly: string }
	| null {
	const carried = later.oldBillingAmount.toFixed(2);
	if (!earlier) {
		return {
			anomaly: `carries ${carried} € but the member has no bill in the period before`,
		};
	}
	if (cents(earlier.total) !== cents(later.oldBillingAmount)) {
		return {
			anomaly: `carries ${carried} € but the previous bill totals ${earlier.total.toFixed(2)} €`,
		};
	}
	if (isOpen(earlier.status)) {
		return head.status === "Bezahlt"
			? { change: { status: "Bezahlt", paidAt: head.paidAt } }
			: { change: { status: "Übertragen", paidAt: null } };
	}
	const paidTogether =
		head.status === "Bezahlt" &&
		earlier.paidAt?.getTime() === head.paidAt?.getTime();
	if (earlier.status === "Bezahlt" && !paidTogether) {
		return {
			anomaly: `carries ${carried} € from a bill that was paid separately (possibly charged twice)`,
		};
	}
	return null;
}

export function planFuchsenCarryRepair(
	periods: PlanPeriod[],
	bills: PlanBill[],
): { changes: BillChange[]; anomalies: Anomaly[] } {
	const ordered = [...periods].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
	const index = new Map(ordered.map((p, i) => [p.id, i]));
	const numberOf = (periodId: string) =>
		ordered[index.get(periodId) ?? -1]?.billNumber ?? periodId;

	const byUser = new Map<string, Map<number, PlanBill>>();
	for (const bill of bills) {
		const i = index.get(bill.billPeriodId);
		if (i === undefined) {
			continue;
		}
		const perPeriod = byUser.get(bill.userId) ?? new Map<number, PlanBill>();
		perPeriod.set(i, bill);
		byUser.set(bill.userId, perPeriod);
	}

	const changes: BillChange[] = [];
	const anomalies: Anomaly[] = [];
	for (const perPeriod of byUser.values()) {
		// Status after the repair, so a chain resolves from the newest bill.
		const effective = new Map<string, Effective>();
		const newestFirst = [...perPeriod.keys()].sort((a, b) => b - a);
		for (const i of newestFirst) {
			const later = perPeriod.get(i);
			if (!later || cents(later.oldBillingAmount) === 0) {
				continue;
			}
			const earlier = perPeriod.get(i - 1);
			const head = effective.get(later.id) ?? {
				status: later.status,
				paidAt: later.paidAt,
			};
			const result = decide(later, earlier, head);
			if (result && "anomaly" in result) {
				anomalies.push({
					billId: later.id,
					userName: later.userName,
					billNumber: numberOf(later.billPeriodId),
					reason: result.anomaly,
				});
			} else if (result && earlier) {
				effective.set(earlier.id, result.change);
				changes.push({
					billId: earlier.id,
					userName: earlier.userName,
					billNumber: numberOf(earlier.billPeriodId),
					from: earlier.status,
					to: result.change.status,
					paidAt: result.change.paidAt,
					carriedInto: numberOf(later.billPeriodId),
				});
			}
		}
	}
	return { changes, anomalies };
}
