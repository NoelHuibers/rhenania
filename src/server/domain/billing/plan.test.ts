import { describe, expect, test } from "vitest";

import {
	type BillableOrder,
	FUCHSEN_RULES,
	GETRAENKE_RULES,
	groupBillUserId,
	type OutstandingBill,
	planBillingRun,
	umlagePerMember,
} from "./plan";

/** Deterministic ids: id-1, id-2, … */
function ids() {
	let n = 0;
	return () => `id-${++n}`;
}

let orderCount = 0;
function order(
	userId: string,
	name: string,
	amount: number,
	pricePerUnit: number,
	extra: Partial<BillableOrder> = {},
): BillableOrder {
	return {
		id: `o${++orderCount}`,
		userId,
		userName: userId.toUpperCase(),
		name,
		amount,
		pricePerUnit,
		total: amount * pricePerUnit,
		...extra,
	};
}

function open(
	userId: string,
	total: number,
	status = "Unbezahlt",
	userName = userId.toUpperCase(),
): OutstandingBill {
	return { userId, userName, total, status };
}

const getraenke = (
	unbilledOrders: BillableOrder[],
	outstandingBills: OutstandingBill[] = [],
	umlage?: Parameters<typeof planBillingRun>[0]["umlage"],
) =>
	planBillingRun({
		unbilledOrders,
		outstandingBills,
		rules: GETRAENKE_RULES,
		umlage,
		newId: ids(),
	});

const billOf = (plan: ReturnType<typeof getraenke>, userId: string) =>
	plan.bills.find((b) => b.userId === userId);

describe("late fee on carried amounts", () => {
	test("5.00 € carried pays no fee, 5.01 € pays 0.50 €", () => {
		const plan = getraenke(
			[order("a", "Pils", 1, 1.5), order("b", "Pils", 1, 1.5)],
			[open("a", 5), open("b", 5.01)],
		);
		expect(billOf(plan, "a")).toMatchObject({
			oldBillingAmount: 5,
			fees: 0,
			total: 6.5,
		});
		expect(billOf(plan, "b")).toMatchObject({
			oldBillingAmount: 5.01,
			fees: 0.5,
			total: 7.01,
		});
	});

	test("a deferred bill pays no fees, even next to an unpaid one", () => {
		const plan = getraenke(
			[],
			[open("a", 20, "Gestundet"), open("b", 3), open("b", 4, "Gestundet")],
			{ perMember: 0.01, members: new Map() },
		);
		expect(billOf(plan, "a")).toMatchObject({ fees: 0, total: 20 });
		expect(billOf(plan, "b")).toMatchObject({ fees: 0, total: 7 });
	});

	test("the Fuchsenladen charges no fee", () => {
		const plan = planBillingRun({
			unbilledOrders: [order("a", "Mars", 1, 1.2)],
			outstandingBills: [open("a", 50)],
			rules: FUCHSEN_RULES,
		});
		expect(plan.bills[0]).toMatchObject({ fees: 0, total: 51.2 });
	});

	test("legacy sub-cent totals are added in cents and the fee rounds half up", () => {
		const plan = getraenke(
			[order("a", "Pils", 1, 1)],
			[open("a", 3.333), open("a", 2.222)],
		);
		expect(billOf(plan, "a")).toMatchObject({
			oldBillingAmount: 5.55,
			fees: 0.56,
			total: 7.11,
		});
	});
});

describe("group bookings", () => {
	test("are grouped by bookingFor into one bill per group", () => {
		const plan = getraenke([
			order("a", "Pils", 10, 1.5, { bookingFor: "Stiftungsfest" }),
			order("b", "Pils", 5, 1.5, { bookingFor: "Stiftungsfest" }),
			order("b", "Mate", 2, 1.9, { bookingFor: "Stiftungsfest" }),
			order("a", "Wasser", 6, 0.7, { bookingFor: "AH Abend" }),
			order("a", "Pils", 1, 1.5),
		]);
		expect(plan.bills.map((b) => [b.kind, b.userId, b.total])).toEqual([
			["member", "a", 1.5],
			["group", "event-stiftungsfest", 26.3],
			["group", "event-ah-abend", 4.2],
		]);
		const fest = billOf(plan, "event-stiftungsfest");
		expect(fest?.userName).toBe("Stiftungsfest");
		expect(fest?.lines.map((l) => [l.name, l.amount, l.total])).toEqual([
			["Pils", 15, 22.5],
			["Mate", 2, 3.8],
		]);
	});

	test("are never carried and never get fees or Umlage", () => {
		const plan = getraenke(
			[order("a", "Pils", 2, 1.5, { bookingFor: "AH Abend" })],
			[open(groupBillUserId("AH Abend"), 30), open("event-sommerfest", 12)],
			{ perMember: 5, members: new Map([["a", "A"]]) },
		);
		expect(billOf(plan, "event-ah-abend")).toMatchObject({
			oldBillingAmount: 0,
			fees: 0,
			umlage: 0,
			total: 3,
		});
		expect(billOf(plan, "event-sommerfest")).toBeUndefined();
		expect(plan.settleUserIds).toEqual([]);
		// The booking member pays only the Umlage on their own bill.
		expect(billOf(plan, "a")).toMatchObject({ umlage: 5, total: 5 });
	});

	test("group bill ids follow the group name", () => {
		expect(groupBillUserId("AH  Abend")).toBe("event-ah-abend");
	});
});

describe("carry-over", () => {
	test("members with debt but no orders get a carry-only bill and are settled", () => {
		const plan = getraenke([order("a", "Pils", 1, 1.5)], [open("b", 12.34)]);
		expect(billOf(plan, "b")).toMatchObject({
			orders: [],
			lines: [],
			ordersTotal: 0,
			oldBillingAmount: 12.34,
			fees: 1.23,
			total: 13.57,
		});
		expect(plan.settleUserIds).toEqual(["b"]);
	});

	test("a carry-only bill takes the last (Getränke) or first (Fuchsen) name", () => {
		const outstanding = [
			open("a", 1, "Unbezahlt", "Old"),
			open("a", 1, "Unbezahlt", "New"),
		];
		expect(getraenke([], outstanding).bills[0]?.userName).toBe("New");
		expect(
			planBillingRun({
				unbilledOrders: [],
				outstandingBills: outstanding,
				rules: FUCHSEN_RULES,
			}).bills[0]?.userName,
		).toBe("Old");
	});

	test("Getränke carries a credit but keeps the old bills open", () => {
		const plan = getraenke(
			[order("a", "Pils", 1, 1.5), order("z", "Pils", 1, 1.5)],
			[open("a", -2.5), open("z", 0), open("c", -1)],
		);
		expect(billOf(plan, "a")).toMatchObject({
			oldBillingAmount: -2.5,
			total: -1,
		});
		expect(billOf(plan, "z")).toMatchObject({ oldBillingAmount: 0 });
		// Nobody is settled, and the credit-only member gets no bill.
		expect(plan.settleUserIds).toEqual([]);
		expect(billOf(plan, "c")).toBeUndefined();
	});

	test("the Fuchsenladen drops a credit and settles the old bills", () => {
		const plan = planBillingRun({
			unbilledOrders: [order("a", "Mars", 1, 1.2), order("z", "Mars", 1, 1.2)],
			outstandingBills: [open("a", -2.5), open("z", 0), open("c", -1)],
			rules: FUCHSEN_RULES,
		});
		expect(
			plan.bills.map((b) => [b.userId, b.oldBillingAmount, b.total]),
		).toEqual([
			["a", 0, 1.2],
			["z", 0, 1.2],
		]);
		expect(plan.settleUserIds).toEqual(["a", "z"]);
	});

	test("unreadable totals count as nothing", () => {
		const plan = getraenke([], [open("a", Number.NaN), open("a", 6)]);
		expect(billOf(plan, "a")).toMatchObject({ oldBillingAmount: 6 });
	});
});

describe("Umlage", () => {
	test("is charged to every member listed, with or without orders", () => {
		const members = new Map([
			["a", "A"],
			["h", "Hausbewohner"],
		]);
		const plan = getraenke(
			[order("a", "Pils", 2, 1.5), order("x", "Pils", 1, 1.5)],
			[open("a", 6)],
			{ perMember: umlagePerMember(10, 3), members },
		);
		expect(billOf(plan, "a")).toMatchObject({
			umlage: 3.33,
			fees: 0.6,
			total: 12.93,
		});
		expect(billOf(plan, "h")).toMatchObject({
			userName: "Hausbewohner",
			orders: [],
			umlage: 3.33,
			total: 3.33,
		});
		expect(billOf(plan, "x")).toMatchObject({ umlage: 0, total: 1.5 });
	});

	test("a zero share bills nobody for the Umlage alone", () => {
		const plan = getraenke([], [], {
			perMember: 0,
			members: new Map([["h", "H"]]),
		});
		expect(plan.bills).toEqual([]);
		expect(plan.periodTotal).toBe(0);
	});

	test("the share is rounded down; a gain or no members charges nothing", () => {
		expect(umlagePerMember(10, 3)).toBe(3.33);
		expect(umlagePerMember(0.02, 3)).toBe(0);
		expect(umlagePerMember(-5, 2)).toBe(0);
		expect(umlagePerMember(10, 0)).toBe(0);
	});
});

describe("lines and totals", () => {
	test("orders of one name and price share a line; another price gets its own", () => {
		const plan = getraenke([
			order("a", "Pils", 2, 1.5),
			order("a", "Pils", 1, 1.5),
			order("a", "Pils", 1, 1.4),
			order("a", "Wasser", 1, 0.7, { total: 0.705 }),
		]);
		const bill = billOf(plan, "a");
		expect(bill?.lines).toEqual([
			{
				id: "id-2",
				billId: "id-1",
				name: "Pils",
				amount: 3,
				pricePerUnit: 1.5,
				total: 4.5,
			},
			{
				id: "id-3",
				billId: "id-1",
				name: "Pils",
				amount: 1,
				pricePerUnit: 1.4,
				total: 1.4,
			},
			{
				id: "id-4",
				billId: "id-1",
				name: "Wasser",
				amount: 1,
				pricePerUnit: 0.7,
				total: 0.71,
			},
		]);
		expect(bill?.ordersTotal).toBe(6.61);
	});

	test("lists items in bill order, every order id and the period total", () => {
		const orders = [
			order("a", "Pils", 1, 1.5),
			order("b", "Mate", 3, 1.9),
			order("b", "Pils", 1, 1.5, { bookingFor: "AH" }),
		];
		const plan = getraenke(orders, [open("c", 5.01)]);
		expect(plan.items.map((i) => i.billId)).toEqual(
			plan.bills.flatMap((b) => b.lines.map(() => b.id)),
		);
		expect(plan.orderIds).toEqual(orders.map((o) => o.id));
		// 1.50 + 5.70 + (5.01 + 0.50) + 1.50
		expect(plan.periodTotal).toBe(14.21);
	});

	test("ids default to random UUIDs", () => {
		const plan = planBillingRun({
			unbilledOrders: [order("a", "Pils", 1, 1.5)],
			outstandingBills: [],
			rules: GETRAENKE_RULES,
		});
		expect(plan.bills[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(plan.items[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
	});
});
