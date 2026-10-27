// The Fuchsenladen billing lifecycle across periods (#55): orders through
// the order action, billing runs, carry-over with "Übertragen", Gestundet,
// paying and un-paying the newest bill. Per member, the open bills always
// equal what was charged minus what was paid ("Kassenbuch").

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { toCents } from "~/lib/money";
import { fuchsenBills, fuchsenOrders } from "~/server/db/schema";
import { createFuchsenItem } from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	createNewFuchsenBilling,
	getFuchsenBillPeriodCSV,
	getFuchsenBillsForPeriod,
	getMyFuchsenBills,
	updateFuchsenBillStatus,
} from "./billings";
import { createFuchsenOrder, getMyFuchsenSummary } from "./orders";

setupTestDatabases();

/** Wednesday noon of ISO week 44 + 2n, 2026. */
function periode(n: number): Date {
	return new Date(Date.UTC(2026, 9, 28 + 14 * n, 12));
}

type Bill = typeof fuchsenBills.$inferSelect;
type Item = Awaited<ReturnType<typeof createFuchsenItem>>;

let fuchsenwart: TestUser;
/** Payments made in the test, in cents per member. */
let kassenbuch: Map<string, number>;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(periode(0));
	vi.spyOn(console, "error").mockImplementation(() => {});
	kassenbuch = new Map();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function ladenEinrichten() {
	await createTenant();
	fuchsenwart = await createUser({ name: "Fuchsenwart", roles: ["Fuchs"] });
	signInAs(fuchsenwart);
}

/** The member orders in the Fuchsenladen through the order action. */
async function bestellen(member: TestUser, item: Item, amount = 1) {
	signInAs(member);
	const result = await createFuchsenOrder({
		itemId: item.id,
		itemName: item.name,
		amount,
		pricePerUnit: item.price,
		total: item.price * amount,
	});
	signInAs(fuchsenwart);
	expect(result.success).toBe(true);
}

async function abrechnen(date: Date) {
	vi.setSystemTime(date);
	const result = await createNewFuchsenBilling();
	if (!("billPeriod" in result) || !result.billPeriod) {
		throw new Error(`Billing created no period: ${result.message}`);
	}
	return result as typeof result & { billPeriod: { id: string } };
}

async function rechnungenVon(member: TestUser) {
	return tenantDb()
		.select()
		.from(fuchsenBills)
		.where(eq(fuchsenBills.userId, member.id))
		.orderBy(fuchsenBills.createdAt);
}

async function neuesteRechnung(member: TestUser): Promise<Bill> {
	const bill = (await rechnungenVon(member)).at(-1);
	if (!bill) {
		throw new Error(`No bill for ${member.name}`);
	}
	return bill;
}

async function setStatus(bill: Bill, status: "Bezahlt" | "Unbezahlt") {
	expect(await updateFuchsenBillStatus(bill.id, status)).toEqual({
		success: true,
	});
	const sign = status === "Bezahlt" ? 1 : -1;
	kassenbuch.set(
		bill.userId,
		(kassenbuch.get(bill.userId) ?? 0) + sign * toCents(bill.total),
	);
}

const isOpen = (b: Bill) =>
	b.status === "Unbezahlt" || b.status === "Gestundet";
const sumCents = (amounts: number[]) =>
	amounts.reduce((s, a) => s + toCents(a), 0);

async function offenCents(member: TestUser) {
	return sumCents(
		(await rechnungenVon(member)).filter(isOpen).map((b) => b.total),
	);
}

/**
 * Per member: open bills = items ever billed − payments; and the open bills
 * equal the member's open billed orders (bill and order status in sync).
 */
async function expectKassenbuchStimmt(members: TestUser[]) {
	for (const member of members) {
		const bills = await rechnungenVon(member);
		const charged = sumCents(bills.map((b) => b.itemsTotal));
		const open = await offenCents(member);
		expect({ member: member.name, open }).toEqual({
			member: member.name,
			open: charged - (kassenbuch.get(member.id) ?? 0),
		});
		const openOrders = await tenantDb()
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, member.id));
		expect(
			sumCents(
				openOrders
					.filter((o) => o.status === "Offen" && o.billId !== null)
					.map((o) => o.total),
			),
		).toBe(open);
		expect(bills.filter(isOpen).length).toBeLessThanOrEqual(1);
	}
}

describe("Fuchsenladen über drei Perioden", () => {
	test("Übertrag mit Status Übertragen, Gestundet, Bezahlen und Zurücknehmen der neuesten Rechnung", async () => {
		await ladenEinrichten();
		const fux = await createUser({ name: "Fux" });
		const bursch = await createUser({ name: "Bursch" });
		const fuechsin = await createUser({ name: "Füchsin" });
		const mappe = await createFuchsenItem({ name: "Mappe", price: 2.5 });
		const band = await createFuchsenItem({ name: "Band", price: 3 });
		const members = [fux, bursch, fuechsin];

		// P1: Fux 10 €, Bursch 6 € (gestundet), Füchsin 2.50 € (pays at once).
		await bestellen(fux, mappe, 4);
		await bestellen(bursch, band, 2);
		await bestellen(fuechsin, mappe);
		const p1 = await abrechnen(periode(0));
		expect(p1).toMatchObject({ billsCreated: 3, totalAmount: 18.5 });
		await setStatus(await neuesteRechnung(fuechsin), "Bezahlt");
		await updateFuchsenBillStatus(
			(await neuesteRechnung(bursch)).id,
			"Gestundet",
		);
		await expectKassenbuchStimmt(members);

		// P2: Fux orders nothing (carry-only bill), Bursch orders again.
		await bestellen(bursch, band);
		const p2 = await abrechnen(periode(1));
		expect(p2).toMatchObject({ billsCreated: 2, totalAmount: 19 });
		expect(
			(await getFuchsenBillsForPeriod(p2.billPeriod.id)).map((b) => [
				b.name,
				b.status,
				b.itemsTotal,
				b.oldBillingAmount,
				b.totalDue,
				b.items.length,
			]),
		).toEqual([
			["Bursch", "Unbezahlt", 3, 6, 9, 1],
			["Fux", "Unbezahlt", 0, 10, 10, 0],
		]);
		await expectKassenbuchStimmt(members);

		// P3: the debt moves on once more.
		await bestellen(fux, mappe);
		await bestellen(fuechsin, mappe, 2);
		const p3 = await abrechnen(periode(2));
		expect(p3).toMatchObject({ billsCreated: 3, totalAmount: 26.5 });
		expect(
			(await rechnungenVon(fux)).map((b) => [
				b.status,
				b.itemsTotal,
				b.oldBillingAmount,
				b.total,
			]),
		).toEqual([
			["Übertragen", 10, 0, 10],
			["Übertragen", 0, 10, 10],
			["Unbezahlt", 2.5, 10, 12.5],
		]);
		expect((await rechnungenVon(bursch)).map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
		expect((await rechnungenVon(fuechsin)).map((b) => b.status)).toEqual([
			"Bezahlt",
			"Unbezahlt",
		]);
		// Carried amounts are counted once: in the newest bills only.
		const csv = await getFuchsenBillPeriodCSV(p3.billPeriod.id);
		expect(csv.csvContent?.slice(1).split("\r\n")).toEqual([
			"Name;Status;Artikel;Alter Saldo;Gesamt",
			"Bursch;Unbezahlt;0,00;9,00;9,00",
			"Fux;Unbezahlt;2,50;10,00;12,50",
			"Füchsin;Unbezahlt;5,00;0,00;5,00",
			"Gesamt;;;;26,50",
		]);
		await expectKassenbuchStimmt(members);

		// A carried bill can't be paid on its own.
		const [fuxP1] = await rechnungenVon(fux);
		expect(
			(await updateFuchsenBillStatus(fuxP1?.id ?? "", "Bezahlt")).success,
		).toBe(false);

		// Paying the newest bill settles the whole chain and its orders.
		vi.setSystemTime(new Date(periode(2).getTime() + 86_400_000));
		const newest = await neuesteRechnung(fux);
		await setStatus(newest, "Bezahlt");
		expect((await rechnungenVon(fux)).map((b) => b.status)).toEqual([
			"Bezahlt",
			"Bezahlt",
			"Bezahlt",
		]);
		signInAs(fux);
		expect(await getMyFuchsenSummary()).toEqual({
			openTotal: 0,
			paidTotal: 12.5,
			openCount: 0,
		});
		expect(
			(await getMyFuchsenBills()).map(({ bill }) => [
				bill.status,
				bill.totalDue,
			]),
		).toEqual([
			["Bezahlt", 12.5],
			["Bezahlt", 10],
			["Bezahlt", 10],
		]);
		signInAs(fuchsenwart);
		await expectKassenbuchStimmt(members);

		// Un-paying it reopens exactly what it settled.
		await setStatus(newest, "Unbezahlt");
		expect((await rechnungenVon(fux)).map((b) => [b.status, b.paidAt])).toEqual(
			[
				["Übertragen", null],
				["Übertragen", null],
				["Unbezahlt", null],
			],
		);
		await expectKassenbuchStimmt(members);

		// P4: the reopened debt is carried once; Bursch's is still carried.
		await bestellen(fux, band);
		const p4 = await abrechnen(periode(3));
		expect(p4).toMatchObject({ billsCreated: 3, totalAmount: 29.5 });
		expect(await neuesteRechnung(fux)).toMatchObject({
			itemsTotal: 3,
			oldBillingAmount: 12.5,
			total: 15.5,
		});
		await expectKassenbuchStimmt(members);

		// Paying it again leaves nothing to carry.
		vi.setSystemTime(new Date(periode(3).getTime() + 86_400_000));
		await setStatus(await neuesteRechnung(fux), "Bezahlt");
		await bestellen(fux, mappe);
		await abrechnen(periode(4));
		expect(await neuesteRechnung(fux)).toMatchObject({
			oldBillingAmount: 0,
			total: 2.5,
		});
		await expectKassenbuchStimmt(members);
	});

	// A bill paid through the later bill it was carried into cannot be set
	// back to Unbezahlt on its own: the next run would carry its amount again
	// and charge the member twice.
	test("eine über die neuere Rechnung bezahlte Vorgängerin wieder öffnen berechnet die Schuld nicht doppelt (#183)", async () => {
		await ladenEinrichten();
		const fux = await createUser({ name: "Fux" });
		const mappe = await createFuchsenItem({ price: 2.5 });
		await bestellen(fux, mappe, 4);
		await abrechnen(periode(0));
		await bestellen(fux, mappe);
		await abrechnen(periode(1));
		vi.setSystemTime(new Date(periode(1).getTime() + 86_400_000));
		await setStatus(await neuesteRechnung(fux), "Bezahlt");
		const [p1] = await rechnungenVon(fux);

		expect(
			await updateFuchsenBillStatus(p1?.id ?? "", "Unbezahlt"),
		).toMatchObject({ success: false });
		await bestellen(fux, mappe);
		await abrechnen(periode(2));

		// Paid in full in P2, so only the new 2.50 € may be open.
		expect(await offenCents(fux)).toBe(250);
	});
});
