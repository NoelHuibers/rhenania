// plan.ts — what a billing run charges, computed without the database.
//
// Shared by the Getränke run (server/lib/billing-run.ts) and the
// Fuchsenladen run (actions/fuchsenladen/billings.ts). Both load the unbilled
// orders and the open bills, plan here and write the plan in one batch, so
// the bill maths lives in one place and is tested without a database.
//
// A run gives every member with new orders one bill, carries whatever they
// still owe from earlier periods into it (members with debt but no new
// orders get a carry-only bill) and settles the carried bills as
// "Übertragen". Getränke adds the late fee on carried amounts, group bills
// for orders booked for a group (bookingFor) and the inventory-loss Umlage.
//
// All amounts are euros rounded to whole cents and added in integer cents,
// so a bill's parts always add up to its total.

import { lateFeeFor } from "~/lib/late-fee";
import {
	fromCents,
	roundToCent,
	shareDown,
	sumMoney,
	toCents,
} from "~/lib/money";

/** An order not on a bill yet. `name` is the drink or shop item. */
export type BillableOrder = {
	id: string;
	userId: string;
	userName: string;
	name: string;
	amount: number;
	pricePerUnit: number;
	total: number;
	/** Booked for a group (Getränke only): billed on the group's bill. */
	bookingFor?: string | null;
};

/** An earlier bill that is still owed (Unbezahlt or Gestundet). */
export type OutstandingBill = {
	userId: string;
	userName: string;
	total: number;
	status: string;
};

/**
 * Where the two runs still differ (#58). Kept apart here so the refactor
 * changes no bill; which behaviour is right is decided separately.
 */
export type BillingRules = {
	/** The Mahnung on carried amounts (LATE_FEE), Getränke only. */
	lateFee: boolean;
	/**
	 * What happens when a member's open bills add up to zero or less (a
	 * credit). Both runs carry and settle a positive debt alike.
	 * - "keep-open" (Getränke): the sum is carried as is, a credit lowers the
	 *   new bill, but the old bills stay open, so the next run counts the
	 *   credit again.
	 * - "settle" (Fuchsenladen): nothing is carried (a credit is dropped) and
	 *   the old bills are settled as "Übertragen" if the member is billed.
	 */
	nonPositiveCarry: "keep-open" | "settle";
	/**
	 * Whose name a carry-only bill gets when a member's open bills disagree
	 * (a renamed member): the last open bill read (Getränke) or the first
	 * (Fuchsenladen). The open bills are read in no particular order.
	 */
	carryOnlyName: "last" | "first";
};

export const GETRAENKE_RULES: BillingRules = {
	lateFee: true,
	nonPositiveCarry: "keep-open",
	carryOnlyName: "last",
};

export const FUCHSEN_RULES: BillingRules = {
	lateFee: false,
	nonPositiveCarry: "settle",
	carryOnlyName: "first",
};

/** One bill line: the orders of one drink or item at one price. */
export type PlannedLine = {
	id: string;
	billId: string;
	name: string;
	amount: number;
	pricePerUnit: number;
	total: number;
};

export type PlannedBill<O extends BillableOrder = BillableOrder> = {
	id: string;
	/** "group": the bill of a group booking (Gruppenrechnung). */
	kind: "member" | "group";
	userId: string;
	userName: string;
	/** The new orders on this bill. */
	orders: O[];
	ordersTotal: number;
	oldBillingAmount: number;
	fees: number;
	umlage: number;
	total: number;
	lines: PlannedLine[];
};

export type BillingPlan<O extends BillableOrder = BillableOrder> = {
	/** Member bills first, then group bills. */
	bills: PlannedBill<O>[];
	/** Every bill's lines, in bill order. */
	items: PlannedLine[];
	/** Members whose open bills are carried into their new bill. */
	settleUserIds: string[];
	/** Sum of all bill totals. */
	periodTotal: number;
	/** Every order the run puts on a bill. */
	orderIds: string[];
};

/** Prefix of the pseudo-user id of group bills. */
const GROUP_PREFIX = "event-";

/** The pseudo-user id of the bill of the group `name`. */
export function groupBillUserId(name: string): string {
	return `${GROUP_PREFIX}${name.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * The equal Umlage share of `inventoryLoss` (euros) for each of `members`,
 * rounded down to whole cents; the remainder is not charged. A gain
 * (negative loss) is not paid out.
 */
export function umlagePerMember(inventoryLoss: number, members: number) {
	const lossCents = Math.max(0, toCents(inventoryLoss));
	return members > 0 ? fromCents(shareDown(lossCents, members)) : 0;
}

/** One line per name and price, consolidating repeated orders. */
function consolidateLines(
	billId: string,
	orders: BillableOrder[],
	newId: () => string,
): PlannedLine[] {
	const lines = new Map<string, PlannedLine>();
	for (const order of orders) {
		const key = `${order.name}-${order.pricePerUnit}`;
		const line = lines.get(key);
		if (line) {
			line.amount += order.amount;
			line.total = sumMoney([line.total, order.total]);
		} else {
			lines.set(key, {
				id: newId(),
				billId,
				name: order.name,
				amount: order.amount,
				pricePerUnit: order.pricePerUnit,
				total: roundToCent(order.total),
			});
		}
	}
	return [...lines.values()];
}

type Debt = { cents: number; userName: string; deferred: boolean };

/**
 * What each member owes from ALL earlier periods, in whole cents so legacy
 * sub-cent totals can't add up to drift, and whether any of it is deferred.
 * Group bills are settled directly and never carried.
 */
function debtsByUser(
	outstanding: OutstandingBill[],
	carryOnlyName: BillingRules["carryOnlyName"],
): Map<string, Debt> {
	const debts = new Map<string, Debt>();
	for (const bill of outstanding) {
		if (bill.userId.startsWith(GROUP_PREFIX)) {
			continue;
		}
		const debt = debts.get(bill.userId) ?? {
			cents: 0,
			userName: bill.userName,
			deferred: false,
		};
		debt.cents += toCents(Number(bill.total) || 0);
		if (carryOnlyName === "last") {
			debt.userName = bill.userName;
		}
		if (bill.status === "Gestundet") {
			debt.deferred = true;
		}
		debts.set(bill.userId, debt);
	}
	return debts;
}

/** Personal orders by member and group orders by group, in order. */
function splitOrders<O extends BillableOrder>(orders: O[]) {
	const byMember = new Map<string, O[]>();
	const byGroup = new Map<string, O[]>();
	for (const order of orders) {
		const [groups, key] = order.bookingFor
			? [byGroup, order.bookingFor]
			: [byMember, order.userId];
		const list = groups.get(key);
		if (list) {
			list.push(order);
		} else {
			groups.set(key, [order]);
		}
	}
	return { byMember, byGroup };
}

type Umlage = { perMember: number; members: ReadonlyMap<string, string> };

/**
 * Everybody who gets a member bill (id → name): new orders first, then
 * members with debt, then those who owe only the Umlage.
 */
function billedMembers(
	byMember: Map<string, BillableOrder[]>,
	debts: Map<string, Debt>,
	umlage: Umlage | undefined,
) {
	const billed = new Map<string, string>();
	for (const [userId, orders] of byMember) {
		// Named after their first order; a member's orders are never empty.
		billed.set(userId, (orders[0] as BillableOrder).userName);
	}
	for (const [userId, debt] of debts) {
		if (debt.cents > 0 && !billed.has(userId)) {
			billed.set(userId, debt.userName);
		}
	}
	if (umlage && umlage.perMember > 0) {
		for (const [userId, name] of umlage.members) {
			if (!billed.has(userId)) {
				billed.set(userId, name);
			}
		}
	}
	return billed;
}

/**
 * A billed member's carried amount, its late fee and whether their open
 * bills are settled (so the member isn't listed and counted twice).
 */
function carryOver(debt: Debt | undefined, rules: BillingRules) {
	const cents = debt?.cents ?? 0;
	const keepOpen = rules.nonPositiveCarry === "keep-open";
	const oldBillingAmount = fromCents(keepOpen ? cents : Math.max(0, cents));
	return {
		oldBillingAmount,
		fees: rules.lateFee
			? lateFeeFor(oldBillingAmount, debt?.deferred ?? false)
			: 0,
		settles: keepOpen ? cents > 0 : debt !== undefined,
	};
}

/**
 * Plans a billing run: the bills and lines to write, the members whose
 * open bills get settled and the period total. `umlage` charges `perMember`
 * euros to each of `members` (id → name), with or without orders.
 */
export function planBillingRun<O extends BillableOrder>({
	unbilledOrders,
	outstandingBills,
	rules,
	umlage,
	newId = () => crypto.randomUUID(),
}: {
	unbilledOrders: O[];
	outstandingBills: OutstandingBill[];
	rules: BillingRules;
	umlage?: Umlage;
	newId?: () => string;
}): BillingPlan<O> {
	const debts = debtsByUser(outstandingBills, rules.carryOnlyName);
	const { byMember, byGroup } = splitOrders(unbilledOrders);
	const bills: PlannedBill<O>[] = [];
	const settleUserIds: string[] = [];

	const addBill = (
		kind: PlannedBill["kind"],
		userId: string,
		userName: string,
		orders: O[],
		charges: { oldBillingAmount: number; fees: number; umlage: number },
	) => {
		const ordersTotal = sumMoney(orders.map((o) => o.total));
		const id = newId();
		bills.push({
			id,
			kind,
			userId,
			userName,
			orders,
			ordersTotal,
			...charges,
			total: sumMoney([
				ordersTotal,
				charges.oldBillingAmount,
				charges.fees,
				charges.umlage,
			]),
			lines: consolidateLines(id, orders, newId),
		});
	};

	for (const [userId, userName] of billedMembers(byMember, debts, umlage)) {
		const { settles, ...carried } = carryOver(debts.get(userId), rules);
		if (settles) {
			settleUserIds.push(userId);
		}
		addBill("member", userId, userName, byMember.get(userId) ?? [], {
			...carried,
			umlage: umlage?.members.has(userId) ? umlage.perMember : 0,
		});
	}

	// One bill per group. Groups carry no old amounts, fees or Umlage.
	for (const [group, orders] of byGroup) {
		addBill("group", groupBillUserId(group), group, orders, {
			oldBillingAmount: 0,
			fees: 0,
			umlage: 0,
		});
	}

	return {
		bills,
		items: bills.flatMap((b) => b.lines),
		settleUserIds,
		periodTotal: sumMoney(bills.map((b) => b.total)),
		orderIds: unbilledOrders.map((o) => o.id),
	};
}
