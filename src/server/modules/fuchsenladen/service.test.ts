// The Fuchsenladen service on its own (#33): called with a TenantScope over
// a local libSQL file and a fixed clock, without a server action, a session
// or a faked system time.

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { fuchsenBills, fuchsenOrders } from "~/server/db/schema";
import {
	createFuchsenBillPeriod,
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { runFuchsenBilling } from "./run";
import {
	billingConfig,
	billPdf,
	billsForPeriod,
	listBillPeriods,
	periodCsv,
	saveBillingConfig,
	setBillStatus,
} from "./service";

setupTestDatabases();

/** Tuesday, 20 Oct 2026, 09:15:42 UTC: ISO week 43. */
const NOW = new Date("2026-10-20T09:15:42Z");
const LATER = new Date("2026-10-27T18:00:00Z");

async function billsOf(userId: string) {
	return tenantDb()
		.select()
		.from(fuchsenBills)
		.where(eq(fuchsenBills.userId, userId))
		.orderBy(fuchsenBills.createdAt);
}

describe("runFuchsenBilling", () => {
	test("bills at the scope's time and carries the old debt", async () => {
		await createTenant();
		const wart = await createUser({ name: "Wart" });
		const max = await createUser({ name: "Max" });
		const old = await createFuchsenBillPeriod({
			createdAt: new Date("2026-10-01T10:00:00Z"),
			bills: [{ user: max, itemsTotal: 2 }],
		});
		const mars = await createFuchsenItem({ name: "Mars", price: 1.2 });
		const order = await createFuchsenOrder({
			user: max,
			item: mars,
			amount: 3,
		});

		const run = await runFuchsenBilling(testScope({ now: NOW }), wart);

		expect(run).toMatchObject({
			billsCreated: 1,
			totalAmount: 5.6,
			billPeriod: { billNumber: "KW-43-26" },
		});
		const bills = await billsOf(max.id);
		expect(bills.map((b) => [b.status, b.total, b.createdAt])).toEqual([
			["Übertragen", 2, old.bills[0]?.createdAt],
			["Unbezahlt", 5.6, NOW],
		]);
		const [billed] = await tenantDb()
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.id, order.id));
		expect(billed?.billId).toBe(bills[1]?.id);
		const [period] = await listBillPeriods(testScope());
		expect(period).toMatchObject({ createdBy: wart.id, createdAt: NOW });
	});

	test("nothing to bill writes nothing", async () => {
		await createTenant();
		const wart = await createUser();

		expect(await runFuchsenBilling(testScope({ now: NOW }), wart)).toEqual({
			message: "Keine offenen Bestellungen zum Abrechnen gefunden",
			billsCreated: 0,
			totalAmount: 0,
		});
		expect(await listBillPeriods(testScope())).toEqual([]);
	});
});

describe("setBillStatus", () => {
	async function carriedAndLatest() {
		await createTenant();
		const max = await createUser({ name: "Max" });
		const { bills: old } = await createFuchsenBillPeriod({
			createdAt: new Date("2026-09-01T10:00:00Z"),
			bills: [{ user: max, itemsTotal: 4 }],
		});
		await tenantDb()
			.update(fuchsenBills)
			.set({ status: "Übertragen" })
			.where(eq(fuchsenBills.id, old[0]?.id ?? ""));
		const { bills: current } = await createFuchsenBillPeriod({
			createdAt: new Date("2026-10-01T10:00:00Z"),
			bills: [{ user: max, itemsTotal: 6, oldBillingAmount: 4 }],
		});
		return { max, carried: old[0], latest: current[0] };
	}

	test("pays a bill and the bills carried into it at the scope's time", async () => {
		const { max, latest } = await carriedAndLatest();

		await setBillStatus(testScope({ now: NOW }), latest?.id ?? "", "Bezahlt");

		expect((await billsOf(max.id)).map((b) => [b.status, b.paidAt])).toEqual([
			["Bezahlt", NOW],
			["Bezahlt", NOW],
		]);
	});

	test("undoing the payment reopens what it settled, as carried", async () => {
		const { max, latest } = await carriedAndLatest();
		await setBillStatus(testScope({ now: NOW }), latest?.id ?? "", "Bezahlt");

		await setBillStatus(
			testScope({ now: LATER }),
			latest?.id ?? "",
			"Unbezahlt",
		);

		expect(
			(await billsOf(max.id)).map((b) => [b.status, b.paidAt, b.updatedAt]),
		).toEqual([
			["Übertragen", null, LATER],
			["Unbezahlt", null, LATER],
		]);
	});

	test("refuses carried and unknown bills", async () => {
		const { carried } = await carriedAndLatest();
		const scope = testScope({ now: NOW });

		await expect(
			setBillStatus(scope, carried?.id ?? "", "Bezahlt"),
		).rejects.toMatchObject({ code: "CARRIED_BILL" });
		await expect(
			setBillStatus(scope, "missing", "Bezahlt"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("reads and documents", () => {
	test("a failed query is an error, not an empty list", async () => {
		await createTenant();
		await tenantDb().$client.execute("DROP TABLE fuchsen_bill_item");

		await expect(billsForPeriod(testScope(), "any")).rejects.toThrow(
			/no such table/,
		);
	});

	test("the CSV of a period, and none for an unknown one", async () => {
		await createTenant();
		const { period } = await createFuchsenBillPeriod({
			billNumber: "KW-43-26",
			bills: [{ user: await createUser({ name: "Max" }), itemsTotal: 2.5 }],
		});

		expect(await periodCsv(testScope(), period.id)).toEqual({
			csvContent:
				"﻿Name;Status;Artikel;Alter Saldo;Gesamt\r\nMax;Unbezahlt;2,50;0,00;2,50\r\nGesamt;;;;2,50",
			fileName: "Fuchsenrechnung_KW-43-26.csv",
		});
		await expect(periodCsv(testScope(), "missing")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("a member's PDF is theirs alone; the Fuchsenwart may read any", async () => {
		await createTenant();
		const max = await createUser({ name: "Max" });
		const { bills } = await createFuchsenBillPeriod({
			billNumber: "KW-43-26",
			bills: [{ user: max, itemsTotal: 2 }],
		});
		const billId = bills[0]?.id ?? "";

		await expect(
			billPdf(testScope(), { id: "someone-else", roles: [] }, billId),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(
			await billPdf(testScope(), { id: "wart", roles: ["Fuchs"] }, billId),
		).toMatchObject({ fileName: "Fuchsenrechnung_KW-43-26_Max.pdf" });
		expect(
			await billPdf(testScope(), { id: max.id, roles: [] }, billId),
		).toMatchObject({ fileName: "Fuchsenrechnung_KW-43-26_Max.pdf" });
	});

	test("payment details: empty until saved, stamped with the scope's time", async () => {
		await createTenant();
		const wart = await createUser();
		expect(await billingConfig(testScope())).toMatchObject({
			iban: "",
			paymentDueDays: 14,
		});

		await saveBillingConfig(
			testScope({ now: NOW }),
			{
				senderName: "Fuchsenwart",
				senderStreet: "",
				senderCity: "",
				location: "Stuttgart",
				iban: "DE89",
				accountHolder: "Max",
				paypalBaseUrl: "",
				paymentDueDays: 21,
			},
			wart.id,
		);

		expect(await billingConfig(testScope())).toMatchObject({
			iban: "DE89",
			paymentDueDays: 21,
			updatedAt: NOW,
			updatedBy: wart.id,
		});
	});
});
