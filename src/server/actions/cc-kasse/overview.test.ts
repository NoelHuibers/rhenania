import { describe, expect, test } from "vitest";
import {
	createEinnahme,
	createEtaplan,
	createKostenpunkt,
	createReimbursement,
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
	signInAs,
} from "../../../../test/harness";
import { getEtaplanOverview } from "./overview";

setupTestDatabases();

async function setup() {
	await createTenant();
	signInAs(await createUser({ roles: ["Senior"] }));
	return createEtaplan();
}

describe("getEtaplanOverview", () => {
	test("aggregates spending, approvals and actual income per Kostenpunkt, category and plan", async () => {
		const plan = await setup();
		const a = await createKostenpunkt(plan.id, {
			name: "Antrittskneipe",
			category: "Kneipen",
			categoryOrder: 0,
			displayOrder: 0,
			budget: 100,
			income: 20,
		});
		const b = await createKostenpunkt(plan.id, {
			name: "Abschlusskneipe",
			category: "Kneipen",
			categoryOrder: 0,
			displayOrder: 1,
			budget: 50,
		});
		const c = await createKostenpunkt(plan.id, {
			name: "Putzmittel",
			category: "Haus",
			categoryOrder: 1,
			budget: 0,
		});
		// Only Ausgezahlt counts as spent and Genehmigt as committed.
		await createReimbursement(a, { status: "Ausgezahlt", amount: 30 });
		await createReimbursement(a, { status: "Ausgezahlt", amount: 55 });
		await createReimbursement(a, { status: "Genehmigt", amount: 10 });
		await createReimbursement(a, { status: "Eingereicht", amount: 999 });
		await createReimbursement(a, { status: "Abgelehnt", amount: 999 });
		await createReimbursement(b, { status: "Ausgezahlt", amount: 60 });
		await createReimbursement(c, { status: "Ausgezahlt", amount: 5 });
		// Ist-Einnahmen: manual bookings + paid Semesterbeiträge (incl. Mahnung).
		await createEinnahme(a, { amount: 15.5 });
		const run = await createBeitragRun(a);
		await createCharge(run.id, await createMember(), {
			status: "Bezahlt",
			baseAmount: 28,
			mahnungAmount: 5,
		});
		await createCharge(run.id, await createMember(), { status: "Offen" });
		await createCharge(run.id, await createMember(), { status: "Gemahnt" });
		// Another plan's bookings never leak in.
		const otherPlan = await createEtaplan();
		const foreign = await createKostenpunkt(otherPlan.id, { budget: 1 });
		await createReimbursement(foreign, { status: "Ausgezahlt", amount: 500 });
		await createEinnahme(foreign, { amount: 500 });

		const overview = await getEtaplanOverview(plan.id);

		expect(overview?.kostenpunkte).toEqual([
			{
				id: a.id,
				name: "Antrittskneipe",
				category: "Kneipen",
				categoryOrder: 0,
				eventId: null,
				budget: 100,
				income: 20,
				istEinnahmen: 48.5,
				ausgegeben: 85,
				genehmigt: 10,
				verbleibend: 15,
				auslastung: 85,
				status: "warning",
			},
			expect.objectContaining({
				id: b.id,
				ausgegeben: 60,
				verbleibend: -10,
				auslastung: 120,
				status: "over-budget",
			}),
			expect.objectContaining({
				id: c.id,
				budget: 0,
				ausgegeben: 5,
				auslastung: 100,
				status: "over-budget",
			}),
		]);
		expect(overview?.categories).toEqual([
			{
				category: "Kneipen",
				categoryOrder: 0,
				budget: 150,
				income: 20,
				istEinnahmen: 48.5,
				ausgegeben: 145,
				genehmigt: 10,
				verbleibend: 5,
				auslastung: 96.67,
				status: "warning",
			},
			expect.objectContaining({
				category: "Haus",
				ausgegeben: 5,
				status: "over-budget",
			}),
		]);
		expect(overview?.total).toEqual({
			budget: 150,
			income: 20,
			istEinnahmen: 48.5,
			ausgegeben: 150,
			genehmigt: 10,
			verbleibend: 0,
			auslastung: 100,
			// Exactly on budget is still a warning, not over budget.
			status: "warning",
		});
		expect(overview?.geplanteEinnahmen).toBe(20);
		expect(overview?.geplanterZuschuss).toBe(130);
	});

	test.each([
		[79.99, "on-track"],
		[80, "warning"],
		[100, "warning"],
		[101, "over-budget"],
	])("spending %s of 100 is %s", async (spent, status) => {
		const plan = await setup();
		const kp = await createKostenpunkt(plan.id, { budget: 100 });
		await createReimbursement(kp, { status: "Ausgezahlt", amount: spent });

		const overview = await getEtaplanOverview(plan.id);

		expect(overview?.kostenpunkte[0]?.status).toBe(status);
		expect(overview?.total.status).toBe(status);
	});

	// statusFor() allows a relative 0.01 % overshoot before flagging, so on a
	// 10 000 € budget up to 1 € of overspending still shows as "warning"
	// while Verbleibend is already negative.
	test.fails("a negative Verbleibend is always over budget (#151)", async () => {
		const plan = await setup();
		const kp = await createKostenpunkt(plan.id, { budget: 10_000 });
		await createReimbursement(kp, { status: "Ausgezahlt", amount: 10_000.5 });

		const overview = await getEtaplanOverview(plan.id);

		expect(overview?.kostenpunkte[0]?.verbleibend).toBe(-0.5);
		expect(overview?.kostenpunkte[0]?.status).toBe("over-budget");
	});

	test("sums are free of float drift", async () => {
		const plan = await setup();
		const kp = await createKostenpunkt(plan.id, { budget: 0.3 });
		await createReimbursement(kp, { status: "Ausgezahlt", amount: 0.1 });
		await createReimbursement(kp, { status: "Ausgezahlt", amount: 0.2 });

		const overview = await getEtaplanOverview(plan.id);

		expect(overview?.total).toMatchObject({
			ausgegeben: 0.3,
			verbleibend: 0,
			auslastung: 100,
			status: "warning",
		});
	});

	test("an empty plan is all zeros and on track", async () => {
		const plan = await setup();

		expect(await getEtaplanOverview(plan.id)).toEqual({
			kostenpunkte: [],
			categories: [],
			total: {
				budget: 0,
				income: 0,
				istEinnahmen: 0,
				ausgegeben: 0,
				genehmigt: 0,
				verbleibend: 0,
				auslastung: 0,
				status: "on-track",
			},
			geplanteEinnahmen: 0,
			geplanterZuschuss: 0,
		});
	});

	test("is not available to members without an editor role", async () => {
		const plan = await setup();
		signInAs(await createUser());
		expect(await getEtaplanOverview(plan.id)).toBeNull();
	});
});
