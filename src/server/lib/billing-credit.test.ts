// A member's credit through two consecutive billing runs (#220), in both
// the Getränke and the Fuchsenladen run: the credit is carried exactly once,
// the carried bills become "Übertragen", a zero open bill is settled the
// same way and a carry-only bill carries the member's current name.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createNewBilling } from "~/server/actions/billings/billings";
import { createNewFuchsenBilling } from "~/server/actions/fuchsenladen/billings";
import { fuchsenBills, users } from "~/server/db/schema";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	setUpGetraenkeBilling,
} from "../../../test/factories/billing";
import {
	createFuchsenBillPeriod,
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../test/factories/fuchsenladen";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../test/harness";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

const mail = vi.mocked(sendTenantMail);

const AT = {
	earlier: new Date("2026-09-30T12:00:00Z"),
	run1: new Date("2026-10-07T12:00:00Z"),
	run2: new Date("2026-10-14T12:00:00Z"),
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(AT.earlier);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Lena (a credit), Max (a zero bill) and Rolf (debt, renamed since). */
async function members() {
	const lena = await createUser({
		name: "Lena",
		email: "lena@example.test",
	});
	const max = await createUser({ name: "Max" });
	const rolf = await createUser({ name: "Rolf Alt" });
	return { lena, max, rolf };
}

async function rename(user: TestUser, name: string) {
	await tenantDb().update(users).set({ name }).where(eq(users.id, user.id));
}

describe("Getränke", () => {
	test("a credit is carried once over two runs (#220)", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));
		const { lena, max, rolf } = await members();
		const earlier = await createBillPeriodRow({ billNumber: "KW-40-26" });
		await createBillRow({ periodId: earlier.id, user: lena, total: -2.5 });
		await createBillRow({ periodId: earlier.id, user: max, total: 0 });
		await createBillRow({ periodId: earlier.id, user: rolf, drinksTotal: 4 });
		await rename(rolf, "Rolf Neu");
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		await createOrderRow({ user: lena, drink: pils });
		await createOrderRow({ user: max, drink: pils });

		vi.setSystemTime(AT.run1);
		expect(await createNewBilling()).toMatchObject({ ok: true });

		const state = async (user: TestUser) =>
			(await billsOf(user.id)).map((b) => [
				b.userName,
				b.oldBillingAmount,
				b.fees,
				b.total,
				b.status,
			]);
		expect(await state(lena)).toEqual([
			["Lena", 0, 0, -2.5, "Übertragen"],
			["Lena", -2.5, 0, -1, "Unbezahlt"],
		]);
		expect(await state(max)).toEqual([
			["Max", 0, 0, 0, "Übertragen"],
			["Max", 0, 0, 1.5, "Unbezahlt"],
		]);
		// A carry-only bill: the current name, not the one on the old bill.
		expect(await state(rolf)).toEqual([
			["Rolf Alt", 0, 0, 4, "Übertragen"],
			["Rolf Neu", 4, 0, 4, "Unbezahlt"],
		]);
		// Lena's mail states the credit, not an amount to pay.
		const lenaMail = mail.mock.calls.find(
			([m]) => m.to === "lena@example.test",
		)?.[0];
		expect(lenaMail?.text).toContain("Guthaben: 1,00€");
		expect(lenaMail?.text).not.toContain("überweise den Betrag");

		// Run 2: only the remaining credit of 1.00 € is carried.
		await createOrderRow({ user: lena, drink: pils });
		vi.setSystemTime(AT.run2);
		expect(await createNewBilling()).toMatchObject({ ok: true });

		expect(await state(lena)).toEqual([
			["Lena", 0, 0, -2.5, "Übertragen"],
			["Lena", -2.5, 0, -1, "Übertragen"],
			["Lena", -1, 0, 0.5, "Unbezahlt"],
		]);
		// Two Pils for 3.00 € minus the 2.50 € credit: 0.50 € left to pay.
		const open = (await billsOf(lena.id)).filter(
			(b) => b.status === "Unbezahlt",
		);
		expect(open.map((b) => b.total)).toEqual([0.5]);
	});
});

describe("Fuchsenladen", () => {
	test("a credit is carried once over two runs (#220)", async () => {
		await createTenant();
		signInAs(await createUser({ name: "Fuchsenwart", roles: ["Fuchs"] }));
		const { lena, max, rolf } = await members();
		await createFuchsenBillPeriod({
			billNumber: "KW-40-26",
			createdAt: AT.earlier,
			bills: [
				{ user: lena, itemsTotal: -2.5 },
				{ user: max, itemsTotal: 0 },
				{ user: rolf, itemsTotal: 4 },
			],
		});
		await rename(rolf, "Rolf Neu");
		const mars = await createFuchsenItem({ name: "Mars", price: 1.2 });
		await createFuchsenOrder({ user: lena, item: mars });
		await createFuchsenOrder({ user: max, item: mars });

		vi.setSystemTime(AT.run1);
		expect(await createNewFuchsenBilling()).toMatchObject({
			ok: true,
			data: { billsCreated: 3, totalAmount: 3.9 },
		});

		const state = async (user: TestUser) =>
			(
				await tenantDb()
					.select()
					.from(fuchsenBills)
					.where(eq(fuchsenBills.userId, user.id))
					.orderBy(fuchsenBills.createdAt)
			).map((b) => [b.userName, b.oldBillingAmount, b.total, b.status]);
		expect(await state(lena)).toEqual([
			["Lena", 0, -2.5, "Übertragen"],
			["Lena", -2.5, -1.3, "Unbezahlt"],
		]);
		expect(await state(max)).toEqual([
			["Max", 0, 0, "Übertragen"],
			["Max", 0, 1.2, "Unbezahlt"],
		]);
		expect(await state(rolf)).toEqual([
			["Rolf Alt", 0, 4, "Übertragen"],
			["Rolf Neu", 4, 4, "Unbezahlt"],
		]);

		// Run 2: only the remaining credit of 1.30 € is carried.
		await createFuchsenOrder({ user: lena, item: mars, createdAt: AT.run1 });
		await createFuchsenOrder({ user: lena, item: mars, createdAt: AT.run1 });
		vi.setSystemTime(AT.run2);
		expect(await createNewFuchsenBilling()).toMatchObject({ ok: true });

		expect(await state(lena)).toEqual([
			["Lena", 0, -2.5, "Übertragen"],
			["Lena", -2.5, -1.3, "Übertragen"],
			// Three Mars for 3.60 € minus the 2.50 € credit.
			["Lena", -1.3, 1.1, "Unbezahlt"],
		]);
	});
});
