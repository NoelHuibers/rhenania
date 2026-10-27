import { describe, expect, test } from "vitest";

import { etaplans } from "~/server/db/schema";
import { createEtaplan as seedEtaplan } from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	createEtaplan,
	getActiveEtaplan,
	getEtaplanById,
	listEtaplans,
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

describe("updateEtaplan", () => {
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

		expect(
			await updateEtaplan(newer.id, { status: "Abgeschlossen" }),
		).toMatchObject({
			success: true,
		});

		expect((await getActiveEtaplan())?.id).toBe(older.id);
		await updateEtaplan(older.id, { status: "Abgeschlossen" });
		expect(await getActiveEtaplan()).toBeNull();
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
