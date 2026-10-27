// Characterisation of both billing runs (#58): a rich fixture is billed
// twice by the Getränke run and twice by the Fuchsenladen run, and every
// bill, bill item, period and order row they leave behind is snapshotted.
// Ids are replaced by readable labels; timestamps come from a fake clock
// and are shown as labels too. Bills (and a bill's items) are listed by
// label: the order a run writes them in follows the random user ids, but
// the items within one bill keep their stored order. The snapshot pins
// today's behaviour, quirks included: a change to it is a change in what
// members are charged.
//
// Covered: several members, consolidated and split drink lines, markup
// prices, group bookings (bookingFor), deferred (Gestundet) and carried
// (Übertragen) bills, debt spread over several periods, legacy sub-cent
// totals, a credit (negative open bill), a zero open bill, the late-fee
// threshold at 5.00 € / 5.01 €, the Umlage (with a suspended Hausbewohner
// and a remainder) and members with nothing to bill.

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { applyMarkup } from "~/lib/pricing";
import { createNewBilling } from "~/server/actions/billings/billings";
import { createNewFuchsenBilling } from "~/server/actions/fuchsenladen/billings";
import {
	billItems,
	billPeriods,
	bills,
	fuchsenBillItems,
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
	orders,
} from "~/server/db/schema";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	createBillPeriodRow,
	createBillRow,
	setUpGetraenkeBilling,
} from "../../../test/factories/billing";
import {
	createFuchsenBillPeriod,
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../test/factories/fuchsenladen";
import { createOrderRow } from "../../../test/factories/inventory";
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

/** The instants of the fake clock, by label. */
const CLOCK = {
	"fixture 1": new Date("2026-09-02T10:00:00Z"),
	"fixture 2": new Date("2026-09-16T10:00:00Z"),
	orders: new Date("2026-10-01T10:00:00Z"),
	"run 1": new Date("2026-10-07T12:00:00Z"),
	"between runs": new Date("2026-10-10T10:00:00Z"),
	"run 2": new Date("2026-10-14T12:00:00Z"),
} as const;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(CLOCK["fixture 1"]);
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Replaces ids and timestamps by stable labels. */
class Labels {
	private readonly byId = new Map<string, string>();
	private readonly used = new Set<string>();

	add(id: string, label: string) {
		let unique = label;
		for (let n = 2; this.used.has(unique); n++) {
			unique = `${label} #${n}`;
		}
		this.used.add(unique);
		this.byId.set(id, unique);
		return unique;
	}

	of(id: string | null) {
		if (id === null) {
			return null;
		}
		// Group bills use a readable pseudo-user id already.
		return this.byId.get(id) ?? (id.startsWith("event-") ? id : `?${id}`);
	}

	static when(date: Date | null) {
		if (date === null) {
			return null;
		}
		const entry = Object.entries(CLOCK).find(
			([, at]) => Math.floor(at.getTime() / 1000) === date.getTime() / 1000,
		);
		return entry ? entry[0] : date.toISOString();
	}
}

/** `rows` sorted by `key` (stable: equal keys keep their order). */
function byLabel<T>(rows: T[], key: (row: T) => string | null) {
	return [...rows].sort((a, b) =>
		(key(a) ?? "").localeCompare(key(b) ?? "", "en"),
	);
}

async function members(names: string[], roles: Record<string, string[]> = {}) {
	const labels = new Labels();
	const users: Record<string, TestUser> = {};
	for (const name of names) {
		const user = await createUser({
			name,
			roles: roles[name] ?? [],
			membership: name === "Hans" ? "suspended" : "active",
		});
		users[name] = user;
		labels.add(user.id, name);
	}
	return { users, labels };
}

// --- Getränke --------------------------------------------------------------

async function getraenkeSnapshot(labels: Labels) {
	const db = tenantDb();
	const periods = await db
		.select()
		.from(billPeriods)
		.orderBy(sql`${billPeriods}.rowid`);
	for (const p of periods) {
		labels.add(p.id, p.billNumber);
	}
	const billRows = await db.select().from(bills).orderBy(sql`${bills}.rowid`);
	const periodOf = new Map(periods.map((p) => [p.id, p.billNumber]));
	for (const b of billRows) {
		labels.add(b.id, `${periodOf.get(b.billPeriodId)} ${b.userName}`);
	}
	const itemRows = await db
		.select()
		.from(billItems)
		.orderBy(sql`${billItems}.rowid`);
	const orderRows = await db
		.select()
		.from(orders)
		.orderBy(sql`${orders}.rowid`);
	return {
		periods: periods.map((p) => ({
			billNumber: p.billNumber,
			totalAmount: p.totalAmount,
			createdBy: labels.of(p.createdBy),
			createdAt: Labels.when(p.createdAt),
			updatedAt: Labels.when(p.updatedAt),
			closedAt: Labels.when(p.closedAt),
		})),
		bills: byLabel(billRows, (b) => labels.of(b.id)).map((b) => ({
			bill: labels.of(b.id),
			userId: labels.of(b.userId),
			userName: b.userName,
			status: b.status,
			drinksTotal: b.drinksTotal,
			oldBillingAmount: b.oldBillingAmount,
			fees: b.fees,
			umlage: b.umlage,
			total: b.total,
			createdAt: Labels.when(b.createdAt),
			updatedAt: Labels.when(b.updatedAt),
			paidAt: Labels.when(b.paidAt),
		})),
		items: byLabel(itemRows, (i) => labels.of(i.billId)).map((i) => ({
			bill: labels.of(i.billId),
			drinkName: i.drinkName,
			amount: i.amount,
			pricePerDrink: i.pricePerDrink,
			totalPricePerDrink: i.totalPricePerDrink,
			createdAt: Labels.when(i.createdAt),
		})),
		orders: orderRows.map((o) => ({
			order: `${o.userName} ${o.amount}x ${o.drinkName}${o.bookingFor ? ` für ${o.bookingFor}` : ""}`,
			total: o.total,
			inBill: o.inBill,
			updatedAt: Labels.when(o.updatedAt),
		})),
	};
}

test("Getränke: two runs over the fixture write exactly these rows", async () => {
	await createTenant();
	await setUpGetraenkeBilling();
	const { users, labels } = await members(
		[
			"Wart",
			"Anna",
			"Bernd",
			"Clara",
			"Dora",
			"Emil",
			"Fritz",
			"Greta",
			"Hans",
			"Ida",
			"Jonas",
			"Karl",
			"Lena",
			"Max",
			"Nora",
		],
		{
			Wart: ["Getränkewart"],
			Fritz: ["Hausbewohner"],
			Greta: ["Hausbewohner"],
			Hans: ["Hausbewohner"],
			Nora: ["Hausbewohner"],
		},
	);
	const u = (name: string) => users[name] as TestUser;
	signInAs(u("Wart"));

	// Two earlier periods with open, deferred, paid and odd bills.
	const p1 = await createBillPeriodRow({
		billNumber: "KW-36-26",
		closedAt: CLOCK["fixture 2"],
	});
	await createBillRow({ periodId: p1.id, user: u("Emil"), drinksTotal: 3 });
	await createBillRow({
		periodId: p1.id,
		user: u("Karl"),
		drinksTotal: 3.333,
	});
	await createBillRow({
		periodId: p1.id,
		user: u("Jonas"),
		drinksTotal: 9.99,
		status: "Bezahlt",
		paidAt: CLOCK["fixture 2"],
	});
	await createBillRow({
		periodId: p1.id,
		user: { id: "event-sommerfest", name: "Sommerfest" },
		drinksTotal: 30,
	});

	vi.setSystemTime(CLOCK["fixture 2"]);
	const p2 = await createBillPeriodRow({ billNumber: "KW-38-26" });
	// Exactly at the threshold: no fee.
	await createBillRow({ periodId: p2.id, user: u("Anna"), drinksTotal: 5 });
	// One cent above: 10 % fee.
	await createBillRow({ periodId: p2.id, user: u("Bernd"), drinksTotal: 5.01 });
	// No new orders: a carry-only bill with fee.
	await createBillRow({
		periodId: p2.id,
		user: u("Clara"),
		drinksTotal: 12.34,
	});
	// Deferred: no fee.
	await createBillRow({
		periodId: p2.id,
		user: u("Dora"),
		drinksTotal: 20,
		status: "Gestundet",
	});
	// Debt in two periods, one of them deferred: no fee on either.
	await createBillRow({
		periodId: p2.id,
		user: u("Emil"),
		drinksTotal: 4,
		status: "Gestundet",
	});
	await createBillRow({ periodId: p2.id, user: u("Greta"), drinksTotal: 6 });
	// Legacy sub-cent totals: 3.333 + 2.222 → 5.55 €, fee 0.555 → 0.56 €.
	await createBillRow({
		periodId: p2.id,
		user: u("Karl"),
		drinksTotal: 2.222,
	});
	// A credit and a zero bill left open.
	await createBillRow({ periodId: p2.id, user: u("Lena"), total: -2.5 });
	await createBillRow({ periodId: p2.id, user: u("Max"), total: 0 });

	// New orders: repeated drinks, an old price, markup prices, groups.
	vi.setSystemTime(CLOCK.orders);
	const pils = await createDrink({ name: "Pils", price: 1.5 });
	const mate = await createDrink({ name: "Mate", price: 1.9 });
	const wasser = await createDrink({ name: "Wasser", price: 0.7 });
	const mateMarkup = applyMarkup(1.9, 15);
	const order = (
		name: string,
		drink: { id: string; name: string; price: number },
		amount: number,
		extra: Partial<Parameters<typeof createOrderRow>[0]> = {},
	) => createOrderRow({ user: u(name), drink, amount, ...extra });

	await order("Anna", pils, 2);
	await order("Anna", pils, 1);
	await order("Anna", pils, 1, { pricePerUnit: 1.4 });
	await order("Anna", mate, 1, {
		pricePerUnit: mateMarkup,
		costPerUnit: 1.9,
	});
	await order("Bernd", mate, 3, {
		pricePerUnit: mateMarkup,
		costPerUnit: 1.9,
	});
	await order("Dora", wasser, 3);
	// A legacy sub-cent order total.
	await order("Dora", wasser, 1, { total: 0.705 });
	await order("Greta", pils, 4);
	await order("Jonas", mate, 2);
	await order("Lena", pils, 1);
	await order("Nora", wasser, 2);
	// Group bookings, at the purchase price; two members book for the same.
	await order("Anna", pils, 10, { bookingFor: "Stiftungsfest" });
	await order("Bernd", pils, 5, { bookingFor: "Stiftungsfest" });
	await order("Bernd", mate, 2, { bookingFor: "Stiftungsfest" });
	await order("Wart", wasser, 6, { bookingFor: "AH Abend" });
	// Already billed: not picked up again.
	await order("Ida", pils, 7, { inBill: true });

	// Run 1: "Inventur + Rechnung" with a loss of 10 €: 3.33 € each for the
	// three active Hausbewohner (Hans is suspended), 1 ct not charged.
	vi.setSystemTime(CLOCK["run 1"]);
	const run1 = await runGetraenkeBilling({ inventoryLoss: 10 });
	expect(run1.success).toBe(true);
	const mails1 = mail.mock.calls.length;

	// Between the runs: Anna pays, Bernd is deferred, more orders.
	vi.setSystemTime(CLOCK["between runs"]);
	const newest = async (userId: string) =>
		(
			await tenantDb()
				.select()
				.from(bills)
				.where(eq(bills.userId, userId))
				.orderBy(sql`${bills}.rowid`)
		).at(-1);
	const anna = await newest(u("Anna").id);
	const bernd = await newest(u("Bernd").id);
	await tenantDb()
		.update(bills)
		.set({ status: "Bezahlt", paidAt: CLOCK["between runs"] })
		.where(eq(bills.id, anna?.id ?? ""));
	await tenantDb()
		.update(bills)
		.set({ status: "Gestundet" })
		.where(eq(bills.id, bernd?.id ?? ""));
	await order("Anna", pils, 1);
	await order("Clara", mate, 1, {
		pricePerUnit: mateMarkup,
		costPerUnit: 1.9,
	});
	await order("Ida", wasser, 1);
	await order("Wart", pils, 3, { bookingFor: "AH Abend" });
	// The credit and the zero bill meet new orders.
	await order("Lena", pils, 1);
	await order("Max", wasser, 1);

	// Run 2: "Neue Rechnung" in the Kasse, no Umlage.
	vi.setSystemTime(CLOCK["run 2"]);
	const run2 = await createNewBilling();
	expect(run2.ok).toBe(true);

	const summary = (run: Awaited<ReturnType<typeof runGetraenkeBilling>>) =>
		"billPeriod" in run
			? {
					message: run.message,
					billNumber: run.billPeriod.billNumber,
					billsCreated: run.billsCreated,
					eventBillsCreated: run.eventBillsCreated,
					totalAmount: run.totalAmount,
					userSummaries: byLabel(run.userSummaries, (s) =>
						labels.of(s.userId),
					).map((s) => ({
						user: labels.of(s.userId),
						orders: s.orders.length,
						drinksTotal: s.drinksTotal,
						oldBillingAmount: s.oldBillingAmount,
						fees: s.fees,
						umlage: s.umlage,
						finalTotal: s.finalTotal,
					})),
				}
			: run;

	expect({
		run1: summary(run1),
		mails1,
		run2: run2.ok ? summary(run2.data) : run2,
		mails2: mail.mock.calls.length - mails1,
		...(await getraenkeSnapshot(labels)),
	}).toMatchSnapshot();
});

// --- Fuchsenladen ----------------------------------------------------------

async function fuchsenSnapshot(labels: Labels) {
	const db = tenantDb();
	const periods = await db
		.select()
		.from(fuchsenBillPeriods)
		.orderBy(sql`${fuchsenBillPeriods}.rowid`);
	for (const p of periods) {
		labels.add(p.id, p.billNumber);
	}
	const periodOf = new Map(periods.map((p) => [p.id, p.billNumber]));
	const billRows = await db
		.select()
		.from(fuchsenBills)
		.orderBy(sql`${fuchsenBills}.rowid`);
	for (const b of billRows) {
		labels.add(b.id, `${periodOf.get(b.billPeriodId)} ${b.userName}`);
	}
	const itemRows = await db
		.select()
		.from(fuchsenBillItems)
		.orderBy(sql`${fuchsenBillItems}.rowid`);
	const orderRows = await db
		.select()
		.from(fuchsenOrders)
		.orderBy(sql`${fuchsenOrders}.rowid`);
	return {
		periods: periods.map((p) => ({
			billNumber: p.billNumber,
			totalAmount: p.totalAmount,
			createdBy: labels.of(p.createdBy),
			createdAt: Labels.when(p.createdAt),
			updatedAt: Labels.when(p.updatedAt),
			closedAt: Labels.when(p.closedAt),
		})),
		bills: byLabel(billRows, (b) => labels.of(b.id)).map((b) => ({
			bill: labels.of(b.id),
			userId: labels.of(b.userId),
			userName: b.userName,
			status: b.status,
			itemsTotal: b.itemsTotal,
			oldBillingAmount: b.oldBillingAmount,
			total: b.total,
			createdAt: Labels.when(b.createdAt),
			updatedAt: Labels.when(b.updatedAt),
			paidAt: Labels.when(b.paidAt),
		})),
		items: byLabel(itemRows, (i) => labels.of(i.billId)).map((i) => ({
			bill: labels.of(i.billId),
			itemName: i.itemName,
			amount: i.amount,
			pricePerItem: i.pricePerItem,
			totalPrice: i.totalPrice,
			createdAt: Labels.when(i.createdAt),
		})),
		orders: orderRows.map((o) => ({
			order: `${o.userName} ${o.amount}x ${o.itemName}`,
			total: o.total,
			status: o.status,
			bill: labels.of(o.billId),
			updatedAt: Labels.when(o.updatedAt),
		})),
	};
}

test("Fuchsenladen: two runs over the fixture write exactly these rows", async () => {
	await createTenant();
	const { users, labels } = await members(
		[
			"Fuchsenwart",
			"Anna",
			"Bernd",
			"Clara",
			"Dora",
			"Emil",
			"Ida",
			"Jonas",
			"Karl",
			"Lena",
			"Max",
		],
		{ Fuchsenwart: ["Fuchs"] },
	);
	const u = (name: string) => users[name] as TestUser;
	signInAs(u("Fuchsenwart"));

	await createFuchsenBillPeriod({
		billNumber: "KW-36-26",
		createdAt: CLOCK["fixture 1"],
		closedAt: CLOCK["fixture 2"],
		bills: [
			{ user: u("Emil"), itemsTotal: 3 },
			{ user: u("Karl"), itemsTotal: 3.333 },
			{ user: u("Jonas"), itemsTotal: 9.99, status: "Bezahlt" },
		],
	});
	vi.setSystemTime(CLOCK["fixture 2"]);
	await createFuchsenBillPeriod({
		billNumber: "KW-38-26",
		createdAt: CLOCK["fixture 2"],
		bills: [
			{ user: u("Anna"), itemsTotal: 5 },
			{ user: u("Bernd"), itemsTotal: 5.01 },
			{ user: u("Clara"), itemsTotal: 12.34 },
			{ user: u("Dora"), itemsTotal: 20, status: "Gestundet" },
			{ user: u("Emil"), itemsTotal: 4, status: "Gestundet" },
			{ user: u("Karl"), itemsTotal: 2.222 },
			{ user: u("Lena"), itemsTotal: -2.5 },
			{ user: u("Max"), itemsTotal: 0 },
		],
	});

	vi.setSystemTime(CLOCK.orders);
	const mars = await createFuchsenItem({ name: "Mars", price: 1.2 });
	const mate = await createFuchsenItem({ name: "Mate", price: 1.9 });
	const order = (
		name: string,
		item: { id: string; name: string; price: number },
		amount: number,
		extra: Partial<Parameters<typeof createFuchsenOrder>[0]> = {},
	) =>
		createFuchsenOrder({
			user: u(name),
			item,
			amount,
			createdAt: CLOCK.orders,
			...extra,
		});

	await order("Anna", mars, 2);
	await order("Anna", mars, 1);
	await order("Anna", { ...mars, price: 1.1 }, 1);
	await order("Bernd", mate, 3);
	await order("Dora", mars, 1);
	await order("Jonas", mate, 2);
	await order("Lena", mars, 1);
	// Paid in the per-member view before the run: never billed (#143).
	await order("Ida", mate, 1, { status: "Bezahlt" });

	vi.setSystemTime(CLOCK["run 1"]);
	const run1 = await createNewFuchsenBilling();
	expect(run1.ok).toBe(true);

	vi.setSystemTime(CLOCK["between runs"]);
	const newest = async (userId: string) =>
		(
			await tenantDb()
				.select()
				.from(fuchsenBills)
				.where(eq(fuchsenBills.userId, userId))
				.orderBy(sql`${fuchsenBills}.rowid`)
		).at(-1);
	const anna = await newest(u("Anna").id);
	const bernd = await newest(u("Bernd").id);
	await tenantDb()
		.update(fuchsenBills)
		.set({ status: "Bezahlt", paidAt: CLOCK["between runs"] })
		.where(eq(fuchsenBills.id, anna?.id ?? ""));
	await tenantDb()
		.update(fuchsenBills)
		.set({ status: "Gestundet" })
		.where(eq(fuchsenBills.id, bernd?.id ?? ""));
	await order("Anna", mars, 1, { createdAt: CLOCK["between runs"] });
	await order("Clara", mate, 1, { createdAt: CLOCK["between runs"] });
	await order("Ida", mars, 1, { createdAt: CLOCK["between runs"] });
	await order("Lena", mars, 1, { createdAt: CLOCK["between runs"] });
	await order("Max", mars, 1, { createdAt: CLOCK["between runs"] });

	vi.setSystemTime(CLOCK["run 2"]);
	const run2 = await createNewFuchsenBilling();
	expect(run2.ok).toBe(true);

	const rows = await fuchsenSnapshot(labels);
	const summary = (run: typeof run1) =>
		run.ok && run.data.billPeriod
			? {
					...run.data,
					billPeriod: {
						id: labels.of(run.data.billPeriod.id),
						billNumber: run.data.billPeriod.billNumber,
					},
				}
			: run;
	expect({
		run1: summary(run1),
		run2: summary(run2),
		...rows,
	}).toMatchSnapshot();
});
