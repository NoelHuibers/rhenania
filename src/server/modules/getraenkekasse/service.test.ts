// The Getränkekasse service on its own (#33): a TenantScope over a local
// libSQL file and a fixed clock, without a server action or a session.

import { describe, expect, test } from "vitest";

import { bills, externalBills } from "~/server/db/schema";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	eventUser,
} from "../../../../test/factories/billing";
import {
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import {
	addBankEntry,
	addExternalBill,
	kasseSummary,
	externalBills as listExternalBills,
	markAllMemberBillsPaid,
	markExternalBillPaid,
	setBillRecipient,
} from "./service";

setupTestDatabases();

const NOW = new Date("2026-10-20T09:15:42Z");

describe("kasseSummary", () => {
	test("adds bank, open bills and Pfand and subtracts open external bills", async () => {
		await createTenant();
		const wart = await createUser();
		const scope = testScope({ now: NOW });
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: wart, drinksTotal: 10 });
		await createBillRow({
			periodId: period.id,
			user: eventUser("Stiftungsfest"),
			status: "Gestundet",
			drinksTotal: 4,
		});
		await addBankEntry(
			scope,
			{ amount: 100, description: "Einzahlung", date: NOW },
			wart.id,
		);
		await addExternalBill(
			scope,
			{ creditor: "Brauerei", description: "Fass", amount: 30 },
			wart.id,
		);
		await setKasseConfig({ pfandWert: 6 });

		expect(await kasseSummary(scope)).toMatchObject({
			kassenstand: 100,
			offeneMitglieder: 10,
			gestundetGruppen: 4,
			pfand: 6,
			externOffen: 30,
			gesamt: 100 + 10 + 4 + 6 - 30,
		});
	});
});

describe("the scope's clock", () => {
	test("dates a paid external bill", async () => {
		await createTenant();
		const wart = await createUser();
		const scope = testScope({ now: NOW });
		await addExternalBill(
			scope,
			{ creditor: "Brauerei", description: "Fass", amount: 30 },
			wart.id,
		);
		const [bill] = await listExternalBills(scope);

		await markExternalBillPaid(scope, bill?.id ?? "");

		const [paid] = await tenantDb().select().from(externalBills);
		expect(paid).toMatchObject({ status: "Bezahlt", paidAt: NOW });
	});

	test("pays every open member bill and what it carried at once, credits stay open", async () => {
		await createTenant();
		const max = await createUser({ name: "Max" });
		const eva = await createUser({ name: "Eva" });
		const old = await createBillPeriodRow({
			createdAt: new Date("2026-09-01T10:00:00Z"),
		});
		const current = await createBillPeriodRow({
			createdAt: new Date("2026-10-01T10:00:00Z"),
		});
		await createBillRow({
			periodId: old.id,
			user: max,
			status: "Übertragen",
			drinksTotal: 3,
			createdAt: old.createdAt,
		});
		await createBillRow({
			periodId: current.id,
			user: max,
			drinksTotal: 5,
			oldBillingAmount: 3,
			createdAt: current.createdAt,
		});
		await createBillRow({
			periodId: current.id,
			user: eva,
			total: -2,
			createdAt: current.createdAt,
		});

		expect(await markAllMemberBillsPaid(testScope({ now: NOW }))).toEqual({
			count: 1,
		});

		expect((await billsOf(max.id)).map((b) => [b.status, b.paidAt])).toEqual([
			["Bezahlt", NOW],
			["Bezahlt", NOW],
		]);
		expect((await billsOf(eva.id)).map((b) => b.status)).toEqual(["Unbezahlt"]);
		expect(await tenantDb().$count(bills)).toBe(3);
	});
});

describe("setBillRecipient", () => {
	test("refuses an invalid address and the treasurer mode without one", async () => {
		await createTenant();
		const scope = testScope({ now: NOW });

		await expect(
			setBillRecipient(scope, "members", "kein-mail", "u1"),
		).rejects.toMatchObject({
			message: "Ungültige E-Mail-Adresse",
			code: "INVALID_INPUT",
		});
		await expect(
			setBillRecipient(scope, "treasurer", "  ", "u1"),
		).rejects.toMatchObject({ code: "INVALID_INPUT" });
	});
});
