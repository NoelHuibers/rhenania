import { describe, expect, test } from "vitest";

import {
	type PlanBill,
	type PlanPeriod,
	planFuchsenCarryRepair,
} from "./fuchsen-carry";

const periods: PlanPeriod[] = [1, 2, 3, 4].map((n) => ({
	id: `p${n}`,
	billNumber: `KW-0${n}-26`,
	createdAt: new Date(Date.UTC(2026, 0, n * 7)),
}));

let seq = 0;
function bill(period: number, patch: Partial<PlanBill> = {}): PlanBill {
	seq += 1;
	return {
		id: `b${seq}`,
		billPeriodId: `p${period}`,
		userId: "u1",
		userName: "Max",
		status: "Unbezahlt",
		total: 10,
		oldBillingAmount: 0,
		paidAt: null,
		...patch,
	};
}

describe("planFuchsenCarryRepair", () => {
	test("an open bill carried into an open bill becomes Übertragen", () => {
		const first = bill(1, { total: 10 });
		const second = bill(2, { oldBillingAmount: 10, total: 15 });
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			first,
			second,
		]);
		expect(anomalies).toEqual([]);
		expect(changes).toEqual([
			expect.objectContaining({
				billId: first.id,
				from: "Unbezahlt",
				to: "Übertragen",
				carriedInto: "KW-02-26",
				paidAt: null,
			}),
		]);
	});

	test("a chain ending in a paid bill is paid with the same timestamp", () => {
		const paidAt = new Date(Date.UTC(2026, 1, 1));
		const first = bill(1, { total: 10, status: "Gestundet" });
		const second = bill(2, { oldBillingAmount: 10, total: 12 });
		const third = bill(3, {
			oldBillingAmount: 12,
			total: 20,
			status: "Bezahlt",
			paidAt,
		});
		const { changes } = planFuchsenCarryRepair(periods, [first, second, third]);
		expect(changes.map((c) => [c.billId, c.to, c.paidAt])).toEqual([
			[second.id, "Bezahlt", paidAt],
			[first.id, "Bezahlt", paidAt],
		]);
	});

	test("bills of a chain head that is still open all become Übertragen", () => {
		const first = bill(1, { total: 10 });
		const second = bill(2, { oldBillingAmount: 10, total: 12 });
		const third = bill(3, { oldBillingAmount: 12, total: 20 });
		const { changes } = planFuchsenCarryRepair(periods, [first, second, third]);
		expect(changes.map((c) => c.to)).toEqual(["Übertragen", "Übertragen"]);
	});

	test("a bill without a carry is left alone", () => {
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			bill(1),
			bill(2),
		]);
		expect(changes).toEqual([]);
		expect(anomalies).toEqual([]);
	});

	test("members are planned independently", () => {
		const a1 = bill(1, { total: 5 });
		const a2 = bill(2, { oldBillingAmount: 5 });
		const b1 = bill(1, { userId: "u2", userName: "Moritz" });
		const b2 = bill(2, { userId: "u2", userName: "Moritz" });
		const { changes } = planFuchsenCarryRepair(periods, [a1, a2, b1, b2]);
		expect(changes.map((c) => c.billId)).toEqual([a1.id]);
	});

	test("carried amounts that don't match the previous bill are only reported", () => {
		const first = bill(1, { total: 10 });
		const second = bill(2, { oldBillingAmount: 9.99 });
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			first,
			second,
		]);
		expect(changes).toEqual([]);
		expect(anomalies[0]?.reason).toMatch(/previous bill totals 10.00/);
	});

	test("a carry without a bill in the period before is reported", () => {
		const { anomalies } = planFuchsenCarryRepair(periods, [
			bill(1),
			bill(3, { oldBillingAmount: 10 }),
		]);
		expect(anomalies[0]?.reason).toMatch(/no bill in the period before/);
	});

	test("a carried bill that was paid separately is reported as a possible double charge", () => {
		const first = bill(1, {
			status: "Bezahlt",
			paidAt: new Date(Date.UTC(2026, 0, 10)),
		});
		const second = bill(2, { oldBillingAmount: 10 });
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			first,
			second,
		]);
		expect(changes).toEqual([]);
		expect(anomalies[0]?.reason).toMatch(/paid separately/);
	});

	test("bills paid together with their carrying bill are fine", () => {
		const paidAt = new Date(Date.UTC(2026, 0, 20));
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			bill(1, { status: "Bezahlt", paidAt }),
			bill(2, { oldBillingAmount: 10, status: "Bezahlt", paidAt }),
		]);
		expect(changes).toEqual([]);
		expect(anomalies).toEqual([]);
	});

	test("bills already marked Übertragen by the new billing are skipped", () => {
		const { changes, anomalies } = planFuchsenCarryRepair(periods, [
			bill(1, { status: "Übertragen" }),
			bill(2, { oldBillingAmount: 10 }),
		]);
		expect(changes).toEqual([]);
		expect(anomalies).toEqual([]);
	});

	test("bills of unknown periods are ignored", () => {
		const { changes } = planFuchsenCarryRepair(periods, [
			bill(9),
			bill(2, { oldBillingAmount: 10 }),
		]);
		expect(changes).toEqual([]);
	});
});
