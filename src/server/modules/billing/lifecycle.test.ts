// The Getränke billing lifecycle across several periods (#55): orders,
// billing runs, carry-over ("Übertrag") with the late fee ("Mahnung"),
// deferred bills ("Gestundet"), payments, "Alle haben gezahlt", the Umlage
// from "Inventur + Rechnung" and the markup. Everything runs through the real
// server actions on the harness DBs; only mail and Blob are mocked. The bill
// PDFs are rendered for real and read back.
//
// Money invariants checked along the way:
// - every stored amount is whole cents and a bill's parts add up to its total;
// - the PDF lines add up to the printed total;
// - a period's total is the sum of its bills, a bill's items sum to its drinks;
// - every billed order is on exactly one bill;
// - per member: what is open equals what was charged (drinks + Mahnung +
//   Umlage) minus what was paid ("Kassenbuch").

import { head, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { toCents } from "~/lib/money";
import { closeInventoryAndBill } from "~/server/actions/inventur/inventur";
import { createOrder } from "~/server/actions/orders";
import { billItems, billPeriods, bills, orders } from "~/server/db/schema";
import { sendTenantMail } from "~/server/lib/mailer";
import { billPdf, periodCsv } from "~/server/modules/billing/service";
import {
	getKasseSummary,
	getOpenMemberBills,
	markAllMemberBillsPaid,
	setBillRecipient,
	setMarkupPercent,
} from "~/server/modules/getraenkekasse/actions";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	pdfText,
	pdfValueAfter,
	setGetraenkeBillingProfile,
	setUpGetraenkeBilling,
} from "../../../../test/factories/billing";
import {
	createInventory,
	createOrderRow as createOrderAt,
	daysAgo,
} from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import {
	createNewBilling,
	getAllBillPeriods,
	getBillsForPeriod,
	saveBillPeriodCSV,
	updateBillStatus,
} from "./actions";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), head: vi.fn() }));

setupTestDatabases();

const mail = vi.mocked(sendTenantMail);
const putMock = vi.mocked(put);

/** Wednesday noon (same date in Berlin and UTC) of ISO week 41 + n, 2026. */
function woche(n: number): Date {
	return new Date(Date.UTC(2026, 9, 7 + 7 * n, 12));
}

type Bill = typeof bills.$inferSelect;

let wart: TestUser;
/** Payments made in the test, in cents per member. */
let kassenbuch: Map<string, number>;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(woche(0));
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	putMock.mockImplementation(async (pathname) => ({
		url: `https://blob.test/${pathname}`,
		downloadUrl: `https://blob.test/${pathname}?download=1`,
		pathname: String(pathname),
		contentType: "text/csv",
		contentDisposition: "inline",
		etag: "etag",
	}));
	vi.mocked(head).mockResolvedValue({} as Awaited<ReturnType<typeof head>>);
	kassenbuch = new Map();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function kasseEinrichten(
	features: Parameters<typeof createTenant>[0] = {},
) {
	const tenant = await createTenant(features);
	await setUpGetraenkeBilling();
	wart = await createUser({ name: "Wart", roles: ["Getränkewart"] });
	signInAs(wart);
	return tenant;
}

/** The member orders through the real order action (markup included). */
async function bestellen(
	member: TestUser,
	drink: { id: string },
	amount = 1,
	bookingFor: string | null = null,
) {
	signInAs(member);
	const result = await createOrder({
		drinkId: drink.id,
		drinkName: "",
		pricePerUnit: 0,
		total: 0,
		amount,
		bookingFor,
	});
	signInAs(wart);
	expect(result.success).toBe(true);
}

/** "Neue Rechnung" in the Kasse at `date`; must not fail. */
async function abrechnen(date: Date) {
	vi.setSystemTime(date);
	const result = await createNewBilling();
	if (!result.ok) {
		throw new Error(`Billing failed: ${result.error}`);
	}
	return result.data;
}

/** "Neue Rechnung" that must create a period. */
async function abrechnenMitPeriode(date: Date) {
	const result = await abrechnen(date);
	if (!("billPeriod" in result)) {
		throw new Error(`Billing created no period: ${result.message}`);
	}
	return result;
}

async function neuesteRechnung(userId: string): Promise<Bill> {
	const bill = (await billsOf(userId)).at(-1);
	if (!bill) {
		throw new Error(`No bill for ${userId}`);
	}
	return bill;
}

/** Marks a bill paid through the Kasse and books the payment. */
async function bezahlen(bill: Bill) {
	expect(await updateBillStatus(bill.id, "Bezahlt")).toEqual({ ok: true });
	kassenbuch.set(
		bill.userId,
		(kassenbuch.get(bill.userId) ?? 0) + toCents(bill.total),
	);
}

/** Undoes a payment booked with `bezahlen`. */
async function zahlungZuruecknehmen(bill: Bill) {
	expect(await updateBillStatus(bill.id, "Unbezahlt")).toEqual({ ok: true });
	kassenbuch.set(
		bill.userId,
		(kassenbuch.get(bill.userId) ?? 0) - toCents(bill.total),
	);
}

const isOpen = (b: Bill) =>
	b.status === "Unbezahlt" || b.status === "Gestundet";
const sumCents = (amounts: number[]) =>
	amounts.reduce((s, a) => s + toCents(a), 0);

/** Open amount of a member, in cents. */
async function offenCents(userId: string) {
	return sumCents((await billsOf(userId)).filter(isOpen).map((b) => b.total));
}

/**
 * The Kassenbuch: per member, the open bills equal everything ever charged
 * (drinks, Mahnung, Umlage — the Übertrag is not new money) minus payments.
 */
async function expectKassenbuchStimmt(members: TestUser[]) {
	for (const member of members) {
		const memberBills = await billsOf(member.id);
		const charged = sumCents(
			memberBills.flatMap((b) => [b.drinksTotal, b.fees, b.umlage]),
		);
		const paid = kassenbuch.get(member.id) ?? 0;
		expect({ member: member.name, open: await offenCents(member.id) }).toEqual({
			member: member.name,
			open: charged - paid,
		});
	}
}

const isWholeCents = (n: number) => n === toCents(n) / 100;

/** Invariants over all bills, items, periods and orders of the tenant. */
async function expectGeldInvarianten() {
	const allBills = await tenantDb().select().from(bills);
	const allItems = await tenantDb().select().from(billItems);
	const periods = await tenantDb().select().from(billPeriods);
	const billedOrders = await tenantDb()
		.select()
		.from(orders)
		.where(eq(orders.inBill, true));

	for (const bill of allBills) {
		const parts = [
			bill.drinksTotal,
			bill.oldBillingAmount,
			bill.fees,
			bill.umlage,
		];
		for (const amount of [...parts, bill.total]) {
			expect(isWholeCents(amount)).toBe(true);
		}
		expect(toCents(bill.total)).toBe(sumCents(parts));

		const items = allItems.filter((i) => i.billId === bill.id);
		for (const item of items) {
			expect(toCents(item.totalPricePerDrink)).toBe(
				toCents(item.amount * item.pricePerDrink),
			);
		}
		expect(sumCents(items.map((i) => i.totalPricePerDrink))).toBe(
			toCents(bill.drinksTotal),
		);
	}

	for (const period of periods) {
		expect(toCents(period.totalAmount)).toBe(
			sumCents(
				allBills
					.filter((b) => b.billPeriodId === period.id)
					.map((b) => b.total),
			),
		);
	}

	// Every billed order is on exactly one bill: nothing lost, nothing twice.
	expect(sumCents(allBills.map((b) => b.drinksTotal))).toBe(
		sumCents(billedOrders.map((o) => o.total)),
	);

	// Older open bills are always rolled into the newest one.
	const openPerMember = new Map<string, number>();
	for (const bill of allBills.filter(isOpen)) {
		if (!bill.userId.startsWith("event-")) {
			openPerMember.set(bill.userId, (openPerMember.get(bill.userId) ?? 0) + 1);
		}
	}
	for (const count of openPerMember.values()) {
		expect(count).toBe(1);
	}
}

/** "12,50€" → 12.5 */
function euro(text: string | undefined): number {
	const match = /^(-?\d+),(\d{2})/.exec(text ?? "");
	if (!match) {
		throw new Error(`Not an amount: ${text}`);
	}
	return Number(`${match[1]}.${match[2]}`);
}

/** The summary lines of the bill PDF, read back from the rendered file. */
async function pdfZeilen(billId: string) {
	const { pdf } = await billPdf(testScope(), billId);
	const zeilen = {
		rechnungsbetrag: euro(pdfValueAfter(pdf, "Rechnungsbetrag:")),
		alteRechnung: euro(pdfValueAfter(pdf, "Alte Rechnung:")),
		mahnung: euro(pdfValueAfter(pdf, "Mahnung:")),
		umlage: euro(pdfValueAfter(pdf, "Umlage:")),
		gesamt: euro(pdfValueAfter(pdf, "Gesamtbetrag:")),
	};
	// The printed lines add up to the printed total.
	expect(
		sumCents([
			zeilen.rechnungsbetrag,
			zeilen.alteRechnung,
			zeilen.mahnung,
			zeilen.umlage,
		]),
	).toBe(toCents(zeilen.gesamt));
	return zeilen;
}

function csvZeilen(csv: string | undefined) {
	const lines = (csv ?? "").split("\n").map((l) => l.split(";"));
	const header = lines[0] ?? [];
	const byName = new Map(lines.slice(1).map((cells) => [cells[0], cells]));
	return {
		header,
		row(name: string, column: string) {
			return byName.get(name)?.[header.indexOf(column)];
		},
		names: lines.slice(1).map((cells) => cells[0]),
	};
}

describe("Erste Abrechnung", () => {
	test("Bestellungen → Rechnungen, Summen, CSV, PDF, Mails und Kasse", async () => {
		const tenant = await kasseEinrichten();
		const max = await createUser({ name: "Max", email: "max@example.test" });
		const moritz = await createUser({
			name: "Moritz",
			email: "moritz@example.test",
		});
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const wasser = await createDrink({ name: "Wasser", price: 1 });

		await bestellen(max, pils, 2);
		await bestellen(max, pils);
		await bestellen(max, wasser, 3);
		await bestellen(moritz, pils, 4);
		await bestellen(moritz, pils, 2, "CC");

		const run = await abrechnenMitPeriode(woche(0));

		expect(run).toMatchObject({
			success: true,
			billsCreated: 2,
			eventBillsCreated: 1,
			totalAmount: 16.5,
			billPeriod: { billNumber: "KW-41-26" },
		});
		const periodBills = await getBillsForPeriod(run.billPeriod.id);
		expect(
			periodBills.map((b) => [
				b.name,
				b.status,
				b.drinksTotal,
				b.oldBillingAmount,
				b.fees,
				b.umlage,
				b.totalDue,
			]),
		).toEqual([
			["CC", "Unbezahlt", 3, 0, 0, 0, 3],
			["Max", "Unbezahlt", 7.5, 0, 0, 0, 7.5],
			["Moritz", "Unbezahlt", 6, 0, 0, 0, 6],
		]);
		expect(
			periodBills[1]?.items.map((i) => [i.name, i.quantity, i.subtotal]),
		).toEqual([
			["Pils", 3, 4.5],
			["Wasser", 3, 3],
		]);
		await expectGeldInvarianten();

		// CSV: group bills first, quantities per drink, money columns, GESAMT.
		const csv = await periodCsv(testScope(), run.billPeriod.id, {
			delimiter: ";",
		});
		const table = csvZeilen(csv.csvContent);
		expect(table.names).toEqual([
			"CC",
			"Max",
			"Moritz",
			"",
			"Preis/Einheit",
			"GESAMT",
		]);
		expect(table.row("Max", "Pils")).toBe("3");
		expect(table.row("Max", "Wasser")).toBe("3");
		expect(table.row("Max", "Rechnungsbetrag")).toBe("7,50 EUR");
		expect(table.row("Max", "Zu zahlender Betrag")).toBe("7,50 EUR");
		expect(table.row("Max", "PayPal Link")).toMatch(/\/7\.50EUR$/);
		expect(table.row("GESAMT", "Pils")).toBe("9");
		expect(table.row("GESAMT", "Zu zahlender Betrag")).toBe("16,50 EUR");

		// The Kasse's CSV download stores exactly that file in Blob.
		const saved = await saveBillPeriodCSV(run.billPeriod.id);
		expect(saved).toMatchObject({ ok: true, data: { wasExisting: false } });
		expect(putMock).toHaveBeenCalledExactlyOnceWith(
			`tenants/${tenant.slug}/bills/Rechnung_07_Okt_2026.csv`,
			csv.csvContent,
			{
				access: "public",
				contentType: "text/csv;charset=utf-8",
				addRandomSuffix: true,
			},
		);

		// PDF: the printed lines are the stored parts.
		const maxBill = await neuesteRechnung(max.id);
		expect(await pdfZeilen(maxBill.id)).toEqual({
			rechnungsbetrag: 7.5,
			alteRechnung: 0,
			mahnung: 0,
			umlage: 0,
			gesamt: 7.5,
		});

		// Mails: one per member with their PDF, none for the group bill.
		expect(mail.mock.calls.map(([m]) => m.to).sort()).toEqual([
			"max@example.test",
			"moritz@example.test",
		]);
		const maxMail = mail.mock.calls.find(
			([m]) => m.to === "max@example.test",
		)?.[0];
		expect(maxMail?.subject).toBe("Deine Getränkerechnung KW-41-26 ist bereit");
		expect(maxMail?.text).toContain("Gesamtbetrag: 7,50€");
		const attachment = maxMail?.attachments?.[0]?.content as Buffer;
		expect(pdfValueAfter(attachment, "Gesamtbetrag:")).toMatch(/^7,50/);

		// Kasse: open member and group bills.
		expect(await getKasseSummary()).toMatchObject({
			offeneMitglieder: 13.5,
			gestundetMitglieder: 0,
			offeneGruppen: 3,
			gestundetGruppen: 0,
			gesamt: 16.5,
		});
		expect((await getOpenMemberBills()).map((b) => b.userName)).toEqual([
			"Max",
			"Moritz",
		]);
		await expectKassenbuchStimmt([max, moritz]);
	});

	test("ein Lauf ohne neue Bestellungen legt keine Periode an und mahnt nicht", async () => {
		await kasseEinrichten();
		const member = await createUser();
		await bestellen(member, await createDrink({ price: 10 }));
		await abrechnenMitPeriode(woche(0));
		const sent = mail.mock.calls.length;

		const result = await abrechnen(woche(1));

		expect(result).toMatchObject({ success: true, billsCreated: 0 });
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(1);
		expect((await billsOf(member.id)).map((b) => [b.status, b.total])).toEqual([
			["Unbezahlt", 10],
		]);
		expect(mail).toHaveBeenCalledTimes(sent);
	});
});

describe("Übertrag und Mahnung über mehrere Perioden", () => {
	// Issue #55, case 1. P2 is billed because somebody else ordered: the debt
	// moves into a carry-only bill (with its Mahnung) and on into P3.
	test("10 € offen in P1, nichts in P2, 3 € in P3: P3 trägt alles, P1 und P2 sind Übertragen", async () => {
		await kasseEinrichten();
		const schuldner = await createUser({ name: "Schuldner" });
		const andere = await createUser({ name: "Andere" });
		const bier = await createDrink({ name: "Bier", price: 2.5 });
		const wasser = await createDrink({ name: "Wasser", price: 1 });

		await bestellen(schuldner, bier, 4);
		await bestellen(andere, wasser);
		await abrechnenMitPeriode(woche(0));
		await bezahlen(await neuesteRechnung(andere.id));

		await bestellen(andere, wasser);
		await abrechnenMitPeriode(woche(1));
		await bezahlen(await neuesteRechnung(andere.id));

		await bestellen(schuldner, wasser, 3);
		await abrechnenMitPeriode(woche(2));

		const chain = await billsOf(schuldner.id);
		expect(
			chain.map((b) => [
				b.status,
				b.drinksTotal,
				b.oldBillingAmount,
				b.fees,
				b.total,
			]),
		).toEqual([
			["Übertragen", 10, 0, 0, 10],
			["Übertragen", 0, 10, 1, 11],
			["Unbezahlt", 3, 11, 1.1, 15.1],
		]);
		expect(await pdfZeilen(chain[2]?.id ?? "")).toEqual({
			rechnungsbetrag: 3,
			alteRechnung: 11,
			mahnung: 1.1,
			umlage: 0,
			gesamt: 15.1,
		});
		expect((await getKasseSummary()).offeneMitglieder).toBe(15.1);
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([schuldner, andere]);
	});

	test("ohne Lauf in P2 trägt P3 die 10 € mit einer Mahnung: 3 + 10 + 1 €", async () => {
		await kasseEinrichten();
		const schuldner = await createUser({ name: "Schuldner" });
		await bestellen(schuldner, await createDrink({ price: 2.5 }), 4);
		await abrechnenMitPeriode(woche(0));
		expect(await abrechnen(woche(1))).toMatchObject({ billsCreated: 0 });

		await bestellen(schuldner, await createDrink({ price: 1 }), 3);
		await abrechnenMitPeriode(woche(2));

		expect(
			(await billsOf(schuldner.id)).map((b) => [b.status, b.total]),
		).toEqual([
			["Übertragen", 10],
			["Unbezahlt", 14],
		]);
		await expectGeldInvarianten();
	});

	// Regression for the bug `scripts/repair-orphaned-bill-carryover.ts`
	// cleaned up: debt that is not in the last period must still be carried.
	// Carrying only the last period's bills makes this test fail.
	test("Schulden aus einer älteren als der letzten Periode werden übertragen", async () => {
		await kasseEinrichten();
		const schuldner = await createUser({ name: "Schuldner" });
		const andere = await createUser({ name: "Andere" });
		const bier = await createDrink({ price: 2.5 });
		const wasser = await createDrink({ price: 1 });

		await bestellen(schuldner, bier, 4);
		await abrechnenMitPeriode(woche(0));
		// Marked paid by mistake, so P2 leaves the member out ...
		const p1 = await neuesteRechnung(schuldner.id);
		await bezahlen(p1);
		await bestellen(andere, wasser);
		await abrechnenMitPeriode(woche(1));
		expect(await billsOf(schuldner.id)).toHaveLength(1);
		// ... and set back to Unbezahlt afterwards: the debt sits in P1 now.
		await zahlungZuruecknehmen(p1);

		await bestellen(schuldner, wasser, 3);
		await abrechnenMitPeriode(woche(2));

		expect(
			(await billsOf(schuldner.id)).map((b) => [
				b.status,
				b.oldBillingAmount,
				b.fees,
				b.total,
			]),
		).toEqual([
			["Übertragen", 0, 0, 10],
			["Unbezahlt", 10, 1, 14],
		]);
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([schuldner, andere]);
	});

	test("Mahnung erst über 5 €: 5,00 € ohne, 5,01 € mit 0,50 €, 20 € mit 2 €", async () => {
		await kasseEinrichten();
		const fuenf = await createUser({ name: "Fünf" });
		const fuenfEins = await createUser({ name: "FünfEins" });
		const zwanzig = await createUser({ name: "Zwanzig" });
		await bestellen(fuenf, await createDrink({ price: 5 }));
		await bestellen(fuenfEins, await createDrink({ price: 5.01 }));
		await bestellen(zwanzig, await createDrink({ price: 20 }));
		await abrechnenMitPeriode(woche(0));

		const wasser = await createDrink({ name: "Wasser", price: 1 });
		for (const member of [fuenf, fuenfEins, zwanzig]) {
			await bestellen(member, wasser);
		}
		const run = await abrechnenMitPeriode(woche(1));

		const neu = await Promise.all(
			[fuenf, fuenfEins, zwanzig].map((m) => neuesteRechnung(m.id)),
		);
		expect(neu.map((b) => [b.oldBillingAmount, b.fees, b.total])).toEqual([
			[5, 0, 6],
			[5.01, 0.5, 6.51],
			[20, 2, 23],
		]);
		expect((await pdfZeilen(neu[1]?.id ?? "")).mahnung).toBe(0.5);
		// The CSV states the Mahnung as a factor of the Übertrag.
		const table = csvZeilen(
			(await periodCsv(testScope(), run.billPeriod.id, { delimiter: ";" }))
				.csvContent,
		);
		expect(
			["Fünf", "FünfEins", "Zwanzig"].map((n) => table.row(n, "Mahnfaktor")),
		).toEqual(["0,00 %", "9,98 %", "10,00 %"]);
		expect(table.row("GESAMT", "Mahnung")).toBe("2,50 EUR");
		await expectGeldInvarianten();
	});

	// Issue #55, case 8 (characterization): the Mahnung is charged on the
	// whole Übertrag, earlier Mahnungen included, so it compounds.
	test("20 € unbezahlt wachsen in sechs weiteren Läufen auf 35,43 €", async () => {
		await kasseEinrichten();
		const saeumig = await createUser({ name: "Säumig" });
		const puenktlich = await createUser({ name: "Pünktlich" });
		const wasser = await createDrink({ price: 1 });
		await bestellen(saeumig, await createDrink({ price: 2.5 }), 8);

		for (let week = 0; week <= 6; week++) {
			await bestellen(puenktlich, wasser);
			await abrechnenMitPeriode(woche(week));
			await bezahlen(await neuesteRechnung(puenktlich.id));
		}

		const chain = await billsOf(saeumig.id);
		expect(chain.map((b) => b.total)).toEqual([
			20, 22, 24.2, 26.62, 29.28, 32.21, 35.43,
		]);
		expect(chain.map((b) => b.fees)).toEqual([
			0, 2, 2.2, 2.42, 2.66, 2.93, 3.22,
		]);
		expect(chain.map((b) => b.status)).toEqual([
			...Array(6).fill("Übertragen"),
			"Unbezahlt",
		]);
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([saeumig, puenktlich]);
	});

	test("Gruppenrechnungen werden nie übertragen; CC und cc landen beide auf event-cc", async () => {
		await kasseEinrichten();
		const max = await createUser({ name: "Max" });
		const moritz = await createUser({ name: "Moritz" });
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		await bestellen(max, pils, 2, "CC");
		// The order action only accepts the canonical "CC"; lower-case rows
		// predate that check and still have to land on the same account.
		await createOrderAt({ drink: pils, user: moritz, bookingFor: "cc" });
		await bestellen(moritz, pils);

		const p1 = await abrechnenMitPeriode(woche(0));
		expect(p1).toMatchObject({ billsCreated: 1, eventBillsCreated: 2 });
		const groupBills = await billsOf("event-cc");
		expect(groupBills.map((b) => [b.userName, b.total]).sort()).toEqual([
			["CC", 3],
			["cc", 1.5],
		]);

		await bestellen(moritz, pils);
		await abrechnenMitPeriode(woche(1));

		// No carry-only bill for the group, and the old ones stay open.
		expect(
			(await billsOf("event-cc")).map((b) => [b.status, b.oldBillingAmount]),
		).toEqual([
			["Unbezahlt", 0],
			["Unbezahlt", 0],
		]);
		expect((await getKasseSummary()).offeneGruppen).toBe(4.5);

		// Paying one group bill leaves the other open.
		const cc = groupBills.find((b) => b.userName === "CC") as Bill;
		await updateBillStatus(cc.id, "Bezahlt");
		expect(
			(await billsOf("event-cc")).map((b) => [b.userName, b.status]).sort(),
		).toEqual([
			["CC", "Bezahlt"],
			["cc", "Unbezahlt"],
		]);
		expect((await getKasseSummary()).offeneGruppen).toBe(1.5);
		await expectGeldInvarianten();
	});
});

describe("Gestundet", () => {
	test("wird ohne Mahnung übertragen, danach normal gemahnt; die Kasse zeigt Stundungen getrennt", async () => {
		await kasseEinrichten();
		const gustav = await createUser({ name: "Gustav" });
		const anna = await createUser({ name: "Anna" });
		const bier = await createDrink({ price: 2.5 });
		const wasser = await createDrink({ price: 1 });

		await bestellen(gustav, bier, 8);
		await bestellen(anna, wasser, 8);
		await abrechnenMitPeriode(woche(0));
		await updateBillStatus((await neuesteRechnung(gustav.id)).id, "Gestundet");

		expect(await getKasseSummary()).toMatchObject({
			offeneMitglieder: 8,
			gestundetMitglieder: 20,
			gesamt: 28,
		});
		expect((await getOpenMemberBills()).map((b) => b.status)).toEqual([
			"Unbezahlt",
			"Gestundet",
		]);

		// P2: the Stundung spares Gustav the Mahnung once; his new bill is due.
		await bestellen(anna, wasser);
		await abrechnenMitPeriode(woche(1));
		expect(
			(await billsOf(gustav.id)).map((b) => [
				b.status,
				b.oldBillingAmount,
				b.fees,
				b.total,
			]),
		).toEqual([
			["Übertragen", 0, 0, 20],
			["Unbezahlt", 20, 0, 20],
		]);
		expect((await neuesteRechnung(anna.id)).total).toBe(9.8);
		// Übertragen bills are not counted again.
		expect(await getKasseSummary()).toMatchObject({
			offeneMitglieder: 29.8,
			gestundetMitglieder: 0,
			gesamt: 29.8,
		});

		// P3 (characterization): without a new Stundung the Mahnung applies.
		await bestellen(anna, wasser);
		await abrechnenMitPeriode(woche(2));
		expect(await neuesteRechnung(gustav.id)).toMatchObject({
			oldBillingAmount: 20,
			fees: 2,
			total: 22,
		});
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([gustav, anna]);
	});

	// Issue #55, case 2: one deferred bill among several open ones spares
	// the whole Übertrag from the Mahnung.
	test("eine gestundete unter mehreren offenen Rechnungen befreit den ganzen Übertrag von der Mahnung", async () => {
		await kasseEinrichten();
		const mitStundung = await createUser({ name: "MitStundung" });
		const ohneStundung = await createUser({ name: "OhneStundung" });
		const p1 = await createBillPeriodRow({ createdAt: daysAgo(28) });
		const p2 = await createBillPeriodRow({ createdAt: daysAgo(14) });
		for (const member of [mitStundung, ohneStundung]) {
			await createBillRow({
				periodId: p1.id,
				user: member,
				drinksTotal: 12,
				createdAt: daysAgo(28),
			});
			await createBillRow({
				periodId: p2.id,
				user: member,
				drinksTotal: 3,
				status: member === mitStundung ? "Gestundet" : "Unbezahlt",
				createdAt: daysAgo(14),
			});
		}
		const wasser = await createDrink({ price: 1 });
		await bestellen(mitStundung, wasser);
		await bestellen(ohneStundung, wasser);

		await abrechnenMitPeriode(woche(0));

		expect(await neuesteRechnung(mitStundung.id)).toMatchObject({
			oldBillingAmount: 15,
			fees: 0,
			total: 16,
		});
		expect(await neuesteRechnung(ohneStundung.id)).toMatchObject({
			oldBillingAmount: 15,
			fees: 1.5,
			total: 17.5,
		});
		for (const member of [mitStundung, ohneStundung]) {
			expect((await billsOf(member.id)).map((b) => b.status)).toEqual([
				"Übertragen",
				"Übertragen",
				"Unbezahlt",
			]);
		}
	});
});

describe("Bezahlen", () => {
	test("die neueste Rechnung bezahlen schließt nur die übertragenen Vorgänger desselben Mitglieds", async () => {
		await kasseEinrichten();
		const zahler = await createUser({ name: "Zahler" });
		const nachbar = await createUser({ name: "Nachbar" });
		const bier = await createDrink({ price: 2.5 });
		for (let week = 0; week < 3; week++) {
			await bestellen(zahler, bier, 4);
			await bestellen(nachbar, bier, 2);
			await abrechnenMitPeriode(woche(week));
		}
		// 10 → 10 + 10 + 1 = 21 → 10 + 21 + 2.10 = 33.10
		expect((await neuesteRechnung(zahler.id)).total).toBe(33.1);
		// 5 → 5 + 5 = 10 → 5 + 10 + 1 = 16
		expect((await neuesteRechnung(nachbar.id)).total).toBe(16);
		expect((await getKasseSummary()).offeneMitglieder).toBe(49.1);

		vi.setSystemTime(new Date(woche(2).getTime() + 86_400_000));
		await bezahlen(await neuesteRechnung(zahler.id));

		const chain = await billsOf(zahler.id);
		expect(chain.map((b) => b.status)).toEqual([
			"Bezahlt",
			"Bezahlt",
			"Bezahlt",
		]);
		expect(chain.every((b) => b.paidAt?.getTime() === Date.now())).toBe(true);
		expect((await billsOf(nachbar.id)).map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
		expect((await getKasseSummary()).offeneMitglieder).toBe(16);
		await expectKassenbuchStimmt([zahler, nachbar]);

		// The next run starts from a clean slate for the payer.
		await bestellen(zahler, bier);
		await abrechnenMitPeriode(woche(3));
		expect(await neuesteRechnung(zahler.id)).toMatchObject({
			oldBillingAmount: 0,
			fees: 0,
			total: 2.5,
		});
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([zahler, nachbar]);
	});

	// Undoing the payment of the newest bill reopens the bills it carried as
	// "Übertragen" without a payment date, as in the Fuchsenladen.
	test("Zahlung der neuesten Rechnung zurücknehmen öffnet die mitbezahlten Vorgänger wieder als Übertragen (#182)", async () => {
		await kasseEinrichten();
		const member = await createUser();
		const bier = await createDrink({ price: 2.5 });
		await bestellen(member, bier, 4);
		await abrechnenMitPeriode(woche(0));
		await bestellen(member, bier);
		await abrechnenMitPeriode(woche(1));
		const newest = await neuesteRechnung(member.id);
		await bezahlen(newest);

		await zahlungZuruecknehmen(newest);

		expect((await billsOf(member.id)).map((b) => [b.status, b.paidAt])).toEqual(
			[
				["Übertragen", null],
				["Unbezahlt", null],
			],
		);
		await expectKassenbuchStimmt([member]);
	});

	// A bill paid through the later bill it was carried into cannot be set
	// back to Unbezahlt/Gestundet on its own: the next run would carry its
	// amount again and charge the member twice, plus Mahnung.
	test("eine über die neuere Rechnung bezahlte Vorgängerin wieder öffnen berechnet die Schuld nicht doppelt (#183)", async () => {
		await kasseEinrichten();
		const member = await createUser();
		const bier = await createDrink({ price: 2.5 });
		await bestellen(member, bier, 4);
		await abrechnenMitPeriode(woche(0));
		await bestellen(member, bier);
		await abrechnenMitPeriode(woche(1));
		await bezahlen(await neuesteRechnung(member.id));
		const [p1] = await billsOf(member.id);

		expect(await updateBillStatus(p1?.id ?? "", "Gestundet")).toMatchObject({
			ok: false,
			code: "CARRIED_BILL",
		});
		await bestellen(member, bier);
		await abrechnenMitPeriode(woche(2));

		// Paid in full in P2, so only the new 2.50 € may be open.
		expect(await offenCents(member.id)).toBe(250);
	});
});

describe("Alle haben gezahlt, Kassenwart als Empfänger und Aufschlag (wie Hassia)", () => {
	test("Aufschlag auf eigene Bestellungen, Mails an den Kassenwart, Alle-bezahlt schließt alle Ketten", async () => {
		await kasseEinrichten({
			features: [
				"drinks.markup",
				"billing.markAllPaid",
				"billing.treasurerRecipient",
			],
		});
		expect(await setMarkupPercent(10)).toEqual({ ok: true });
		expect(
			await setBillRecipient("treasurer", " kassenwart@example.test "),
		).toEqual({ ok: true });
		const anna = await createUser({ name: "Anna", email: "anna@example.test" });
		const ben = await createUser({ name: "Ben", email: "ben@example.test" });
		const pils = await createDrink({ name: "Pils", price: 1.9 });

		// 1.90 € + 10 % = 2.09 €; group bookings at the purchase price.
		await bestellen(anna, pils, 3);
		await bestellen(ben, pils);
		await bestellen(ben, pils, 2, "CC");
		const p1 = await abrechnenMitPeriode(woche(0));

		expect(p1.totalAmount).toBe(12.16);
		expect(await neuesteRechnung(anna.id)).toMatchObject({
			drinksTotal: 6.27,
			total: 6.27,
		});
		expect((await billsOf("event-cc"))[0]?.total).toBe(3.8);
		// Every bill, group bill included, goes to the treasurer only.
		expect(mail.mock.calls.map(([m]) => [m.to, m.subject])).toEqual([
			["kassenwart@example.test", "Getränkerechnung KW-41-26: Anna"],
			["kassenwart@example.test", "Getränkerechnung KW-41-26: Ben"],
			["kassenwart@example.test", "Getränkerechnung KW-41-26: CC"],
		]);
		expect(mail.mock.calls[0]?.[0].text).toContain("Gesamtbetrag: 6,27€");

		await updateBillStatus((await neuesteRechnung(ben.id)).id, "Gestundet");
		mail.mockClear();

		await bestellen(anna, pils);
		await abrechnenMitPeriode(woche(1));

		// 2.09 + 6.27 + 0.63 (10 % of 6.27 = 0.627) = 8.99
		expect(await neuesteRechnung(anna.id)).toMatchObject({
			drinksTotal: 2.09,
			oldBillingAmount: 6.27,
			fees: 0.63,
			total: 8.99,
		});
		expect(await neuesteRechnung(ben.id)).toMatchObject({
			drinksTotal: 0,
			oldBillingAmount: 2.09,
			fees: 0,
			total: 2.09,
		});
		expect(mail.mock.calls.map(([m]) => m.to)).toEqual([
			"kassenwart@example.test",
			"kassenwart@example.test",
		]);
		expect(await getKasseSummary()).toMatchObject({
			offeneMitglieder: 11.08,
			gestundetMitglieder: 0,
			offeneGruppen: 3.8,
		});
		await expectGeldInvarianten();

		// "Alle haben gezahlt": every open member bill, not the group bill.
		for (const member of [anna, ben]) {
			const newest = await neuesteRechnung(member.id);
			kassenbuch.set(member.id, toCents(newest.total));
		}
		vi.setSystemTime(new Date(woche(1).getTime() + 3_600_000));
		expect(await markAllMemberBillsPaid()).toEqual({
			ok: true,
			data: { count: 2 },
		});

		for (const member of [anna, ben]) {
			expect((await billsOf(member.id)).map((b) => b.status)).toEqual([
				"Bezahlt",
				"Bezahlt",
			]);
		}
		expect((await billsOf("event-cc"))[0]?.status).toBe("Unbezahlt");
		expect(await getKasseSummary()).toMatchObject({
			offeneMitglieder: 0,
			gestundetMitglieder: 0,
			offeneGruppen: 3.8,
		});
		await expectKassenbuchStimmt([anna, ben]);

		// Nothing is carried after that.
		await bestellen(anna, pils);
		await abrechnenMitPeriode(woche(2));
		expect(await neuesteRechnung(anna.id)).toMatchObject({
			oldBillingAmount: 0,
			fees: 0,
			total: 2.09,
		});
		expect(await billsOf(ben.id)).toHaveLength(2);
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([anna, ben]);
	});
});

describe("Inventur + Rechnung: Umlage (#10)", () => {
	test("der Verlust geht nur an aktive Hausbewohner, Umlage-only-Rechnungen eingeschlossen, und wird danach normal übertragen", async () => {
		await kasseEinrichten();
		const hans = await createUser({ name: "Hans", roles: ["Hausbewohner"] });
		const hilde = await createUser({
			name: "Hilde",
			email: "hilde@example.test",
			roles: ["Hausbewohner"],
		});
		const horst = await createUser({ name: "Horst", roles: ["Hausbewohner"] });
		const heinz = await createUser({
			name: "Heinz",
			roles: ["Hausbewohner"],
			membership: "suspended",
		});
		const gast = await createUser({ name: "Gast" });
		const pils = await createDrink({ name: "Pils", price: 2.5 });
		await createInventory({
			createdAt: daysAgo(14),
			items: [{ drink: pils, countedStock: 40 }],
		});
		// Orders with a timestamp inside the running inventory (the order
		// action stamps the database clock, which fake timers don't move).
		await createOrderAt({
			drink: pils,
			user: hans,
			amount: 2,
			createdAt: daysAgo(3),
		});
		await createOrderAt({
			drink: pils,
			user: gast,
			amount: 3,
			createdAt: daysAgo(3),
		});

		// 40 − 5 sold = 35 expected, 31 counted → 4 × 2.50 € = 10 € loss.
		const result = await closeInventoryAndBill([
			{ drinkId: pils.id, countedStock: 31, purchasedSince: 0 },
		]);

		expect(result).toMatchObject({
			ok: true,
			data: { totalInventoryLoss: 10, billsCreated: 4 },
		});
		// 10 € / 3 active Hausbewohner = 3.33 € each; the cent is the Kasse's.
		const umlage = await Promise.all(
			[hans, hilde, horst, gast].map((m) => neuesteRechnung(m.id)),
		);
		expect(umlage.map((b) => [b.drinksTotal, b.umlage, b.total])).toEqual([
			[5, 3.33, 8.33],
			[0, 3.33, 3.33],
			[0, 3.33, 3.33],
			[7.5, 0, 7.5],
		]);
		expect(await billsOf(heinz.id)).toHaveLength(0);
		const period = await tenantDb().select().from(billPeriods);
		// Bills = orders (12.50 €) + Umlage (3 × 3.33 €).
		expect(period[0]?.totalAmount).toBe(22.49);
		expect(await pdfZeilen(umlage[1]?.id ?? "")).toEqual({
			rechnungsbetrag: 0,
			alteRechnung: 0,
			mahnung: 0,
			umlage: 3.33,
			gesamt: 3.33,
		});
		expect(
			mail.mock.calls.find(([m]) => m.to === "hilde@example.test")?.[0].text,
		).toContain("Gesamtbetrag: 3,33€");
		await expectGeldInvarianten();

		// P2: a plain run charges no Umlage; open Umlage is carried like any
		// debt, with the Mahnung only above 5 €.
		await bezahlen(umlage[2] as Bill);
		await bestellen(gast, pils);
		await abrechnenMitPeriode(woche(1));

		expect(
			(
				await Promise.all([hans, hilde, gast].map((m) => neuesteRechnung(m.id)))
			).map((b) => [
				b.drinksTotal,
				b.oldBillingAmount,
				b.fees,
				b.umlage,
				b.total,
			]),
		).toEqual([
			[0, 8.33, 0.83, 0, 9.16],
			[0, 3.33, 0, 0, 3.33],
			[2.5, 7.5, 0.75, 0, 10.75],
		]);
		expect(await billsOf(horst.id)).toHaveLength(1);
		await expectGeldInvarianten();
		await expectKassenbuchStimmt([hans, hilde, horst, gast]);
	});
});

describe("Eigenschaft: zufällige Folgen von Bestellungen, Läufen, Stundungen und Zahlungen", () => {
	/** Small deterministic PRNG (mulberry32), so failures are reproducible. */
	function prng(seed: number) {
		let a = seed;
		return () => {
			a = (a + 0x6d2b79f5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/** An independent model of what a member owes, in cents. */
	type Schuld = { pending: number; open: number; deferred: boolean };

	/** What a billing run does to the model (no orders at all: nothing). */
	function modellLauf(model: Map<string, Schuld>) {
		for (const s of model.values()) {
			if (s.pending > 0 || s.open > 0) {
				const fee = !s.deferred && s.open > 500 ? Math.round(s.open / 10) : 0;
				s.open += s.pending + fee;
				s.pending = 0;
				s.deferred = false;
			}
		}
	}

	test.each([
		1, 7, 55,
	])("Seed %i: offene Rechnungen = Bestellungen + Mahnungen − Zahlungen, höchstens eine offene je Mitglied", async (seed) => {
		await kasseEinrichten();
		const random = prng(seed);
		const pick = <T>(list: T[]) =>
			list[Math.floor(random() * list.length)] as T;
		const members = [
			await createUser({ name: "A" }),
			await createUser({ name: "B" }),
			await createUser({ name: "C" }),
		];
		const drinks = [
			await createDrink({ price: 0.7 }),
			await createDrink({ price: 1.15 }),
			await createDrink({ price: 2.35 }),
			await createDrink({ price: 5.01 }),
		];
		const model = new Map<string, Schuld>(
			members.map((m) => [m.id, { pending: 0, open: 0, deferred: false }]),
		);
		const seen = { runs: 0, emptyRuns: 0, payments: 0, deferrals: 0 };

		const bestellung = async (member: TestUser, state: Schuld) => {
			const drink = pick(drinks);
			const amount = 1 + Math.floor(random() * 4);
			await createOrderAt({ drink, user: member, amount });
			state.pending += toCents(drink.price) * amount;
		};
		const lauf = async () => {
			const anyOrders = [...model.values()].some((s) => s.pending > 0);
			const run = await createNewBilling();
			if (!run.ok) {
				throw new Error(run.error);
			}
			const result = run.data;
			if (!anyOrders) {
				seen.emptyRuns++;
				expect(result.billsCreated).toBe(0);
				return;
			}
			seen.runs++;
			modellLauf(model);
		};
		const zahlung = async (member: TestUser, state: Schuld) => {
			seen.payments++;
			await bezahlen(await neuesteRechnung(member.id));
			state.open = 0;
			state.deferred = false;
		};
		const stundung = async (member: TestUser, state: Schuld) => {
			seen.deferrals++;
			const newest = await neuesteRechnung(member.id);
			await updateBillStatus(newest.id, "Gestundet");
			state.deferred = true;
		};

		const start = Date.UTC(2026, 9, 5, 12);
		for (let step = 0; step < 40; step++) {
			vi.setSystemTime(new Date(start + step * 86_400_000));
			const member = pick(members);
			const state = model.get(member.id) as Schuld;
			const action = random();
			if (action < 0.4) {
				await bestellung(member, state);
			} else if (action < 0.7) {
				await lauf();
			} else if (state.open > 0) {
				await (action < 0.85 ? zahlung : stundung)(member, state);
			}

			for (const m of members) {
				expect({ step, member: m.name, open: await offenCents(m.id) }).toEqual({
					step,
					member: m.name,
					open: model.get(m.id)?.open,
				});
			}
			await expectGeldInvarianten();
			await expectKassenbuchStimmt(members);
		}
		// The sequence exercised every kind of step.
		expect(seen.runs).toBeGreaterThan(4);
		expect(seen.payments).toBeGreaterThan(0);
		expect(seen.deferrals).toBeGreaterThan(0);
	});
});

describe("Randfälle der Abrechnungsaktionen", () => {
	test("vor dem ersten Lauf gibt es keine Periode, und eine unbekannte Rechnung zu bezahlen ändert nichts", async () => {
		await kasseEinrichten();
		const member = await createUser();
		await bestellen(member, await createDrink());

		expect(await getAllBillPeriods()).toEqual([]);
		expect(await updateBillStatus("gibt-es-nicht", "Bezahlt")).toEqual({
			ok: false,
			error: "Rechnung nicht gefunden",
			code: "NOT_FOUND",
		});

		await abrechnenMitPeriode(woche(0));
		expect((await getAllBillPeriods())[0]?.billNumber).toBe("KW-41-26");
		expect((await neuesteRechnung(member.id)).status).toBe("Unbezahlt");
	});

	// An outage must not look like "no bills" (#33): the reads fail instead
	// of answering with an empty list.
	test("ist die Datenbank nicht erreichbar, schlagen die Lesefunktionen fehl und Statuswechsel melden den Fehler", async () => {
		await kasseEinrichten();
		await bestellen(await createUser(), await createDrink());
		const run = await abrechnenMitPeriode(woche(0));
		// The billing tables fail from here on. The caller is still signed in,
		// so the guards pass and the actions' own error handling is reached.
		await requireTenant().client.executeMultiple(
			"PRAGMA foreign_keys = OFF; DROP TABLE bill_csv; DROP TABLE bill_pdf; DROP TABLE bill_item; DROP TABLE bill; DROP TABLE bill_period; DROP TABLE `order`;",
		);

		await expect(getAllBillPeriods()).rejects.toThrow(/Failed query/);
		await expect(getBillsForPeriod(run.billPeriod.id)).rejects.toThrow(
			/no such table/,
		);
		expect(await updateBillStatus("egal", "Bezahlt")).toEqual({
			ok: false,
			error: "Fehler beim Aktualisieren des Status",
			code: "INTERNAL",
		});
	});
});

describe("Mails der Abrechnung", () => {
	test("das PDF nennt das Zahlungsziel der Kasse", async () => {
		await kasseEinrichten();
		await setGetraenkeBillingProfile({ paymentDueDays: 30 });
		await bestellen(await createUser(), await createDrink());
		await abrechnenMitPeriode(woche(0));

		const pdf = mail.mock.calls[0]?.[0].attachments?.[0]?.content as Buffer;
		expect(pdfText(pdf).join(" ")).toContain("innerhalb von 30");
	});

	// The bill mail names the Zahlungsziel the Kasse set, like the PDF
	// attached to it.
	test("die Mail nennt dasselbe Zahlungsziel wie das PDF (#184)", async () => {
		await kasseEinrichten();
		await setGetraenkeBillingProfile({ paymentDueDays: 30 });
		await bestellen(await createUser(), await createDrink());
		await abrechnenMitPeriode(woche(0));

		const sent = mail.mock.calls[0]?.[0];
		expect(sent?.text).toContain(
			"Bitte überweise den Betrag innerhalb von 30 Tagen.",
		);
		expect(sent?.html).toContain("innerhalb von <strong>30 Tagen</strong>");
		expect(sent?.text).not.toContain("14 Tagen");
	});
});
