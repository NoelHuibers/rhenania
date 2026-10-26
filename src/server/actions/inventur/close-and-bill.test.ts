import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { billPeriods, inventories, orders } from "~/server/db/schema";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import {
	billsOf,
	setGetraenkeBillingProfile,
	setUpGetraenkeBilling,
} from "../../../../test/factories/billing";
import {
	createInventory,
	createOrderRow,
	daysAgo,
} from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
	tenantDb,
} from "../../../../test/harness";
import { closeInventoryAndBill } from "./inventur";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
// The real billing runs unless a test injects a failure.
vi.mock("~/server/lib/billing-run", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/server/lib/billing-run")>();
	return { ...actual, runGetraenkeBilling: vi.fn(actual.runGetraenkeBilling) };
});

setupTestDatabases();

const billing = vi.mocked(runGetraenkeBilling);

beforeEach(async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	await createTenant();
	await setUpGetraenkeBilling();
	signInAs(await createUser({ roles: ["Getränkewart"] }));
});

async function allInventories() {
	return tenantDb()
		.select()
		.from(inventories)
		.orderBy(asc(inventories.createdAt));
}

/** A running inventory with 20 Pils and one resident who drank 2 of them. */
async function seedRunningInventory() {
	const resident = await createUser({ roles: ["Hausbewohner"] });
	const pils = await createDrink({ name: "Pils", price: 1.5 });
	const running = await createInventory({
		createdAt: daysAgo(14),
		items: [{ drink: pils, countedStock: 20 }],
	});
	await createOrderRow({
		drink: pils,
		user: resident,
		amount: 2,
		createdAt: daysAgo(3),
	});
	return { resident, pils, running };
}

describe("closeInventoryAndBill", () => {
	test("closes the inventory and bills its loss, computed on the server", async () => {
		const { resident, pils, running } = await seedRunningInventory();

		// 20 − 2 = 18 expected, 15 counted → 3 × 1.50 € = 4.50 € loss.
		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 15, purchasedSince: 0 },
		]);

		expect(result).toEqual({
			success: true,
			totalInventoryLoss: 4.5,
			billsCreated: 1,
			message: "Erfolgreich 1 Rechnungen erstellt",
		});
		expect(billing).toHaveBeenCalledExactlyOnceWith({ inventoryLoss: 4.5 });
		const [closed, next] = await allInventories();
		expect(closed).toMatchObject({
			id: running.id,
			status: "closed",
			totalLoss: 4.5,
		});
		expect(next?.status).toBe("active");
		expect(await billsOf(resident.id)).toEqual([
			expect.objectContaining({ drinksTotal: 3, umlage: 4.5, total: 7.5 }),
		]);
	});

	test("splits the loss over the Hausbewohner only, including those without orders (#10)", async () => {
		const { resident, pils } = await seedRunningInventory();
		const quietResident = await createUser({ roles: ["Hausbewohner"] });
		const guest = await createUser({ roles: ["Alter Herr"] });
		await createOrderRow({ drink: pils, user: guest, createdAt: daysAgo(2) });

		// 20 − 3 = 17 expected, 14 counted → 3 × 1.50 € = 4.50 € loss.
		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 14, purchasedSince: 0 },
		]);

		expect(result).toMatchObject({
			success: true,
			totalInventoryLoss: 4.5,
			billsCreated: 3,
		});
		expect((await billsOf(resident.id))[0]).toMatchObject({
			drinksTotal: 3,
			umlage: 2.25,
			total: 5.25,
		});
		expect((await billsOf(quietResident.id))[0]).toMatchObject({
			drinksTotal: 0,
			umlage: 2.25,
			total: 2.25,
		});
		expect((await billsOf(guest.id))[0]).toMatchObject({
			umlage: 0,
			total: 1.5,
		});
	});

	test("bills no Umlage for the very first count, which closes nothing", async () => {
		const resident = await createUser({ roles: ["Hausbewohner"] });
		const pils = await createDrink({ price: 1 });
		// An older closed inventory's loss must not be billed again.
		await createInventory({
			status: "closed",
			createdAt: daysAgo(90),
			closedAt: daysAgo(60),
			totalLoss: 50,
		});
		await createOrderRow({ drink: pils, user: resident });

		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 10, purchasedSince: 0 },
		]);

		expect(result).toMatchObject({ success: true, totalInventoryLoss: 0 });
		expect(billing).toHaveBeenCalledExactlyOnceWith({ inventoryLoss: 0 });
		expect((await billsOf(resident.id))[0]?.umlage).toBe(0);
	});

	test("does not bill when the inventory could not be saved", async () => {
		const { pils, running } = await seedRunningInventory();

		const result = await closeInventoryAndBill([
			// NaN violates the NOT NULL column and rolls the count back.
			{ drinkId: pils.id, countedStock: Number.NaN, purchasedSince: 0 },
		]);

		expect(result).toMatchObject({ success: false, failedStep: "inventory" });
		expect(billing).not.toHaveBeenCalled();
		expect(await tenantDb().select().from(billPeriods)).toEqual([]);
		expect(await allInventories()).toEqual([
			expect.objectContaining({ id: running.id, status: "active" }),
		]);
	});

	test("keeps the inventory open while billing is not set up (#9)", async () => {
		const { pils, running } = await seedRunningInventory();
		await setGetraenkeBillingProfile({ senderStreet: "" });

		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 15, purchasedSince: 0 },
		]);

		expect(result).toEqual({
			success: false,
			failedStep: "inventory",
			error:
				"Bitte Absender und Konto in der Kasse hinterlegen (fehlt: Straße).",
		});
		expect(billing).not.toHaveBeenCalled();
		expect(await allInventories()).toEqual([
			expect.objectContaining({ id: running.id, status: "active" }),
		]);
	});

	test("does nothing for anonymous callers", async () => {
		const { pils, running } = await seedRunningInventory();
		signOut();

		expect(
			await closeInventoryAndBill([
				{ drinkId: pils.id, countedStock: 15, purchasedSince: 0 },
			]),
		).toEqual({
			success: false,
			failedStep: "inventory",
			error: "Unauthorized",
		});
		expect(billing).not.toHaveBeenCalled();
		expect(await allInventories()).toEqual([
			expect.objectContaining({ id: running.id, status: "active" }),
		]);
	});

	test("reports a failed billing run as a failure and keeps the inventory", async () => {
		const { pils, running } = await seedRunningInventory();
		billing.mockResolvedValueOnce({
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			error: "database is locked",
			billsCreated: 0,
			totalAmount: 0,
		});

		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 15, purchasedSince: 0 },
		]);

		expect(result).toEqual({
			success: false,
			failedStep: "billing",
			totalInventoryLoss: 4.5,
			error:
				"Inventur gespeichert, aber die Rechnung ist fehlgeschlagen: database is locked. Der Inventurverlust von €4.50 wurde nicht abgerechnet.",
		});
		const [closed] = await allInventories();
		expect(closed).toMatchObject({ id: running.id, status: "closed" });
		// The orders stay unbilled for the next run.
		const rows = await tenantDb().select().from(orders);
		expect(rows.map((o) => o.inBill)).toEqual([false]);
	});

	test("reports a thrown billing error as a failure", async () => {
		const { pils } = await seedRunningInventory();
		billing.mockRejectedValueOnce(new Error("Verbindung verloren"));

		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 18, purchasedSince: 0 },
		]);

		expect(result).toEqual({
			success: false,
			failedStep: "billing",
			totalInventoryLoss: 0,
			error:
				"Inventur gespeichert, aber die Rechnung ist fehlgeschlagen: Verbindung verloren.",
		});
	});

	test("reports a billing run that found nothing to bill", async () => {
		const pils = await createDrink({ price: 1 });
		await createInventory({
			createdAt: daysAgo(7),
			items: [{ drink: pils, countedStock: 4 }],
		});

		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 4, purchasedSince: 0 },
		]);

		expect(result).toEqual({
			success: true,
			totalInventoryLoss: 0,
			billsCreated: 0,
			message: "Keine unbezahlten Bestellungen gefunden",
		});
	});
});
