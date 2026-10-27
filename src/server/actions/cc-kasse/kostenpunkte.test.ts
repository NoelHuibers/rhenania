import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
	events,
	kostenpunkte,
	kostenpunktPositionen,
} from "~/server/db/schema";
import {
	createEinnahme,
	createEtaplan,
	createReimbursement,
	createKostenpunkt as seedKostenpunkt,
} from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	createKostenpunkt,
	deleteKostenpunkt,
	getBookableKostenpunkte,
	linkableEvents,
	listKostenpunkteForEtaplan,
	updateKostenpunkt,
} from "./kostenpunkte";

setupTestDatabases();

async function setup() {
	await createTenant();
	signInAs(await createUser({ roles: ["Senior"] }));
	return createEtaplan();
}

async function positionsOf(kostenpunktId: string) {
	return tenantDb()
		.select({
			bemerkung: kostenpunktPositionen.bemerkung,
			ausgaben: kostenpunktPositionen.ausgaben,
			einnahmen: kostenpunktPositionen.einnahmen,
			displayOrder: kostenpunktPositionen.displayOrder,
		})
		.from(kostenpunktPositionen)
		.where(eq(kostenpunktPositionen.kostenpunktId, kostenpunktId))
		.orderBy(asc(kostenpunktPositionen.displayOrder));
}

async function kp(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(kostenpunkte)
		.where(eq(kostenpunkte.id, id));
	return row;
}

describe("createKostenpunkt", () => {
	test("caches budget and income as the cent-rounded sums of the positions", async () => {
		const plan = await setup();

		const result = await createKostenpunkt({
			etaplanId: plan.id,
			category: "Kneipen",
			name: "Antrittskneipe",
			eventId: "",
			positionen: [
				{ bemerkung: "  Bier  ", ausgaben: 0.1, einnahmen: 0 },
				{ bemerkung: "   ", ausgaben: 0.2, einnahmen: 12.345 },
				{ ausgaben: 100 },
			],
		});

		expect(result.success).toBe(true);
		const id = result.success ? result.data.id : "";
		expect(await kp(id)).toMatchObject({
			etaplanId: plan.id,
			category: "Kneipen",
			name: "Antrittskneipe",
			budget: 100.3,
			income: 12.35,
			eventId: null,
			categoryOrder: 0,
			displayOrder: 0,
		});
		expect(await positionsOf(id)).toEqual([
			{ bemerkung: "Bier", ausgaben: 0.1, einnahmen: 0, displayOrder: 0 },
			{ bemerkung: null, ausgaben: 0.2, einnahmen: 12.35, displayOrder: 1 },
			{ bemerkung: null, ausgaben: 100, einnahmen: 0, displayOrder: 2 },
		]);
	});

	test("creates a Kostenpunkt without positions with a zero budget", async () => {
		const plan = await setup();

		const result = await createKostenpunkt({
			etaplanId: plan.id,
			category: "Sonstiges",
			name: "Reserve",
		});

		const id = result.success ? result.data.id : "";
		expect(await kp(id)).toMatchObject({ budget: 0, income: 0 });
		expect(await positionsOf(id)).toEqual([]);
	});

	test.each([
		[{ category: "" }, "Kategorie ist erforderlich"],
		[{ name: "" }, "Name ist erforderlich"],
	])("rejects %o", async (patch, message) => {
		const plan = await setup();

		const result = await createKostenpunkt({
			etaplanId: plan.id,
			category: "K",
			name: "N",
			...patch,
		});

		expect(result).toMatchObject({ success: false, error: message });
		expect(await tenantDb().select().from(kostenpunkte)).toHaveLength(0);
	});

	test("rejects negative position amounts and writes nothing", async () => {
		const plan = await setup();

		const result = await createKostenpunkt({
			etaplanId: plan.id,
			category: "K",
			name: "N",
			positionen: [{ ausgaben: -5 }],
		});

		expect(result.success).toBe(false);
		expect(await tenantDb().select().from(kostenpunkte)).toHaveLength(0);
		expect(await tenantDb().select().from(kostenpunktPositionen)).toHaveLength(
			0,
		);
	});

	test("fails cleanly for an unknown Etatplan", async () => {
		await setup();

		const result = await createKostenpunkt({
			etaplanId: "missing",
			category: "K",
			name: "N",
			positionen: [{ ausgaben: 1 }],
		});

		expect(result).toEqual({ success: false, error: "Fehler beim Erstellen" });
		expect(await tenantDb().select().from(kostenpunktPositionen)).toHaveLength(
			0,
		);
	});
});

describe("updateKostenpunkt", () => {
	test("replaces all positions and recomputes the cached sums", async () => {
		const plan = await setup();
		const existing = await seedKostenpunkt(plan.id, {
			positionen: [
				{ bemerkung: "alt 1", ausgaben: 50 },
				{ bemerkung: "alt 2", ausgaben: 70, einnahmen: 10 },
			],
		});

		const result = await updateKostenpunkt(existing.id, {
			category: "Neu",
			name: "Umbenannt",
			categoryOrder: 3,
			positionen: [{ bemerkung: "neu", ausgaben: 19.999, einnahmen: 5 }],
		});

		expect(result).toEqual({ success: true });
		expect(await kp(existing.id)).toMatchObject({
			category: "Neu",
			name: "Umbenannt",
			categoryOrder: 3,
			budget: 20,
			income: 5,
		});
		expect(await positionsOf(existing.id)).toEqual([
			{ bemerkung: "neu", ausgaben: 20, einnahmen: 5, displayOrder: 0 },
		]);
	});

	test("clearing all positions zeroes the budget", async () => {
		const plan = await setup();
		const existing = await seedKostenpunkt(plan.id, {
			positionen: [{ ausgaben: 50, einnahmen: 20 }],
		});

		await updateKostenpunkt(existing.id, {
			category: existing.category,
			name: existing.name,
			positionen: [],
		});

		expect(await kp(existing.id)).toMatchObject({ budget: 0, income: 0 });
		expect(await positionsOf(existing.id)).toEqual([]);
	});
});

describe("deleteKostenpunkt", () => {
	test("deletes the Kostenpunkt with its positions", async () => {
		const plan = await setup();
		const target = await seedKostenpunkt(plan.id, {
			positionen: [{ ausgaben: 1 }, { ausgaben: 2 }],
		});

		expect(await deleteKostenpunkt(target.id)).toEqual({ success: true });
		expect(await kp(target.id)).toBeUndefined();
		expect(await positionsOf(target.id)).toEqual([]);
	});

	test("refuses when reimbursements of any status reference it", async () => {
		const plan = await setup();
		const target = await seedKostenpunkt(plan.id);
		await createReimbursement(target, { status: "Abgelehnt" });

		const result = await deleteKostenpunkt(target.id);

		expect(result).toEqual({
			success: false,
			error: "Kostenpunkt hat Erstattungen und kann nicht gelöscht werden.",
		});
		expect(await kp(target.id)).toBeDefined();
	});

	test("refuses when Einnahmen are booked on it", async () => {
		const plan = await setup();
		const target = await seedKostenpunkt(plan.id);
		await createEinnahme(target);

		const result = await deleteKostenpunkt(target.id);

		expect(result.success).toBe(false);
		expect(result.success === false && result.error).toMatch(/Einnahmen/);
		expect(await kp(target.id)).toBeDefined();
	});
});

describe("read models", () => {
	test("lists Kostenpunkte by category order, then display order, with sorted positions and event", async () => {
		const plan = await setup();
		const other = await createEtaplan();
		const [event] = await tenantDb()
			.insert(events)
			.values({ title: "Stiftungsfest", date: new Date("2026-06-01") })
			.returning();
		await seedKostenpunkt(plan.id, {
			name: "B2",
			category: "B",
			categoryOrder: 1,
			displayOrder: 1,
		});
		await seedKostenpunkt(plan.id, {
			name: "B1",
			category: "B",
			categoryOrder: 1,
			displayOrder: 0,
			eventId: event?.id,
			positionen: [{ bemerkung: "erst" }, { bemerkung: "dann" }],
		});
		await seedKostenpunkt(plan.id, {
			name: "A",
			category: "A",
			categoryOrder: 0,
		});
		await seedKostenpunkt(other.id, { name: "fremd" });

		const list = await listKostenpunkteForEtaplan(plan.id);

		expect(list.map((k) => k.name)).toEqual(["A", "B1", "B2"]);
		const b1 = list[1];
		expect(b1?.positionen.map((p) => p.bemerkung)).toEqual(["erst", "dann"]);
		expect(b1?.event).toMatchObject({ id: event?.id, title: "Stiftungsfest" });
	});

	test("only Kostenpunkte of active plans are bookable", async () => {
		const active = await setup();
		const closed = await createEtaplan({ status: "Abgeschlossen" });
		await seedKostenpunkt(active.id, { name: "offen", category: "X" });
		await seedKostenpunkt(closed.id, { name: "zu", category: "X" });

		expect(await getBookableKostenpunkte()).toEqual([
			expect.objectContaining({ name: "offen", category: "X" }),
		]);
	});

	test("linkable events are newest first", async () => {
		await setup();
		await tenantDb()
			.insert(events)
			.values([
				{ title: "alt", date: new Date("2025-01-01") },
				{ title: "neu", date: new Date("2026-01-01") },
			]);

		expect((await linkableEvents()).map((e) => e.title)).toEqual([
			"neu",
			"alt",
		]);
	});
});
