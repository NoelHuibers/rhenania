import { describe, expect, test } from "vitest";

import { einnahmen } from "~/server/db/schema";
import {
	createEtaplan,
	createKostenpunkt,
	createEinnahme as seedEinnahme,
} from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	createEinnahme,
	deleteEinnahme,
	listEinnahmen,
	updateEinnahme,
} from "./einnahmen";

setupTestDatabases();

const incomeDate = new Date("2026-05-10T18:00:00Z");

async function setup(role = "CC-Kasse") {
	await createTenant();
	const user = await createUser({ name: "Kassier", roles: [role] });
	signInAs(user);
	const plan = await createEtaplan();
	const kp = await createKostenpunkt(plan.id, { name: "Cocktailabend" });
	return { user, plan, kp };
}

describe("createEinnahme", () => {
	test("books against the Kostenpunkt's plan, rounded to cents", async () => {
		const { user, plan, kp } = await setup();

		const result = await createEinnahme({
			kostenpunktId: kp.id,
			description: "Kasse Cocktailabend",
			amount: 123.456,
			incomeDate,
		});

		expect(result).toEqual({ success: true });
		const [row] = await tenantDb().select().from(einnahmen);
		expect(row).toMatchObject({
			kostenpunktId: kp.id,
			etaplanId: plan.id,
			description: "Kasse Cocktailabend",
			amount: 123.46,
			incomeDate,
			bookedBy: user.id,
		});
	});

	test.each([
		[{ amount: 0 }, "Betrag muss positiv sein"],
		[{ amount: 1_000_001 }, "Betrag ist zu hoch"],
		[{ description: "" }, "Beschreibung ist erforderlich"],
		[{ kostenpunktId: "" }, "Kostenpunkt ist erforderlich"],
	])("rejects %o", async (patch, message) => {
		const { kp } = await setup();

		const result = await createEinnahme({
			kostenpunktId: kp.id,
			description: "x",
			amount: 10,
			incomeDate,
			...patch,
		});

		expect(result).toEqual({ success: false, error: message });
		expect(await tenantDb().select().from(einnahmen)).toHaveLength(0);
	});

	test("rejects an unknown Kostenpunkt", async () => {
		await setup();
		const result = await createEinnahme({
			kostenpunktId: "missing",
			description: "x",
			amount: 10,
			incomeDate,
		});
		expect(result).toEqual({
			success: false,
			error: "Kostenpunkt nicht gefunden",
		});
	});

	test("a Senior may read but not book", async () => {
		const { kp } = await setup("Senior");

		const result = await createEinnahme({
			kostenpunktId: kp.id,
			description: "x",
			amount: 10,
			incomeDate,
		});

		expect(result).toEqual({ success: false, error: "Keine Berechtigung" });
		expect(await tenantDb().select().from(einnahmen)).toHaveLength(0);
	});
});

describe("updateEinnahme", () => {
	test("moving to a Kostenpunkt of another plan moves the plan too", async () => {
		const { kp } = await setup();
		const otherPlan = await createEtaplan();
		const otherKp = await createKostenpunkt(otherPlan.id);
		const booked = await seedEinnahme(kp, { amount: 5 });

		const result = await updateEinnahme(booked.id, {
			kostenpunktId: otherKp.id,
			description: "umgebucht",
			amount: 7.004,
			incomeDate,
		});

		expect(result).toEqual({ success: true });
		const [row] = await tenantDb().select().from(einnahmen);
		expect(row).toMatchObject({
			kostenpunktId: otherKp.id,
			etaplanId: otherPlan.id,
			description: "umgebucht",
			amount: 7,
		});
	});

	test("reports an unknown Einnahme or Kostenpunkt and changes nothing", async () => {
		const { kp } = await setup();
		const booked = await seedEinnahme(kp, { amount: 5 });
		const input = {
			kostenpunktId: kp.id,
			description: "x",
			amount: 1,
			incomeDate,
		};

		expect(await updateEinnahme("missing", input)).toEqual({
			success: false,
			error: "Einnahme nicht gefunden",
		});
		expect(
			await updateEinnahme(booked.id, { ...input, kostenpunktId: "missing" }),
		).toEqual({ success: false, error: "Kostenpunkt nicht gefunden" });
		const [row] = await tenantDb().select().from(einnahmen);
		expect(row?.amount).toBe(5);
	});
});

describe("deleteEinnahme / listEinnahmen", () => {
	test("lists the plan's Einnahmen newest first with Kostenpunkt and booker", async () => {
		const { user, plan, kp } = await setup();
		const otherPlan = await createEtaplan();
		const otherKp = await createKostenpunkt(otherPlan.id);
		await seedEinnahme(kp, {
			description: "alt",
			incomeDate: new Date("2026-04-01"),
			bookedBy: user.id,
		});
		await seedEinnahme(kp, {
			description: "neu",
			incomeDate: new Date("2026-05-01"),
			bookedBy: user.id,
		});
		await seedEinnahme(otherKp, { description: "fremd" });

		const list = await listEinnahmen(plan.id);

		expect(list.map((e) => e.description)).toEqual(["neu", "alt"]);
		expect(list[0]?.kostenpunkt).toMatchObject({
			id: kp.id,
			name: "Cocktailabend",
		});
		expect(list[0]?.booker).toEqual({ id: user.id, name: "Kassier" });
	});

	test("a plain member sees nothing", async () => {
		const { plan, kp } = await setup();
		await seedEinnahme(kp);
		signInAs(await createUser());

		expect(await listEinnahmen(plan.id)).toEqual([]);
	});

	test("deletes a booking", async () => {
		const { plan, kp } = await setup();
		const keep = await seedEinnahme(kp, { description: "bleibt" });
		const drop = await seedEinnahme(kp, { description: "weg" });

		expect(await deleteEinnahme(drop.id)).toEqual({ success: true });

		expect((await listEinnahmen(plan.id)).map((e) => e.id)).toEqual([keep.id]);
	});
});
