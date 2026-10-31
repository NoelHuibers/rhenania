import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { setGetraenkeBillingProfile } from "../../../../test/factories/billing";
import { createBill, createKonto } from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import { getUserBillingData } from "./actions";

setupTestDatabases();

async function member() {
	const tenant = await createTenant();
	const user = await createUser({ name: "Max" });
	signInAs(user);
	return { tenant, user };
}

describe("getUserBillingData", () => {
	test("returns the latest bill with items, a fee line and where to pay", async () => {
		const { user } = await member();
		await setGetraenkeBillingProfile({ accountHolder: "Corps Hassia e.V." });
		await createKonto({
			kasseType: "Getränkekasse",
			iban: "DE89370400440532013000",
			paypalLink: "https://paypal.me/HassiaBier/",
		});
		await createBill({
			userId: user.id,
			billNumber: "KW-40-26",
			createdAt: new Date("2026-10-01T10:00:00Z"),
			items: [{ drinkName: "Pils", amount: 1, price: 1 }],
		});
		const { bill } = await createBill({
			userId: user.id,
			userName: "Max",
			billNumber: "KW-43-26",
			status: "Gestundet",
			fees: 2,
			oldBillingAmount: 5,
			createdAt: new Date("2026-10-22T10:00:00Z"),
			items: [
				{ drinkName: "Pils", amount: 4, price: 1.5 },
				{ drinkName: "Spezi", amount: 2, price: 1.2 },
			],
		});

		const data = await getUserBillingData();

		expect(data.billData).toEqual({
			status: "Gestundet",
			total: 15.4,
			drinksTotal: 8.4,
			fees: 2,
			oldBalance: 5,
			umlage: 0,
			billNumber: "KW-43-26",
			lastUpdated: "2026-10-22",
			billId: bill.id,
			userName: "Max",
		});
		expect(data.billItems).toEqual(
			expect.arrayContaining([
				{ item: "Pils", quantity: 4, price: 1.5, total: 6 },
				{ item: "Spezi", quantity: 2, price: 1.2, total: 2.4 },
			]),
		);
		expect(data.billItems.at(-1)).toEqual({
			item: "Service Fee",
			quantity: 1,
			price: 2,
			total: 2,
		});
		expect(data.payment).toEqual({
			iban: "DE89 3704 0044 0532 0130 00",
			ibanRaw: "DE89370400440532013000",
			accountHolder: "Corps Hassia e.V.",
			paypalBaseUrl: "https://paypal.me/HassiaBier",
		});
	});

	test("falls back to the tenant's PayPal when the konto has none", async () => {
		const { tenant, user } = await member();
		await controlDb()
			.update(tenants)
			.set({ branding: { paypalUrl: "@CorpsKasse" } })
			.where(eq(tenants.id, tenant.id));
		await setGetraenkeBillingProfile();
		await createKonto({ kasseType: "Getränkekasse" });
		await createBill({ userId: user.id });

		const { payment } = await getUserBillingData();

		expect(payment?.paypalBaseUrl).toBe("https://paypal.me/CorpsKasse");
		expect(payment?.ibanRaw).toBe("DE89370400440532013000");
	});

	test("members without bills get an empty overview", async () => {
		await member();

		expect(await getUserBillingData()).toEqual({
			billData: null,
			billItems: [],
			payment: null,
		});
	});

	test("never shows another member's bill", async () => {
		await member();
		const other = await createUser();
		await createBill({ userId: other.id });

		expect((await getUserBillingData()).billData).toBeNull();
	});

	test("a tenant without a Getränkekasse konto shows no payment target (#9)", async () => {
		const { user } = await member();
		await createBill({ userId: user.id });

		expect((await getUserBillingData()).payment).toBeNull();

		// A konto alone is not enough: the holder goes into the GiroCode.
		await createKonto({ kasseType: "Getränkekasse" });
		expect((await getUserBillingData()).payment).toBeNull();
	});

	test("lastUpdated is the Berlin calendar date (#15)", async () => {
		const { user } = await member();
		// 00:30 on 1 Oct in Berlin is still 30 Sep in UTC.
		await createBill({
			userId: user.id,
			createdAt: new Date("2026-09-30T22:30:00Z"),
		});

		expect((await getUserBillingData()).billData?.lastUpdated).toBe(
			"2026-10-01",
		);
	});

	test("lastUpdated uses the Berlin date of the last update (#15)", async () => {
		const { user } = await member();
		// 00:15 on 26 Oct in Berlin (CET) is still 25 Oct in UTC.
		await createBill({
			userId: user.id,
			createdAt: new Date("2026-10-20T10:00:00Z"),
			updatedAt: new Date("2026-10-25T23:15:00Z"),
		});

		expect((await getUserBillingData()).billData?.lastUpdated).toBe(
			"2026-10-26",
		);
	});

	test("requires a signed-in member", async () => {
		await createTenant();
		await expect(getUserBillingData()).rejects.toThrow(
			"User must be authenticated to view billing data",
		);
	});
});

describe("errors", () => {
	// An outage must not look like "no bill" (#33); the profile's loader
	// shows its own error card.
	test("lets database failures through", async () => {
		const { user } = await member();
		await createBill({ userId: user.id });
		vi.spyOn(console, "error").mockImplementation(() => {});
		await requireTenant().client.execute("DROP TABLE bill_item");

		await expect(getUserBillingData()).rejects.toThrow(/Failed query/);
	});
});
