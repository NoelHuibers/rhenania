import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	bills,
	externalBills,
	inventories,
	inventoryItems,
	kasseConfig,
} from "~/server/db/schema";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createKontoRow,
	eventUser,
	setUpGetraenkeBilling,
	TEST_BILLING_PROFILE,
} from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	createUser,
	setFeature,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	addBankEntry,
	addExternalBill,
	deleteBankEntry,
	deleteExternalBill,
	downloadEntityBillPDF,
	getBankEntries,
	getExternalBills,
	getGetraenkeBillingSettings,
	getGetraenkeSettings,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
	markAllMemberBillsPaid,
	markExternalBillPaid,
	setBillRecipient,
	setMarkupPercent,
	setPfandWert,
	updateGetraenkeBillingProfile,
} from "./kasse";

setupTestDatabases();

const NOW = new Date("2026-10-21T12:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function signInWart(features: Parameters<typeof createTenant>[0] = {}) {
	await createTenant(features);
	const wart = await createUser({ name: "Wart", roles: ["Getränkewart"] });
	signInAs(wart);
	return wart;
}

async function closedInventory(
	closedAt: Date,
	items: Array<{ counted: number; price: number }>,
) {
	const [inventory] = await tenantDb()
		.insert(inventories)
		.values({ status: "closed", closedAt })
		.returning();
	for (const item of items) {
		const drink = await createDrink();
		await tenantDb()
			.insert(inventoryItems)
			.values({
				inventoryId: inventory?.id ?? "",
				drinkId: drink.id,
				countedStock: item.counted,
				priceAtCount: item.price,
			});
	}
	return inventory;
}

describe("getKasseSummary", () => {
	test("adds cash, stock, open bills and Pfand and subtracts open external bills", async () => {
		await signInWart();
		await addBankEntry({ amount: 500, description: "Einzahlung", date: NOW });
		await addBankEntry({ amount: -120.5, description: "Einkauf", date: NOW });
		await closedInventory(new Date("2026-09-01T12:00:00Z"), [
			{ counted: 100, price: 1 },
		]);
		const latest = await closedInventory(new Date("2026-10-01T12:00:00Z"), [
			{ counted: 10, price: 1.5 },
			{ counted: 4, price: 2 },
		]);
		await tenantDb().insert(inventories).values({ status: "active" });
		const period = await createBillPeriodRow();
		const member = { id: "u1", name: "Member" };
		await createBillRow({ periodId: period.id, user: member, drinksTotal: 30 });
		await createBillRow({
			periodId: period.id,
			user: member,
			status: "Übertragen",
			drinksTotal: 1000,
		});
		await createBillRow({
			periodId: period.id,
			user: member,
			status: "Bezahlt",
			drinksTotal: 1000,
		});
		await createBillRow({
			periodId: period.id,
			user: eventUser("CC"),
			drinksTotal: 45,
		});
		await addExternalBill({
			creditor: "Brauerei",
			description: "Lieferung",
			amount: 200,
		});
		await addExternalBill({
			creditor: "Getränkemarkt",
			description: "Alt",
			amount: 999,
		});
		const [paidExternal] = await tenantDb()
			.select()
			.from(externalBills)
			.where(eq(externalBills.creditor, "Getränkemarkt"));
		await markExternalBillPaid(paidExternal?.id ?? "");
		await setPfandWert(80);

		const summary = await getKasseSummary();

		expect(summary).toEqual({
			kassenstand: 379.5,
			lagerwert: 23,
			lagerwertDate: latest?.closedAt,
			offeneMitglieder: 30,
			offeneGruppen: 45,
			pfand: 80,
			externOffen: 200,
			gesamt: 379.5 + 23 + 30 + 45 + 80 - 200,
		});
	});

	test("is all zero for a fresh tenant", async () => {
		await signInWart();

		expect(await getKasseSummary()).toEqual({
			kassenstand: 0,
			lagerwert: 0,
			lagerwertDate: null,
			offeneMitglieder: 0,
			offeneGruppen: 0,
			pfand: 0,
			externOffen: 0,
			gesamt: 0,
		});
	});

	// New: "Offene Mitgliederrechnungen" only sums Unbezahlt, while the open
	// member list (getOpenMemberBills) also shows Gestundet bills, which are
	// still owed to the Kasse.
	test.fails("counts Gestundet member bills as open, like the open list (#139)", async () => {
		await signInWart();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "A" },
			drinksTotal: 10,
		});
		await createBillRow({
			periodId: period.id,
			user: { id: "u2", name: "B" },
			status: "Gestundet",
			drinksTotal: 15,
		});

		const listed = (await getOpenMemberBills()).reduce(
			(s, b) => s + b.total,
			0,
		);
		const summary = await getKasseSummary();

		expect(listed).toBe(25);
		expect(summary.offeneMitglieder).toBe(listed);
	});
});

describe("bank entries, external bills and Pfand", () => {
	test("bank entries are stored with their author and listed newest first", async () => {
		const wart = await signInWart();

		await addBankEntry({
			amount: 50,
			description: "Alt",
			date: new Date("2026-10-01T12:00:00Z"),
		});
		await addBankEntry({
			amount: -20,
			description: "Neu",
			date: new Date("2026-10-15T12:00:00Z"),
		});

		const entries = await getBankEntries();
		expect(entries.map((e) => [e.description, e.amount, e.createdBy])).toEqual([
			["Neu", -20, wart.id],
			["Alt", 50, wart.id],
		]);

		expect(await deleteBankEntry(entries[0]?.id ?? "")).toEqual({
			success: true,
		});
		expect((await getBankEntries()).map((e) => e.description)).toEqual(["Alt"]);
	});

	test("external bills go from Offen to Bezahlt and can be deleted", async () => {
		const wart = await signInWart();

		await addExternalBill({
			creditor: "Brauerei",
			description: "Fass",
			amount: 150,
		});
		const [bill] = await getExternalBills();
		expect(bill).toMatchObject({
			creditor: "Brauerei",
			amount: 150,
			status: "Offen",
			paidAt: null,
			createdBy: wart.id,
		});

		await markExternalBillPaid(bill?.id ?? "");
		const [paid] = await getExternalBills();
		expect(paid).toMatchObject({ status: "Bezahlt", paidAt: NOW });

		await deleteExternalBill(bill?.id ?? "");
		expect(await getExternalBills()).toHaveLength(0);
	});

	test("Pfand defaults to 0 and is upserted on the singleton config row", async () => {
		const wart = await signInWart();
		await setKasseConfig({ markupPercent: 12 });

		expect(await getPfandWert()).toBe(0);
		await setPfandWert(40);
		await setPfandWert(65.5);

		expect(await getPfandWert()).toBe(65.5);
		const rows = await tenantDb().select().from(kasseConfig);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			pfandWert: 65.5,
			markupPercent: 12,
			updatedBy: wart.id,
		});
	});
});

describe("open bills", () => {
	test("member list shows Unbezahlt and Gestundet personal bills by name", async () => {
		await signInWart();
		const period = await createBillPeriodRow();
		for (const [name, status] of [
			["Zora", "Unbezahlt"],
			["Anton", "Gestundet"],
			["Paid", "Bezahlt"],
			["Carried", "Übertragen"],
		] as const) {
			await createBillRow({
				periodId: period.id,
				user: { id: `u-${name}`, name },
				status,
				drinksTotal: 1,
			});
		}
		await createBillRow({ periodId: period.id, user: eventUser("CC") });

		const open = await getOpenMemberBills();

		expect(open.map((b) => [b.userName, b.status])).toEqual([
			["Anton", "Gestundet"],
			["Zora", "Unbezahlt"],
		]);
	});

	test("entity list returns group bills with their items", async () => {
		await signInWart();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: eventUser("CC"),
			drinksTotal: 3,
			items: [{ drinkName: "Pils", amount: 2, pricePerDrink: 1.5 }],
		});
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Member" },
		});

		const entityBills = await getOpenEntityBills();

		expect(entityBills).toHaveLength(1);
		expect(entityBills[0]).toMatchObject({
			userName: "CC",
			total: 3,
			items: [{ drinkName: "Pils", amount: 2, totalPricePerDrink: 3 }],
		});
	});

	test("Getränkewart downloads a group bill PDF as base64", async () => {
		await signInWart();
		await setUpGetraenkeBilling();
		const period = await createBillPeriodRow({ billNumber: "KW-43-26" });
		const bill = await createBillRow({
			periodId: period.id,
			user: eventUser("AHV Stammtisch"),
			drinksTotal: 12,
		});

		const result = await downloadEntityBillPDF(bill.id);

		expect(result).toMatchObject({
			success: true,
			fileName: "Rechnung_KW-43-26_AHV_Stammtisch.pdf",
		});
		expect(
			Buffer.from(result.base64 ?? "", "base64")
				.subarray(0, 5)
				.toString(),
		).toBe("%PDF-");
		expect(await downloadEntityBillPDF("missing")).toMatchObject({
			success: false,
			error: "Bill with ID missing not found",
		});
	});

	test("group bill PDFs are refused to members without the role", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		const bill = await createBillRow({
			periodId: period.id,
			user: eventUser("CC"),
		});
		signInAs(await createUser());

		expect(await downloadEntityBillPDF(bill.id)).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
	});
});

describe("Absender und Konto (#9)", () => {
	const input = { ...TEST_BILLING_PROFILE, location: "", website: "" };

	test("the Getränkewart sees what is missing, then fills it in", async () => {
		await signInWart();

		expect(await getGetraenkeBillingSettings()).toEqual({
			profile: {
				senderName: "",
				senderStreet: "",
				senderCity: "",
				location: "",
				website: "",
				accountHolder: "",
				paymentDueDays: 14,
			},
			payment: null,
			missing: [
				"Absender",
				"Straße",
				"PLZ und Ort",
				"Kontoinhaber",
				"Getränkekasse-Konto mit gültiger IBAN",
			],
		});

		expect(
			await updateGetraenkeBillingProfile({
				...input,
				senderName: "  Erika Kassenwart ",
			}),
		).toEqual({ success: true });
		await createKontoRow({ paypalLink: null });

		const settings = await getGetraenkeBillingSettings();
		expect(settings?.profile.senderName).toBe("Erika Kassenwart");
		expect(settings?.payment).toEqual({
			iban: "DE89 3704 0044 0532 0130 00",
			paypalBaseUrl: null,
		});
		expect(settings?.missing).toEqual([]);

		// Saving again updates the singleton.
		await updateGetraenkeBillingProfile({ ...input, paymentDueDays: 21 });
		expect((await getGetraenkeBillingSettings())?.profile.paymentDueDays).toBe(
			21,
		);
	});

	test("rejects invalid due days", async () => {
		await signInWart();

		expect(
			await updateGetraenkeBillingProfile({ ...input, paymentDueDays: 0 }),
		).toEqual({ success: false, error: "Zahlungsziel: 1 bis 90 Tage" });
	});

	test("is only for the Getränkewart", async () => {
		await createTenant();
		signInAs(await createUser());

		expect(await getGetraenkeBillingSettings()).toBeNull();
		expect(await updateGetraenkeBillingProfile(input)).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
	});
});

describe("feature settings", () => {
	test("getGetraenkeSettings is null without either feature", async () => {
		await signInWart();
		await setKasseConfig({ markupPercent: 10 });

		expect(await getGetraenkeSettings()).toBeNull();
	});

	test("getGetraenkeSettings returns stored values or defaults", async () => {
		await signInWart({ features: ["billing.treasurerRecipient"] });
		expect(await getGetraenkeSettings()).toEqual({
			markupPercent: 0,
			billRecipient: "members",
			treasurerEmail: "",
		});

		await setKasseConfig({
			markupPercent: 15,
			billRecipient: "treasurer",
			treasurerEmail: "kw@example.test",
		});
		expect(await getGetraenkeSettings()).toEqual({
			markupPercent: 15,
			billRecipient: "treasurer",
			treasurerEmail: "kw@example.test",
		});
	});

	test("setMarkupPercent stores valid values only while drinks.markup is on", async () => {
		const wart = await signInWart();

		expect(await setMarkupPercent(10)).toEqual({
			success: false,
			error: 'Die Funktion „Preisaufschlag" ist nicht freigeschaltet.',
		});

		await setFeature("drinks.markup", true);
		for (const invalid of [-1, 501, Number.NaN]) {
			expect(await setMarkupPercent(invalid)).toMatchObject({ success: false });
		}
		expect(await tenantDb().select().from(kasseConfig)).toHaveLength(0);

		expect(await setMarkupPercent(12.5)).toEqual({ success: true });
		expect(await setMarkupPercent(500)).toEqual({ success: true });
		const [row] = await tenantDb().select().from(kasseConfig);
		expect(row).toMatchObject({ markupPercent: 500, updatedBy: wart.id });
	});

	test("setMarkupPercent requires the Getränkewart or Admin role", async () => {
		await createTenant({ features: ["drinks.markup"] });
		signInAs(await createUser());

		expect(await setMarkupPercent(10)).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});

		signInAs(await createUser({ roles: ["Admin"] }));
		expect(await setMarkupPercent(10)).toEqual({ success: true });
	});

	test("setBillRecipient validates mode and address while the feature is on", async () => {
		await signInWart();

		expect(
			(await setBillRecipient("treasurer", "kw@example.test")).success,
		).toBe(false);

		await setFeature("billing.treasurerRecipient", true);
		expect(await setBillRecipient("treasurer", "  ")).toEqual({
			success: false,
			error: "Bitte die E-Mail-Adresse des Kassenwarts eintragen.",
		});
		expect(await setBillRecipient("members", "not-an-email")).toEqual({
			success: false,
			error: "Ungültige E-Mail-Adresse",
		});
		expect(
			await setBillRecipient("everyone" as "members", "kw@example.test"),
		).toEqual({ success: false, error: "Ungültiger Empfänger" });
		expect(await tenantDb().select().from(kasseConfig)).toHaveLength(0);

		expect(await setBillRecipient("treasurer", " kw@example.test ")).toEqual({
			success: true,
		});
		let [row] = await tenantDb().select().from(kasseConfig);
		expect(row).toMatchObject({
			billRecipient: "treasurer",
			treasurerEmail: "kw@example.test",
		});

		// Switching back to members without an address clears it.
		await setBillRecipient("members", "");
		[row] = await tenantDb().select().from(kasseConfig);
		expect(row).toMatchObject({
			billRecipient: "members",
			treasurerEmail: null,
		});
	});
});

describe("markAllMemberBillsPaid", () => {
	test("is refused while billing.markAllPaid is off and changes nothing", async () => {
		await signInWart();
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: { id: "u1", name: "A" } });

		expect(await markAllMemberBillsPaid()).toEqual({
			success: false,
			error: 'Die Funktion „Alle haben gezahlt" ist nicht freigeschaltet.',
		});
		expect((await billsOf("u1"))[0]?.status).toBe("Unbezahlt");
	});

	test("is refused to members without the role", async () => {
		await createTenant({ features: ["billing.markAllPaid"] });
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: { id: "u1", name: "A" } });
		signInAs(await createUser());

		expect(await markAllMemberBillsPaid()).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect((await billsOf("u1"))[0]?.status).toBe("Unbezahlt");
	});

	test("settles every open member bill and its carried predecessors, not group bills", async () => {
		await signInWart({ features: ["billing.markAllPaid"] });
		const old = await createBillPeriodRow();
		const current = await createBillPeriodRow();
		const anna = { id: "u-anna", name: "Anna" };
		const ben = { id: "u-ben", name: "Ben" };
		await createBillRow({
			periodId: old.id,
			user: anna,
			status: "Übertragen",
			drinksTotal: 10,
			createdAt: new Date("2026-10-07T12:00:00Z"),
		});
		await createBillRow({
			periodId: current.id,
			user: anna,
			drinksTotal: 5,
			oldBillingAmount: 10,
			fees: 1,
		});
		await createBillRow({
			periodId: current.id,
			user: ben,
			status: "Gestundet",
			drinksTotal: 7,
		});
		const group = await createBillRow({
			periodId: current.id,
			user: eventUser("CC"),
			drinksTotal: 30,
		});

		expect(await markAllMemberBillsPaid()).toEqual({ success: true, count: 2 });

		for (const bill of [
			...(await billsOf(anna.id)),
			...(await billsOf(ben.id)),
		]) {
			expect(bill).toMatchObject({ status: "Bezahlt", paidAt: NOW });
		}
		const [groupAfter] = await tenantDb()
			.select()
			.from(bills)
			.where(eq(bills.id, group.id));
		expect(groupAfter?.status).toBe("Unbezahlt");
		expect(await getOpenMemberBills()).toHaveLength(0);
	});

	test("reports zero when nothing is open", async () => {
		await signInWart({ features: ["billing.markAllPaid"] });

		expect(await markAllMemberBillsPaid()).toEqual({ success: true, count: 0 });
	});
});

describe("signed-out visitors", () => {
	test("cannot change the Kasse", async () => {
		await createTenant({
			features: ["drinks.markup", "billing.treasurerRecipient"],
		});
		const notSignedIn = { success: false, error: "Nicht angemeldet" };

		expect(
			await addBankEntry({ amount: 1, description: "x", date: NOW }),
		).toEqual(notSignedIn);
		expect(await deleteBankEntry("x")).toEqual(notSignedIn);
		expect(
			await addExternalBill({ creditor: "x", description: "x", amount: 1 }),
		).toEqual(notSignedIn);
		expect(await markExternalBillPaid("x")).toEqual(notSignedIn);
		expect(await deleteExternalBill("x")).toEqual(notSignedIn);
		expect(await setPfandWert(1)).toEqual(notSignedIn);
		expect(await downloadEntityBillPDF("x")).toEqual(notSignedIn);
		expect(await setMarkupPercent(10)).toEqual(notSignedIn);
		expect(await setBillRecipient("members", "")).toEqual(notSignedIn);
		expect(await markAllMemberBillsPaid()).toEqual(notSignedIn);
	});
});

describe("group bills without items", () => {
	test("are listed with an empty item list", async () => {
		await signInWart();
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: eventUser("CC") });

		const [bill] = await getOpenEntityBills();

		expect(bill).toMatchObject({ userName: "CC", items: [] });
	});
});
