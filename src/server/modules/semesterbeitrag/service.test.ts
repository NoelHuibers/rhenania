// The Semesterbeitrag service on its own (#33): called with a TenantScope
// over a local libSQL file and a fixed clock, without a server action, a
// session or a faked system time.

import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { semesterbeitragCharges } from "~/server/db/schema";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	createEtaplan,
	createKonto,
	createKostenpunkt,
} from "../../../../test/factories/cc-kasse";
import {
	createBeitragRun,
	createCharge,
	createMember,
} from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { chargesForRun, markPaid, sendReminders } from "./service";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

const DUE = new Date("2026-11-15T00:00:00Z");
const BEFORE_DUE = new Date("2026-11-14T23:59:59Z");
const AFTER_DUE = new Date("2026-11-16T09:30:00Z");

async function runWithOpenCharge() {
	await createTenant({ displayName: "Corps Testania" });
	await createKonto();
	const plan = await createEtaplan();
	const kp = await createKostenpunkt(plan.id);
	const run = await createBeitragRun(kp, { dueDate: DUE, mahnungFee: 5 });
	const member = await createMember({
		firstName: "Max",
		lastName: "Muster",
		email: "max@example.test",
	});
	const charge = await createCharge(run.id, member);
	return { run, charge };
}

async function chargeRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(semesterbeitragCharges)
		.where(eq(semesterbeitragCharges.id, id));
	return row;
}

describe("the scope's clock", () => {
	test("decides whether an open charge is overdue", async () => {
		const { run } = await runWithOpenCharge();

		const before = await chargesForRun(testScope({ now: BEFORE_DUE }), run.id);
		const after = await chargesForRun(testScope({ now: AFTER_DUE }), run.id);

		expect(before?.charges.map((c) => c.ueberfaellig)).toEqual([false]);
		expect(after?.charges.map((c) => c.ueberfaellig)).toEqual([true]);
	});

	test("refuses reminders before the due date", async () => {
		const { run, charge } = await runWithOpenCharge();

		await expect(
			sendReminders(testScope({ now: BEFORE_DUE }), run.id),
		).rejects.toThrow("Fälligkeitsdatum noch nicht erreicht.");
		expect(sendTenantMail).not.toHaveBeenCalled();
		expect(await chargeRow(charge.id)).toMatchObject({ status: "Offen" });
	});

	test("stamps the reminder and the payment with its time", async () => {
		const { run, charge } = await runWithOpenCharge();
		const scope = testScope({ now: AFTER_DUE });

		expect(await sendReminders(scope, run.id)).toEqual({
			processed: 1,
			emailed: 1,
			lettersPending: 0,
			failed: 0,
		});
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Gemahnt",
			mahnungAmount: 5,
			mahnungSentAt: AFTER_DUE,
			deliveryMethod: "email",
		});

		const kassier = await createUser({ roles: ["CC-Kasse"] });
		await markPaid(scope, kassier, charge.id);
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Bezahlt",
			paidAt: AFTER_DUE,
			paidBy: kassier.id,
		});
	});
});

describe("chargesForRun", () => {
	test("answers null for an unknown run", async () => {
		await createTenant();
		expect(await chargesForRun(testScope(), "nope")).toBeNull();
	});
});
