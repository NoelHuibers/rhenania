import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
	einnahmen,
	etaplans,
	kostenerstattungen,
	kostenpunkte,
	kostenpunktPositionen,
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import {
	createEinnahme,
	createKostenpunkt,
	createReimbursement,
	createEtaplan as seedEtaplan,
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
	tenantDb,
} from "../../../../test/harness";
import {
	createEtaplan,
	deleteEtaplan,
	getActiveEtaplan,
	getEtaplanById,
	listEtaplans,
	setEtaplanStatus,
	updateEtaplan,
} from "./etaplans";

setupTestDatabases();

async function signInSenior() {
	await createTenant();
	const user = await createUser({ roles: ["Senior"] });
	signInAs(user);
	return user;
}

describe("createEtaplan", () => {
	test("stores the plan as Aktiv with the creator", async () => {
		const senior = await signInSenior();
		const start = new Date("2026-10-01T00:00:00Z");

		const result = await createEtaplan({
			name: "WS 2026/27",
			semesterType: "WS",
			year: 2026,
			startDate: start,
		});

		expect(result).toMatchObject({ success: true, warning: undefined });
		const [row] = await tenantDb().select().from(etaplans);
		expect(row).toMatchObject({
			name: "WS 2026/27",
			semesterType: "WS",
			year: 2026,
			status: "Aktiv",
			startDate: start,
			endDate: null,
			notes: null,
			createdBy: senior.id,
		});
	});

	test("warns about a second plan for the same semester but still creates it", async () => {
		await signInSenior();
		await seedEtaplan({ semesterType: "SS", year: 2026 });

		const result = await createEtaplan({
			name: "SS 2026 (neu)",
			semesterType: "SS",
			year: 2026,
		});

		expect(result.success).toBe(true);
		expect(result.success && result.warning).toBe(
			"Es existiert bereits ein Etatplan für SS 2026.",
		);
		expect(await tenantDb().select().from(etaplans)).toHaveLength(2);
	});

	test.each([
		[{ name: "", year: 2026 }, "Name ist erforderlich"],
		[{ name: "X", year: 1899 }, "Jahr ist zu klein"],
		[{ name: "X", year: 2201 }, "Jahr ist zu groß"],
		[{ name: "X", year: 2026.5 }, "Jahr muss eine ganze Zahl sein"],
	])("rejects %o with %s", async (input, message) => {
		await signInSenior();

		const result = await createEtaplan({ semesterType: "WS", ...input });

		expect(result).toMatchObject({ success: false, error: message });
		expect(await tenantDb().select().from(etaplans)).toHaveLength(0);
	});
});

describe("updateEtaplan / setEtaplanStatus", () => {
	test("patches only the given fields", async () => {
		await signInSenior();
		const plan = await seedEtaplan({ name: "Alt", notes: "bleibt" });

		const result = await updateEtaplan(plan.id, { name: "Neu" });

		expect(result).toMatchObject({ success: true, data: { name: "Neu" } });
		expect(await getEtaplanById(plan.id)).toMatchObject({
			name: "Neu",
			notes: "bleibt",
			year: plan.year,
		});
	});

	test("reports an unknown plan", async () => {
		await signInSenior();
		expect(await updateEtaplan("missing", { name: "X" })).toEqual({
			success: false,
			error: "Etatplan nicht gefunden",
		});
	});

	test("validates the patch and keeps the stored plan", async () => {
		await signInSenior();
		const plan = await seedEtaplan({ year: 2026 });

		expect(await updateEtaplan(plan.id, { year: 1800 })).toEqual({
			success: false,
			error: "Jahr ist zu klein",
		});
		expect((await getEtaplanById(plan.id))?.year).toBe(2026);
	});

	test("closing a plan hands 'active' to the next newest Aktiv plan", async () => {
		await signInSenior();
		const older = await seedEtaplan({ year: 2025 });
		const newer = await seedEtaplan({ year: 2026 });
		expect((await getActiveEtaplan())?.id).toBe(newer.id);

		expect(await setEtaplanStatus(newer.id, "Abgeschlossen")).toMatchObject({
			success: true,
		});

		expect((await getActiveEtaplan())?.id).toBe(older.id);
		await setEtaplanStatus(older.id, "Abgeschlossen");
		expect(await getActiveEtaplan()).toBeNull();
	});
});

describe("deleteEtaplan", () => {
	test("refuses while approved or paid reimbursements exist", async () => {
		await signInSenior();
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);

		for (const status of ["Genehmigt", "Ausgezahlt"] as const) {
			const r = await createReimbursement(kp, { status });
			const result = await deleteEtaplan(plan.id);
			expect(result.success).toBe(false);
			expect(result.success === false && result.error).toMatch(
				/bitte stattdessen abschließen/i,
			);
			await tenantDb()
				.delete(kostenerstattungen)
				.where(eq(kostenerstattungen.id, r.id));
		}
		expect(await getEtaplanById(plan.id)).not.toBeNull();
	});

	test("removes open/rejected requests, Kostenpunkte and positions", async () => {
		await signInSenior();
		const plan = await seedEtaplan();
		const keep = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id, {
			positionen: [{ ausgaben: 10 }, { ausgaben: 5 }],
		});
		const otherKp = await createKostenpunkt(keep.id, {
			positionen: [{ ausgaben: 1 }],
		});
		await createReimbursement(kp, { status: "Eingereicht" });
		await createReimbursement(kp, { status: "Abgelehnt" });
		await createReimbursement(otherKp, { status: "Eingereicht" });

		expect(await deleteEtaplan(plan.id)).toEqual({ success: true });

		const db = tenantDb();
		expect((await db.select().from(etaplans)).map((p) => p.id)).toEqual([
			keep.id,
		]);
		expect((await db.select().from(kostenpunkte)).map((k) => k.id)).toEqual([
			otherKp.id,
		]);
		expect(
			(await db.select().from(kostenpunktPositionen)).map(
				(p) => p.kostenpunktId,
			),
		).toEqual([otherKp.id]);
		expect(
			(await db.select().from(kostenerstattungen)).map((r) => r.kostenpunktId),
		).toEqual([otherKp.id]);
	});

	test("removes an unpaid Beitragslauf of the plan with it", async () => {
		await signInSenior();
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);
		const run = await createBeitragRun(kp);
		await createCharge(run.id, await createMember());

		expect(await deleteEtaplan(plan.id)).toEqual({ success: true });
		expect(await tenantDb().select().from(semesterbeitragRuns)).toHaveLength(0);
		expect(await tenantDb().select().from(semesterbeitragCharges)).toHaveLength(
			0,
		);
	});

	// deleteBeitragRun refuses to drop paid charges ("financial records"),
	// but deleting the whole plan cascades them away without a check.
	test.fails("refuses while paid Semesterbeiträge exist (#150)", async () => {
		await signInSenior();
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);
		const run = await createBeitragRun(kp);
		await createCharge(run.id, await createMember(), { status: "Bezahlt" });

		const result = await deleteEtaplan(plan.id);

		expect(result.success).toBe(false);
		expect(await tenantDb().select().from(semesterbeitragCharges)).toHaveLength(
			1,
		);
	});

	test.fails("refuses while booked Einnahmen exist (#150)", async () => {
		await signInSenior();
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);
		await createEinnahme(kp, { amount: 250 });

		const result = await deleteEtaplan(plan.id);

		expect(result.success).toBe(false);
		expect(await tenantDb().select().from(einnahmen)).toHaveLength(1);
	});
});

describe("listEtaplans", () => {
	test("orders by year, newest first", async () => {
		await signInSenior();
		await seedEtaplan({ name: "2024", year: 2024 });
		await seedEtaplan({ name: "2026", year: 2026 });
		await seedEtaplan({ name: "2025", year: 2025 });

		expect((await listEtaplans()).map((p) => p.name)).toEqual([
			"2026",
			"2025",
			"2024",
		]);
	});
});
