// The CC-Kasse service on its own (#33): called with a TenantScope over a
// local libSQL file and a fixed clock, without a server action, a session
// or a faked system time.

import { describe, expect, test } from "vitest";

import { kostenerstattungen } from "~/server/db/schema";
import {
	createEtaplan,
	createKostenpunkt,
	createReimbursement,
} from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import {
	approveErstattung,
	payErstattung,
	rejectErstattung,
	submitErstattung,
} from "./service";

setupTestDatabases();

const NOW = new Date("2026-10-20T09:15:42Z");
const PAID = new Date("2026-10-22T00:00:00Z");

async function setup() {
	await createTenant({ slug: "rhenania" });
	const member = await createUser({ name: "Fux" });
	const kassier = await createUser({ roles: ["CC-Kasse"] });
	const plan = await createEtaplan();
	const kp = await createKostenpunkt(plan.id);
	return { member, kassier, kp };
}

async function onlyRequest() {
	const [row] = await tenantDb().select().from(kostenerstattungen);
	return row;
}

describe("Kostenerstattungen on the scope's clock", () => {
	test("a request without an expense date is dated now", async () => {
		const { member, kp } = await setup();

		await submitErstattung(testScope({ now: NOW }), member, {
			kostenpunktId: kp.id,
			description: "Fass",
			amount: 80,
			recipientName: "Fux",
			iban: "DE89370400440532013000",
		});

		expect(await onlyRequest()).toMatchObject({
			status: "Eingereicht",
			submittedBy: member.id,
			expenseDate: NOW,
		});
	});

	test("approval and payment are stamped with the clock, or the given day", async () => {
		const { kassier, kp } = await setup();
		const request = await createReimbursement(kp);
		const scope = testScope({ now: NOW });

		await approveErstattung(scope, kassier, request.id);
		expect(await onlyRequest()).toMatchObject({
			status: "Genehmigt",
			approvedBy: kassier.id,
			approvedAt: NOW,
		});

		await payErstattung(scope, kassier, request.id, PAID);
		expect(await onlyRequest()).toMatchObject({
			status: "Ausgezahlt",
			paidBy: kassier.id,
			paidAt: PAID,
		});
	});

	test("a paid request can no longer be rejected", async () => {
		const { kassier, kp } = await setup();
		const request = await createReimbursement(kp, { status: "Ausgezahlt" });

		await expect(
			rejectErstattung(testScope({ now: NOW }), kassier, request.id, "zu spät"),
		).rejects.toThrow("Ungültiger Statusübergang");
		expect(await onlyRequest()).toMatchObject({ status: "Ausgezahlt" });
	});

	test("receipts must lie in the scope's Corps folder", async () => {
		const { member, kp } = await setup();
		const input = {
			kostenpunktId: kp.id,
			description: "Deko",
			amount: 15,
			recipientName: "Fux",
			iban: "DE89370400440532013000",
		};
		const store = "https://abc123.public.blob.vercel-storage.com/tenants";

		await expect(
			submitErstattung(testScope({ now: NOW }), member, {
				...input,
				receipts: [{ url: `${store}/hassia/receipts/1-a.pdf`, name: "a" }],
			}),
		).rejects.toThrow("Ungültiger Beleg");
		await submitErstattung(testScope({ now: NOW }), member, {
			...input,
			receipts: [{ url: `${store}/rhenania/receipts/1-a.pdf`, name: "a" }],
		});
		expect(await onlyRequest()).toMatchObject({ description: "Deko" });
	});
});
