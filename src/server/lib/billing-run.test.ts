// Query budget of the Getränke billing run (#23): reads, writes and mails
// take a constant number of database round trips, however many members are
// billed. The write is one atomic batch instead of an interactive
// transaction with a statement per bill, item and carry-over.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { generateUserBillPDF } from "~/server/actions/billings/createUserPDF";
import { billPeriods, bills, orders } from "~/server/db/schema";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	pdfText,
	setUpGetraenkeBilling,
	setUserPreference,
} from "../../../test/factories/billing";
import {
	beforeNextWriteBatch,
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../test/harness";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

const mail = vi.mocked(sendTenantMail);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

let member = 0;

/**
 * `n` members with everything a run touches: two drinks each, a group
 * booking, an open bill from an earlier period (every third one deferred),
 * Hausbewohner for the Umlage and a mail opt-out now and then.
 */
async function addMembers(
	n: number,
	optsOut = (member: number) => member % 5 === 0,
) {
	const period = await createBillPeriodRow();
	const pils = await createDrink({ name: "Pils", price: 1.5 });
	const mate = await createDrink({ name: "Mate", price: 2 });
	for (let i = 0; i < n; i++) {
		member++;
		const user = await createUser({
			name: `Mitglied ${member}`,
			roles: member % 2 === 0 ? ["Hausbewohner"] : [],
		});
		if (optsOut(member)) {
			await setUserPreference(user.id, "notifications.emailEnabled", "false");
		}
		await createOrderRow({ user, drink: pils, amount: 2 });
		await createOrderRow({ user, drink: mate });
		await createOrderRow({ user, drink: pils, bookingFor: `Gruppe ${member}` });
		await createBillRow({
			periodId: period.id,
			user,
			drinksTotal: 10,
			status: member % 3 === 0 ? "Gestundet" : "Unbezahlt",
		});
	}
}

/** "Inventur + Rechnung" with a loss, so the Umlage lookup runs too. */
const run = () => runGetraenkeBilling({ inventoryLoss: 12.34 });

async function budget() {
	// Warm the tenant, feature and config caches with a first run.
	await addMembers(1);
	expect(await run()).toMatchObject({ success: true });

	await addMembers(2);
	mail.mockClear();
	const small = await countQueries(run);
	const smallMails = mail.mock.calls.length;

	await addMembers(20);
	mail.mockClear();
	const large = await countQueries(run);
	const largeMails = mail.mock.calls.length;

	return { small, smallMails, large, largeMails };
}

describe("billing run query budget (#23)", () => {
	test("mails to the members: the round trips do not grow with the members", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));

		const { small, smallMails, large, largeMails } = await budget();

		expect(small.result).toMatchObject({ success: true, billsCreated: 3 });
		expect(large.result).toMatchObject({ success: true, billsCreated: 23 });
		// Mailed: every member bill, minus opt-outs; never a group bill.
		expect(smallMails).toBe(3);
		expect(largeMails).toBe(19);

		// Session, sender, one read batch, the Hausbewohner memberships, one
		// write batch and the recipients (was 45 → 237).
		expect(small.total).toBe(8);
		expect(large.total).toBe(small.total);
		expect(large.tenant).toBe(small.tenant);
		expect(large.control).toBe(small.control);
		// Everything is written by one atomic batch.
		expect(small.writes).toBe(1);
		expect(large.writes).toBe(1);
		expect(large.log.filter((e) => e.kind === "transaction")).toEqual([]);
		// Renders a PDF per mailed bill: over the 5 s default on CI runners.
	}, 30_000);

	test("mails to the treasurer: the round trips do not grow with the bills", async () => {
		await createTenant({ features: ["billing.treasurerRecipient"] });
		await setUpGetraenkeBilling();
		await setKasseConfig({
			billRecipient: "treasurer",
			treasurerEmail: "kassenwart@example.test",
		});
		signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));

		const { small, smallMails, large, largeMails } = await budget();

		// Member and group bills alike, opt-outs don't apply.
		expect(smallMails).toBe(5);
		expect(largeMails).toBe(43);
		// The recipients setting instead of the member addresses (was 56 → 358).
		expect(small.total).toBe(8);
		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(1);
		expect(
			(await tenantDb().select({ id: bills.id }).from(bills)).length,
		).toBeGreaterThan(43);
	});
});

// At 200 members every multi-row INSERT is split into chunks of 200 rows;
// the chunks still travel in the one write batch.
test("5 and 200 members: the same round trips and one write batch (#23)", async () => {
	await createTenant();
	await setUpGetraenkeBilling();
	signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));
	// Nobody gets a mail, so no PDF is rendered for 200 bills.
	const noMail = () => true;
	await addMembers(1, noMail);
	expect(await run()).toMatchObject({ success: true });

	await addMembers(5, noMail);
	const small = await countQueries(run);
	await addMembers(200, noMail);
	const large = await countQueries(run);

	// The members of the runs before are carried along.
	expect(small.result).toMatchObject({
		success: true,
		billsCreated: 6,
		eventBillsCreated: 5,
	});
	expect(large.result).toMatchObject({
		success: true,
		billsCreated: 206,
		eventBillsCreated: 200,
	});
	expect(mail).not.toHaveBeenCalled();
	expect(small.total).toBe(8);
	expect(large.total).toBe(small.total);
	expect(large.tenant).toBe(small.tenant);
	expect(large.writes).toBe(1);
	expect(large.log.filter((e) => e.kind === "transaction")).toEqual([]);
	const [write] = large.log.filter((e) =>
		e.sql.some((q) => q.startsWith("insert")),
	);
	const inserts = (table: string) =>
		write?.sql.filter((q) => q.startsWith(`insert into "${table}"`)).length;
	// 406 bills; 600 items: two drinks per new member, one per group.
	expect(inserts("bill")).toBe(3);
	expect(inserts("bill_item")).toBe(3);
	expect(await tenantDb().$count(orders, eq(orders.inBill, false))).toBe(0);
	// Seeds 200 members with orders: well over the 5 s default on CI runners.
}, 30_000);

async function memberWithOpenBill() {
	await createTenant();
	await setUpGetraenkeBilling();
	signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));
	const max = await createUser({ name: "Max" });
	const period = await createBillPeriodRow({ billNumber: "KW-40-26" });
	const open = await createBillRow({
		periodId: period.id,
		user: max,
		drinksTotal: 10,
	});
	const order = await createOrderRow({
		user: max,
		drink: await createDrink({ name: "Pils", price: 1.5 }),
	});
	return { max, period, open, order };
}

describe("data changed between reading and writing the run (#23)", () => {
	test("a bill paid meanwhile: nothing is written, and the next run bills without the carry-over", async () => {
		const { max, period, open, order } = await memberWithOpenBill();
		beforeNextWriteBatch(() =>
			tenantDb()
				.update(bills)
				.set({ status: "Bezahlt" })
				.where(eq(bills.id, open.id)),
		);

		const result = await runGetraenkeBilling({ inventoryLoss: 0 });

		expect(result).toMatchObject({
			success: false,
			billsCreated: 0,
			message: expect.stringContaining("bitte die Abrechnung neu starten"),
		});
		expect(await tenantDb().select().from(billPeriods)).toEqual([
			expect.objectContaining({ id: period.id, closedAt: null }),
		]);
		expect(await billsOf(max.id)).toEqual([
			expect.objectContaining({ id: open.id, status: "Bezahlt" }),
		]);
		const [unbilled] = await tenantDb()
			.select()
			.from(orders)
			.where(eq(orders.id, order.id));
		expect(unbilled?.inBill).toBe(false);
		expect(mail).not.toHaveBeenCalled();

		expect(await runGetraenkeBilling({ inventoryLoss: 0 })).toMatchObject({
			success: true,
			billsCreated: 1,
		});
		expect((await billsOf(max.id))[1]).toMatchObject({
			oldBillingAmount: 0,
			total: 1.5,
		});
	});

	test("a bill deferred meanwhile changes the late fee, so the run is refused", async () => {
		const { open } = await memberWithOpenBill();
		beforeNextWriteBatch(() =>
			tenantDb()
				.update(bills)
				.set({ status: "Gestundet" })
				.where(eq(bills.id, open.id)),
		);

		expect(await runGetraenkeBilling({ inventoryLoss: 0 })).toMatchObject({
			success: false,
		});
		expect(await tenantDb().select().from(bills)).toHaveLength(1);
	});

	test("another run in between: every order and every debt is billed once", async () => {
		const { max } = await memberWithOpenBill();
		let inner: Awaited<ReturnType<typeof runGetraenkeBilling>> | undefined;
		beforeNextWriteBatch(async () => {
			inner = await runGetraenkeBilling({ inventoryLoss: 0 });
		});

		const outer = await runGetraenkeBilling({ inventoryLoss: 0 });

		expect(inner).toMatchObject({ success: true, billsCreated: 1 });
		// The bill number was taken: the later run writes nothing.
		expect(outer).toMatchObject({
			success: false,
			billsCreated: 0,
			error: expect.stringContaining("neu starten"),
		});
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(2);
		expect((await billsOf(max.id)).map((b) => [b.status, b.total])).toEqual([
			["Übertragen", 10],
			["Unbezahlt", 12.5],
		]);
	});

	test("a failure that is no conflict is reported as before", async () => {
		await memberWithOpenBill();
		beforeNextWriteBatch(async () => {
			throw new Error("network down");
		});

		expect(await runGetraenkeBilling({ inventoryLoss: 0 })).toMatchObject({
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			error: "network down",
		});
	});
});

describe("mailed bills (#23)", () => {
	test("the PDF rendered from memory shows exactly what is stored", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));
		const hanna = await createUser({
			name: "Hanna Müller",
			email: "hanna@example.test",
			roles: ["Hausbewohner"],
		});
		const period = await createBillPeriodRow({ billNumber: "KW-40-26" });
		await createBillRow({ periodId: period.id, user: hanna, drinksTotal: 20 });
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const cola = await createDrink({ name: "Cola", price: 1.2 });
		await createOrderRow({ user: hanna, drink: pils, amount: 2 });
		await createOrderRow({ user: hanna, drink: cola });
		await createOrderRow({ user: hanna, drink: pils, pricePerUnit: 1.65 });

		await runGetraenkeBilling({ inventoryLoss: 7 });

		const [sent] = mail.mock.calls;
		const attachment = sent?.[0].attachments?.[0];
		const [bill] = (await billsOf(hanna.id)).slice(-1);
		const stored = await generateUserBillPDF(bill?.id ?? "");
		expect(bill).toMatchObject({ umlage: 7, fees: 2, total: 34.85 });
		expect(attachment?.filename).toBe(stored.fileName);
		expect(pdfText(attachment?.content as Buffer)).toEqual(
			pdfText(stored.pdfContent as Buffer),
		);
	});

	test("failed mails are logged and skipped, the others still go out", async () => {
		const tenant = await createTenant();
		await setUpGetraenkeBilling();
		signInAs(await createUser({ name: "Wart", roles: ["Getränkewart"] }));
		for (const name of ["A", "B", "C", "D", "E", "F"]) {
			await createOrderRow({ user: await createUser({ name }) });
		}
		mail.mockRejectedValueOnce(new Error("SMTP down"));
		mail.mockRejectedValueOnce(new Error("SMTP down"));
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		const result = await runGetraenkeBilling({ inventoryLoss: 0 });

		expect(result).toMatchObject({ success: true, billsCreated: 6 });
		expect(mail).toHaveBeenCalledTimes(6);
		const failures = vi
			.mocked(console.error)
			.mock.calls.map(([line]) => String(line))
			.filter((line) => line.includes("bill mail failed"));
		expect(failures).toHaveLength(2);
		// Tenant-tagged JSON, without the recipient's or anyone's address.
		expect(JSON.parse(failures[0] as string)).toMatchObject({
			level: "error",
			tenant: tenant.slug,
			to: "member",
			err: { message: expect.stringContaining("to [email]") },
		});
		expect(failures.join("\n")).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
		const summary = info.mock.calls
			.map(([line]) => JSON.parse(String(line)))
			.find((l) => l.msg === "billing mails sent");
		expect(summary).toMatchObject({ mode: "members", sent: 4, failed: 2 });
	});
});
