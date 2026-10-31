import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { billPeriods } from "~/server/db/schema";
import { setGetraenkeBillingProfile } from "../../../../test/factories/billing";
import { createBill, createKonto } from "../../../../test/factories/platform";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { isOpenBill, openBillOf } from "./service";

setupTestDatabases();

describe("isOpenBill (has the member something to pay?)", () => {
	test.each([
		[{ status: "Unbezahlt", total: 23.4 }, true],
		[{ status: "Unbezahlt", total: 0.01 }, true],
		[{ status: "Unbezahlt", total: 0 }, false],
		[{ status: "Unbezahlt", total: 0.004 }, false],
		[{ status: "Unbezahlt", total: -5 }, false],
		[{ status: "Bezahlt", total: 23.4 }, false],
		[{ status: "Gestundet", total: 23.4 }, false],
		[{ status: "Übertragen", total: 23.4 }, false],
		[null, false],
		[undefined, false],
	])("%o → %s", (bill, expected) => {
		expect(isOpenBill(bill)).toBe(expected);
	});
});

describe("openBillOf", () => {
	async function setUp() {
		await createTenant();
		return createUser({ name: "Max" });
	}

	async function setPaymentData() {
		await setGetraenkeBillingProfile({ accountHolder: "Corps Test e.V." });
		await createKonto({
			kasseType: "Getränkekasse",
			iban: "DE89370400440532013000",
			paypalLink: "https://paypal.me/TestKasse/",
		});
	}

	test("the latest unpaid bill with due date, reference and where to pay", async () => {
		const max = await setUp();
		await setPaymentData();
		const { bill, period } = await createBill({
			userId: max.id,
			userName: "Max",
			billNumber: "KW-43-26",
			drinksTotal: 20,
			fees: 3.4,
		});
		await tenantDb()
			.update(billPeriods)
			.set({ createdAt: new Date("2026-10-22T10:00:00Z") })
			.where(eq(billPeriods.id, period.id));

		expect(await openBillOf(testScope(), max.id)).toEqual({
			billId: bill.id,
			billNumber: "KW-43-26",
			total: 23.4,
			dueDate: "2026-11-05",
			reference: "Max - Rechnung KW-43-26",
			payment: {
				iban: "DE89 3704 0044 0532 0130 00",
				ibanRaw: "DE89370400440532013000",
				accountHolder: "Corps Test e.V.",
				paypalBaseUrl: "https://paypal.me/TestKasse",
			},
		});
	});

	test("without payment data the bill is still shown, without a payee", async () => {
		const max = await setUp();
		await createBill({ userId: max.id, drinksTotal: 5 });

		const open = await openBillOf(testScope(), max.id);

		expect(open?.total).toBe(5);
		expect(open?.payment).toBeNull();
		// The default payment terms (14 days) still give a due date.
		expect(open?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test("no due date when the Kasse sets no payment terms", async () => {
		const max = await setUp();
		await setGetraenkeBillingProfile({ paymentDueDays: 0 });
		await createBill({ userId: max.id, drinksTotal: 5 });

		expect((await openBillOf(testScope(), max.id))?.dueDate).toBeNull();
	});

	test("only the latest bill counts: paid up means nothing to show", async () => {
		const max = await setUp();
		await createBill({
			userId: max.id,
			drinksTotal: 9,
			createdAt: new Date("2026-09-01T10:00:00Z"),
		});
		await createBill({
			userId: max.id,
			status: "Bezahlt",
			drinksTotal: 12,
			createdAt: new Date("2026-10-01T10:00:00Z"),
		});

		expect(await openBillOf(testScope(), max.id)).toBeNull();
	});

	test("nothing for members without bills or with another member's bill", async () => {
		const max = await setUp();
		const other = await createUser();
		await createBill({ userId: other.id, drinksTotal: 7 });

		expect(await openBillOf(testScope(), max.id)).toBeNull();
		expect((await openBillOf(testScope(), other.id))?.total).toBe(7);
	});
});
