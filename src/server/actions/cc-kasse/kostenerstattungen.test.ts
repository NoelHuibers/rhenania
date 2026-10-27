import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	approveReimbursement,
	cancelMyReimbursement,
	createDirectBooking,
	listMyReimbursements,
	listReimbursementQueue,
	markReimbursementPaid,
	rejectReimbursement,
	submitReimbursement,
	updateMyReimbursement,
	updateReimbursement,
} from "./kostenerstattungen";

setupTestDatabases();

const NOW = new Date("2026-10-26T10:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

const STORE = "https://abc123.public.blob.vercel-storage.com";
const receipt = {
	url: `${STORE}/tenants/rhenania/receipts/1-beleg.pdf`,
	name: "beleg.pdf",
};

async function setup() {
	await createTenant({ slug: "rhenania" });
	const member = await createUser({ name: "Fux Fuchs" });
	const kassier = await createUser({ name: "Kassier", roles: ["CC-Kasse"] });
	const plan = await createEtaplan({ name: "WS 2026" });
	const kp = await createKostenpunkt(plan.id, {
		name: "Antrittskneipe",
		category: "Kneipen",
	});
	return { member, kassier, plan, kp };
}

async function onlyRow() {
	const rows = await tenantDb().select().from(kostenerstattungen);
	expect(rows).toHaveLength(1);
	return rows[0] as (typeof rows)[number];
}

function submitInput(kostenpunktId: string) {
	return {
		kostenpunktId,
		description: "Bier für die Kneipe",
		amount: 42.5,
		recipientName: "Fux Fuchs",
		iban: "de89 3704 0044 0532 0130 00",
		receipts: [receipt],
	};
}

describe("submitReimbursement", () => {
	test("stores an Eingereicht request with a normalized IBAN", async () => {
		const { member, plan, kp } = await setup();
		signInAs(member);

		const result = await submitReimbursement(submitInput(kp.id));

		expect(result).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			kostenpunktId: kp.id,
			etaplanId: plan.id,
			source: "Antrag",
			status: "Eingereicht",
			description: "Bier für die Kneipe",
			amount: 42.5,
			submittedBy: member.id,
			recipientName: "Fux Fuchs",
			iban: "DE89370400440532013000",
			receipts: [receipt],
			expenseDate: NOW,
			approvedBy: null,
			paidBy: null,
		});
		expect(revalidatePath).toHaveBeenCalledWith("/kostenerstattung");
		expect(revalidatePath).toHaveBeenCalledWith("/cc-kasse");
	});

	test("keeps a custom expense date", async () => {
		const { member, kp } = await setup();
		signInAs(member);
		const expenseDate = new Date("2026-09-30T12:00:00Z");

		await submitReimbursement({ ...submitInput(kp.id), expenseDate });

		expect((await onlyRow()).expenseDate).toEqual(expenseDate);
	});

	test.each([
		[{ iban: "DE12" }, "Ungültige IBAN"],
		[{ iban: "" }, "IBAN ist erforderlich"],
		[{ amount: -1 }, "Betrag muss positiv sein"],
		[{ recipientName: "" }, "Kontoinhaber ist erforderlich"],
		[{ description: "x".repeat(501) }, "Beschreibung ist zu lang"],
		[
			{ receipts: Array.from({ length: 21 }, () => receipt) },
			"Zu viele Belege",
		],
		[{ receipts: [{ url: "not a url", name: "x" }] }, undefined],
	])("rejects %o", async (patch, message) => {
		const { member, kp } = await setup();
		signInAs(member);

		const result = await submitReimbursement({
			...submitInput(kp.id),
			...patch,
		});

		expect(result.success).toBe(false);
		if (message) {
			expect(result).toMatchObject({ error: message });
		}
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("rejects an unknown Kostenpunkt", async () => {
		const { member } = await setup();
		signInAs(member);
		expect(await submitReimbursement(submitInput("missing"))).toEqual({
			success: false,
			error: "Kostenpunkt nicht gefunden",
		});
	});

	test("requires a session", async () => {
		const { kp } = await setup();
		expect(await submitReimbursement(submitInput(kp.id))).toEqual({
			success: false,
			error: "Nicht angemeldet",
		});
	});

	test("rounds amounts half-up to whole cents (#13)", async () => {
		const { member, kp } = await setup();
		signInAs(member);

		await submitReimbursement({ ...submitInput(kp.id), amount: 1.005 });

		expect((await onlyRow()).amount).toBe(1.01);
	});
});

describe("member self-service", () => {
	test("lists only my own requests, newest first, with plan and Kostenpunkt", async () => {
		const { member, kassier, kp } = await setup();
		await createReimbursement(kp, {
			submittedBy: member.id,
			description: "erste",
			createdAt: new Date("2026-10-01T00:00:00Z"),
		});
		await createReimbursement(kp, {
			submittedBy: member.id,
			description: "zweite",
			createdAt: new Date("2026-10-02T00:00:00Z"),
		});
		await createReimbursement(kp, { submittedBy: kassier.id });
		signInAs(member);

		const mine = await listMyReimbursements();

		expect(mine.map((r) => r.description)).toEqual(["zweite", "erste"]);
		expect(mine[0]).toMatchObject({
			kostenpunkt: { id: kp.id, name: "Antrittskneipe" },
			etaplan: { name: "WS 2026" },
		});
	});

	test("cancelling deletes my request while it is Eingereicht", async () => {
		const { member, kp } = await setup();
		const mine = await createReimbursement(kp, { submittedBy: member.id });
		signInAs(member);

		expect(await cancelMyReimbursement(mine.id)).toEqual({ success: true });
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("cannot cancel someone else's request or one already decided", async () => {
		const { member, kassier, kp } = await setup();
		const foreign = await createReimbursement(kp, { submittedBy: kassier.id });
		const approved = await createReimbursement(kp, {
			submittedBy: member.id,
			status: "Genehmigt",
		});
		signInAs(member);

		expect(await cancelMyReimbursement(foreign.id)).toEqual({
			success: false,
			error: "Antrag nicht gefunden",
		});
		expect(await cancelMyReimbursement(approved.id)).toEqual({
			success: false,
			error: "Nur eingereichte Anträge können storniert werden",
		});
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(2);
	});

	test("editing my request re-validates and may move it to another plan", async () => {
		const { member, kp } = await setup();
		const otherPlan = await createEtaplan();
		const otherKp = await createKostenpunkt(otherPlan.id);
		const mine = await createReimbursement(kp, { submittedBy: member.id });
		signInAs(member);

		const result = await updateMyReimbursement(mine.id, {
			...submitInput(otherKp.id),
			amount: 9.999,
			receipts: undefined,
		});

		expect(result).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			kostenpunktId: otherKp.id,
			etaplanId: otherPlan.id,
			amount: 10,
			iban: "DE89370400440532013000",
			receipts: null,
			status: "Eingereicht",
		});
	});

	test("editing is refused once the request left Eingereicht", async () => {
		const { member, kp } = await setup();
		const mine = await createReimbursement(kp, {
			submittedBy: member.id,
			status: "Abgelehnt",
			amount: 3,
		});
		signInAs(member);

		const result = await updateMyReimbursement(mine.id, submitInput(kp.id));

		expect(result).toEqual({
			success: false,
			error: "Nur eingereichte Anträge können bearbeitet werden",
		});
		expect((await onlyRow()).amount).toBe(3);
	});

	test("editing someone else's request is refused", async () => {
		const { member, kassier, kp } = await setup();
		const foreign = await createReimbursement(kp, {
			submittedBy: kassier.id,
			amount: 3,
		});
		signInAs(member);

		expect(await updateMyReimbursement(foreign.id, submitInput(kp.id))).toEqual(
			{ success: false, error: "Antrag nicht gefunden" },
		);
		expect((await onlyRow()).amount).toBe(3);
	});
});

describe("status workflow", () => {
	async function inStatus(
		status: "Eingereicht" | "Genehmigt" | "Ausgezahlt" | "Abgelehnt",
	) {
		const ctx = await setup();
		const row = await createReimbursement(ctx.kp, {
			submittedBy: ctx.member.id,
			status,
		});
		signInAs(ctx.kassier);
		return { ...ctx, row };
	}

	test("Eingereicht → Genehmigt → Ausgezahlt records who and when", async () => {
		const { kassier, row } = await inStatus("Eingereicht");

		expect(await approveReimbursement(row.id)).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			status: "Genehmigt",
			approvedBy: kassier.id,
			approvedAt: NOW,
		});

		const paidAt = new Date("2026-10-27T09:00:00Z");
		vi.setSystemTime(paidAt);
		expect(await markReimbursementPaid(row.id)).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			status: "Ausgezahlt",
			approvedAt: NOW,
			paidBy: kassier.id,
			paidAt,
		});
	});

	test("the payout date can be backdated", async () => {
		const { row } = await inStatus("Genehmigt");
		const paidAt = new Date("2026-10-01T00:00:00Z");

		await markReimbursementPaid(row.id, { paidAt });

		expect((await onlyRow()).paidAt).toEqual(paidAt);
	});

	test.each([
		"Eingereicht",
		"Genehmigt",
	] as const)("%s → Abgelehnt stores the trimmed reason", async (from) => {
		const { kassier, row } = await inStatus(from);

		const result = await rejectReimbursement(row.id, "  Kein Beleg  ");

		expect(result).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			status: "Abgelehnt",
			rejectionReason: "Kein Beleg",
			rejectedBy: kassier.id,
			rejectedAt: NOW,
		});
	});

	test("rejection reasons are required and capped at 500 characters", async () => {
		const { row } = await inStatus("Eingereicht");

		expect(await rejectReimbursement(row.id, "   ")).toEqual({
			success: false,
			error: "Begründung ist erforderlich",
		});
		expect((await onlyRow()).status).toBe("Eingereicht");

		await rejectReimbursement(row.id, "x".repeat(600));
		expect((await onlyRow()).rejectionReason).toHaveLength(500);
	});

	const invalid: [
		"Eingereicht" | "Genehmigt" | "Ausgezahlt" | "Abgelehnt",
		"approve" | "pay" | "reject",
	][] = [
		["Eingereicht", "pay"],
		["Genehmigt", "approve"],
		["Ausgezahlt", "approve"],
		["Ausgezahlt", "pay"],
		["Ausgezahlt", "reject"],
		["Abgelehnt", "approve"],
		["Abgelehnt", "pay"],
		["Abgelehnt", "reject"],
	];
	test.each(invalid)("%s cannot %s", async (from, action) => {
		const { row } = await inStatus(from);
		const run = {
			approve: () => approveReimbursement(row.id),
			pay: () => markReimbursementPaid(row.id),
			reject: () => rejectReimbursement(row.id, "Grund"),
		}[action];

		expect(await run()).toEqual({
			success: false,
			error: "Ungültiger Statusübergang",
		});
		const after = await onlyRow();
		expect(after.status).toBe(from);
		expect(after).toMatchObject({
			approvedBy: null,
			paidBy: null,
			rejectedBy: null,
		});
	});

	test("transitions on an unknown request report it", async () => {
		await inStatus("Eingereicht");
		for (const result of [
			await approveReimbursement("missing"),
			await rejectReimbursement("missing", "x"),
			await markReimbursementPaid("missing"),
		]) {
			expect(result).toEqual({
				success: false,
				error: "Antrag nicht gefunden",
			});
		}
	});
});

describe("treasury bookings", () => {
	test("a direct booking is stored as already paid on the expense date", async () => {
		const { kassier, plan, kp } = await setup();
		signInAs(kassier);
		const expenseDate = new Date("2026-10-03T00:00:00Z");

		const result = await createDirectBooking({
			kostenpunktId: kp.id,
			description: "Getränkemarkt",
			amount: 89.994,
			recipientName: "Getränke Müller",
			iban: null,
			expenseDate,
		});

		expect(result).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			etaplanId: plan.id,
			source: "Direktbuchung",
			status: "Ausgezahlt",
			amount: 89.99,
			submittedBy: null,
			iban: null,
			approvedBy: kassier.id,
			approvedAt: expenseDate,
			paidBy: kassier.id,
			paidAt: expenseDate,
		});
	});

	test("a direct booking needs a recipient and a known Kostenpunkt", async () => {
		const { kassier, kp } = await setup();
		signInAs(kassier);
		const base = {
			kostenpunktId: kp.id,
			description: "x",
			amount: 1,
			recipientName: "R",
			expenseDate: NOW,
		};

		expect(await createDirectBooking({ ...base, recipientName: "" })).toEqual({
			success: false,
			error: "Empfänger ist erforderlich",
		});
		expect(
			await createDirectBooking({ ...base, kostenpunktId: "missing" }),
		).toEqual({ success: false, error: "Kostenpunkt nicht gefunden" });
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("updateReimbursement patches given fields and follows the Kostenpunkt's plan", async () => {
		const { kassier, kp } = await setup();
		const otherPlan = await createEtaplan();
		const otherKp = await createKostenpunkt(otherPlan.id);
		const row = await createReimbursement(kp, {
			status: "Ausgezahlt",
			description: "alt",
			recipientName: "bleibt",
		});
		signInAs(kassier);

		const result = await updateReimbursement(row.id, {
			kostenpunktId: otherKp.id,
			description: "korrigiert",
			amount: 15.5,
			receipts: [receipt],
		});

		expect(result).toEqual({ success: true });
		expect(await onlyRow()).toMatchObject({
			kostenpunktId: otherKp.id,
			etaplanId: otherPlan.id,
			description: "korrigiert",
			amount: 15.5,
			receipts: [receipt],
			recipientName: "bleibt",
			status: "Ausgezahlt",
		});
	});

	test("updateReimbursement rejects empty patches and unknown Kostenpunkte", async () => {
		const { kassier, kp } = await setup();
		const row = await createReimbursement(kp);
		signInAs(kassier);

		expect(await updateReimbursement(row.id, {})).toEqual({
			success: false,
			error: "Keine Änderungen",
		});
		expect(
			await updateReimbursement(row.id, { kostenpunktId: "missing" }),
		).toEqual({ success: false, error: "Kostenpunkt nicht gefunden" });
		expect((await onlyRow()).kostenpunktId).toBe(kp.id);
	});
});

describe("listReimbursementQueue", () => {
	async function queueSetup(viewer: (ctx: { kassier: TestUser }) => TestUser) {
		const ctx = await setup();
		const otherPlan = await createEtaplan();
		const otherKp = await createKostenpunkt(otherPlan.id);
		await createReimbursement(ctx.kp, {
			submittedBy: ctx.member.id,
			description: "a-offen",
			createdAt: new Date("2026-10-01T00:00:00Z"),
		});
		await createReimbursement(ctx.kp, {
			status: "Genehmigt",
			description: "a-genehmigt",
			createdAt: new Date("2026-10-02T00:00:00Z"),
		});
		await createReimbursement(otherKp, {
			description: "b-offen",
			createdAt: new Date("2026-10-03T00:00:00Z"),
		});
		signInAs(viewer(ctx));
		return { ...ctx, otherPlan };
	}

	test("filters by plan and status, newest first, with submitter", async () => {
		const { plan, member } = await queueSetup((c) => c.kassier);

		expect((await listReimbursementQueue()).map((r) => r.description)).toEqual([
			"b-offen",
			"a-genehmigt",
			"a-offen",
		]);
		const forPlan = await listReimbursementQueue({ etaplanId: plan.id });
		expect(forPlan.map((r) => r.description)).toEqual([
			"a-genehmigt",
			"a-offen",
		]);
		expect(forPlan[1]?.submitter).toEqual({ id: member.id, name: "Fux Fuchs" });
		expect(
			(
				await listReimbursementQueue({
					etaplanId: plan.id,
					status: "Eingereicht",
				})
			).map((r) => r.description),
		).toEqual(["a-offen"]);
	});

	test("a plain member gets an empty queue", async () => {
		await queueSetup((c) => c.kassier);
		signInAs(await createUser());
		expect(await listReimbursementQueue()).toEqual([]);
	});
});

describe("receipt links", () => {
	const foreignCorps = {
		url: `${STORE}/tenants/hassia/receipts/1-beleg.pdf`,
		name: "beleg.pdf",
	};
	const foreignHost = {
		url: "https://files.example/tenants/rhenania/receipts/1-beleg.pdf",
		name: "beleg.pdf",
	};
	const invalid = { success: false, error: "Ungültiger Beleg" };

	test.each([
		["another Corps' receipt", foreignCorps],
		["a foreign host", foreignHost],
	])("submitting %s is refused", async (_label, bad) => {
		const { member, kp } = await setup();
		signInAs(member);

		expect(
			await submitReimbursement({
				...submitInput(kp.id),
				receipts: [receipt, bad],
			}),
		).toEqual(invalid);
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("a direct booking with another Corps' receipt is refused", async () => {
		const { kassier, kp } = await setup();
		signInAs(kassier);

		expect(
			await createDirectBooking({
				kostenpunktId: kp.id,
				description: "Fass",
				amount: 80,
				recipientName: "Brauerei",
				receipts: [foreignCorps],
				expenseDate: NOW,
			}),
		).toEqual(invalid);
		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("editing my request keeps stored links but refuses new foreign ones", async () => {
		const { member, kp } = await setup();
		const legacy = { url: "https://blob.example/alt.pdf", name: "alt.pdf" };
		const mine = await createReimbursement(kp, {
			submittedBy: member.id,
			receipts: [legacy],
		});
		signInAs(member);

		expect(
			await updateMyReimbursement(mine.id, {
				...submitInput(kp.id),
				receipts: [legacy, receipt],
			}),
		).toEqual({ success: true });
		expect((await onlyRow()).receipts).toEqual([legacy, receipt]);

		expect(
			await updateMyReimbursement(mine.id, {
				...submitInput(kp.id),
				receipts: [legacy, foreignHost],
			}),
		).toEqual(invalid);
		expect((await onlyRow()).receipts).toEqual([legacy, receipt]);
	});

	test("the treasury can't attach another Corps' receipt", async () => {
		const { kassier, kp } = await setup();
		const row = await createReimbursement(kp, { receipts: [receipt] });
		signInAs(kassier);

		expect(
			await updateReimbursement(row.id, {
				description: "neu",
				receipts: [receipt, foreignCorps],
			}),
		).toEqual(invalid);
		expect(
			await updateReimbursement(row.id, {
				receipts: [{ url: "not a url", name: "x" }],
			}),
		).toEqual(invalid);
		expect(await onlyRow()).toMatchObject({
			description: expect.not.stringMatching("neu"),
			receipts: [receipt],
		});

		expect(await updateReimbursement(row.id, { receipts: [] })).toEqual({
			success: true,
		});
		expect((await onlyRow()).receipts).toEqual([]);
	});
});
