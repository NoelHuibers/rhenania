import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	createEtaplan,
	createKonto,
	createKostenpunkt,
} from "../../../../test/factories/cc-kasse";
import {
	createCharge,
	createMember,
	createBeitragRun as seedRun,
	setMemberStatuses,
} from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	createBeitragRun,
	deleteBeitragRun,
	downloadChargePdf,
	listBeitragRuns,
	listChargesForRun,
	markChargeDeferred,
	markChargePaid,
	markChargeUnpaid,
	regenerateCharges,
	sendBeitragEmails,
	sendMahnungen,
} from "./semesterbeitrag";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

const NOW = new Date("2026-10-26T10:00:00Z");
const PAST_DUE = new Date("2026-10-01T00:00:00Z");
const FUTURE_DUE = new Date("2026-11-15T00:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.mocked(sendTenantMail).mockResolvedValue(undefined);
});
afterEach(() => {
	vi.useRealTimers();
});

async function setup(): Promise<{
	kassier: TestUser;
	kp: { id: string; etaplanId: string };
}> {
	await createTenant({ displayName: "Corps Testania" });
	const kassier = await createUser({ roles: ["CC-Kasse"] });
	signInAs(kassier);
	const plan = await createEtaplan();
	const kp = await createKostenpunkt(plan.id, { name: "Semesterbeiträge" });
	return { kassier, kp };
}

async function charges(runId: string) {
	return tenantDb()
		.select()
		.from(semesterbeitragCharges)
		.where(eq(semesterbeitragCharges.runId, runId));
}

async function chargeRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(semesterbeitragCharges)
		.where(eq(semesterbeitragCharges.id, id));
	return row;
}

describe("createBeitragRun", () => {
	test("charges every beitragspflichtige member with a name snapshot", async () => {
		const { kassier, kp } = await setup();
		const fuchs = await createMember({
			firstName: "Fritz",
			lastName: "Fuchs",
			status: "Fuchs",
		});
		const cb = await createMember({ status: "CB" });
		const iacbob = await createMember({ status: "iaCBoB" });
		await createMember({ status: "AH" });
		await createMember({ status: "AH idC" });
		await createMember({ status: "Gast" });

		const result = await createBeitragRun({
			name: "WS 2026/27",
			etaplanId: kp.etaplanId,
			kostenpunktId: kp.id,
			amount: 27.999,
			mahnungFee: 5.001,
			dueDate: FUTURE_DUE,
		});

		expect(result).toMatchObject({
			success: true,
			data: { chargesCreated: 3 },
		});
		const runId = result.success ? result.data.runId : "";
		const [run] = await tenantDb()
			.select()
			.from(semesterbeitragRuns)
			.where(eq(semesterbeitragRuns.id, runId));
		expect(run).toMatchObject({
			name: "WS 2026/27",
			amount: 28,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
			status: "Offen",
			createdBy: kassier.id,
		});
		const rows = await charges(runId);
		expect(rows.map((c) => c.memberId).sort()).toEqual(
			[fuchs.id, cb.id, iacbob.id].sort(),
		);
		expect(rows.find((c) => c.memberId === fuchs.id)).toMatchObject({
			memberName: "Fritz Fuchs",
			baseAmount: 28,
			mahnungAmount: 0,
			status: "Offen",
			deliveryMethod: null,
		});
	});

	test("follows the tenant's own status taxonomy", async () => {
		const { kp } = await setup();
		await setMemberStatuses([
			{ key: "Renonce", beitragspflichtig: true },
			{ key: "CB", beitragspflichtig: false },
		]);
		const renonce = await createMember({ status: "Renonce" });
		await createMember({ status: "CB" });

		const result = await createBeitragRun({
			name: "SS 2027",
			etaplanId: kp.etaplanId,
			kostenpunktId: kp.id,
			amount: 30,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
		});

		const runId = result.success ? result.data.runId : "";
		expect((await charges(runId)).map((c) => c.memberId)).toEqual([renonce.id]);
	});

	test("rejects a non-positive amount and writes nothing", async () => {
		const { kp } = await setup();
		await createMember({ status: "CB" });

		const result = await createBeitragRun({
			name: "X",
			etaplanId: kp.etaplanId,
			kostenpunktId: kp.id,
			amount: 0,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
		});

		expect(result.success).toBe(false);
		expect(await listBeitragRuns()).toEqual([]);
	});

	test("the AHV board cannot start a Beitragslauf", async () => {
		const { kp } = await setup();
		signInAs(await createUser({ roles: ["AHV 1. Vorstand"] }));

		const result = await createBeitragRun({
			name: "X",
			etaplanId: kp.etaplanId,
			kostenpunktId: kp.id,
			amount: 28,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
		});

		expect(result).toEqual({ success: false, error: "Keine Berechtigung" });
		expect(await tenantDb().select().from(semesterbeitragRuns)).toHaveLength(0);
	});

	// The run's paid charges count as Ist-Einnahmen of `run.kostenpunktId`
	// within `run.etaplanId`; a Kostenpunkt of another plan makes them vanish
	// from both overviews.
	test("rejects a Kostenpunkt that belongs to another Etatplan (#151)", async () => {
		const { kp } = await setup();
		const otherPlan = await createEtaplan();

		const result = await createBeitragRun({
			name: "X",
			etaplanId: otherPlan.id,
			kostenpunktId: kp.id,
			amount: 28,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
		});

		expect(result).toEqual({
			success: false,
			error: "Der Kostenpunkt gehört nicht zum gewählten Etatplan.",
		});
		expect(await tenantDb().select().from(semesterbeitragRuns)).toHaveLength(0);
	});

	test("rejects an unknown Kostenpunkt (#151)", async () => {
		const { kp } = await setup();

		const result = await createBeitragRun({
			name: "X",
			etaplanId: kp.etaplanId,
			kostenpunktId: "missing",
			amount: 28,
			mahnungFee: 5,
			dueDate: FUTURE_DUE,
		});

		expect(result).toEqual({
			success: false,
			error: "Kostenpunkt nicht gefunden",
		});
		expect(await tenantDb().select().from(semesterbeitragRuns)).toHaveLength(0);
	});
});

describe("regenerateCharges / deleteBeitragRun", () => {
	test("adds charges only for members who don't have one yet", async () => {
		const { kp } = await setup();
		const paid = await createMember({ status: "CB" });
		const run = await seedRun(kp, { amount: 30 });
		const existing = await createCharge(run.id, paid, {
			status: "Bezahlt",
			baseAmount: 28,
		});
		const late = await createMember({ status: "Fuchs" });
		await createMember({ status: "AH" });

		const result = await regenerateCharges(run.id);

		expect(result).toMatchObject({ success: true });
		const rows = await charges(run.id);
		expect(rows).toHaveLength(2);
		expect(rows.find((c) => c.id === existing.id)).toMatchObject({
			status: "Bezahlt",
			baseAmount: 28,
		});
		expect(rows.find((c) => c.memberId === late.id)).toMatchObject({
			status: "Offen",
			baseAmount: 30,
		});
	});

	test("reports an unknown run", async () => {
		await setup();
		expect(await regenerateCharges("missing")).toEqual({
			success: false,
			error: "Lauf nicht gefunden",
		});
		expect(await deleteBeitragRun("missing")).toEqual({
			success: false,
			error: "Lauf nicht gefunden",
		});
	});

	test("deletes a run with only open charges", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp);
		await createCharge(run.id, await createMember(), { status: "Gemahnt" });
		await createCharge(run.id, await createMember(), { status: "Gestundet" });

		expect(await deleteBeitragRun(run.id)).toEqual({ success: true });
		expect(await listBeitragRuns()).toEqual([]);
		expect(await charges(run.id)).toEqual([]);
	});

	test("refuses once any Beitrag is paid", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp);
		await createCharge(run.id, await createMember(), { status: "Bezahlt" });
		await createCharge(run.id, await createMember());

		const result = await deleteBeitragRun(run.id);

		expect(result.success).toBe(false);
		expect(await charges(run.id)).toHaveLength(2);
	});
});

describe("charges", () => {
	test("lists charges by name with totals, email presence and overdue flag", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp, { dueDate: PAST_DUE });
		await createCharge(
			run.id,
			await createMember({
				firstName: "B",
				lastName: "Offen",
				email: "b@x.test",
			}),
		);
		await createCharge(
			run.id,
			await createMember({ firstName: "A", lastName: "Gemahnt" }),
			{ status: "Gemahnt", mahnungAmount: 5 },
		);
		await createCharge(
			run.id,
			await createMember({ firstName: "C", lastName: "Bezahlt" }),
			{ status: "Bezahlt", baseAmount: 0.1, mahnungAmount: 0.2 },
		);

		const result = await listChargesForRun(run.id);

		expect(result?.run.id).toBe(run.id);
		expect(
			result?.charges.map((c) => [
				c.memberName,
				c.total,
				c.hasEmail,
				c.ueberfaellig,
			]),
		).toEqual([
			["A Gemahnt", 33, false, false],
			["B Offen", 28, true, true],
			["C Bezahlt", 0.3, false, false],
		]);
	});

	test("open charges are not overdue before the due date", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp, { dueDate: FUTURE_DUE });
		await createCharge(run.id, await createMember());

		const result = await listChargesForRun(run.id);

		expect(result?.charges[0]?.ueberfaellig).toBe(false);
		expect(await listChargesForRun("missing")).toBeNull();
	});

	test("paid → unpaid → deferred keeps the payment trail consistent", async () => {
		const { kassier, kp } = await setup();
		const run = await seedRun(kp);
		const charge = await createCharge(run.id, await createMember());

		await markChargePaid(charge.id);
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Bezahlt",
			paidAt: NOW,
			paidBy: kassier.id,
		});

		await markChargeUnpaid(charge.id);
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Offen",
			paidAt: null,
			paidBy: null,
		});

		await markChargePaid(charge.id);
		await markChargeDeferred(charge.id);
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Gestundet",
			paidAt: null,
			paidBy: null,
		});
	});

	test("un-paying a reminded charge returns it to Gemahnt", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp);
		const charge = await createCharge(run.id, await createMember(), {
			status: "Bezahlt",
			mahnungSentAt: PAST_DUE,
			mahnungAmount: 5,
		});

		await markChargeUnpaid(charge.id);

		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Gemahnt",
			mahnungAmount: 5,
		});
		expect(await markChargeUnpaid("missing")).toEqual({
			success: false,
			error: "Nicht gefunden",
		});
	});
});

describe("sendBeitragEmails", () => {
	test("emails members with an address and queues letters for the rest", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, { name: "WS 2026", dueDate: FUTURE_DUE });
		const withMail = await createCharge(
			run.id,
			await createMember({
				firstName: "Max",
				lastName: "Muster",
				email: "max@example.test",
			}),
		);
		const noMail = await createCharge(run.id, await createMember());
		const alreadySent = await createCharge(
			run.id,
			await createMember({ email: "sent@example.test" }),
			{ emailSentAt: PAST_DUE, deliveryMethod: "email" },
		);

		const result = await sendBeitragEmails(run.id);

		expect(result).toEqual({
			success: true,
			emailed: 1,
			lettersPending: 1,
			failed: 0,
		});
		expect(sendTenantMail).toHaveBeenCalledTimes(1);
		const mail = vi.mocked(sendTenantMail).mock.calls[0]?.[0];
		expect(mail).toMatchObject({
			to: "max@example.test",
			subject: "Dein Semesterbeitrag — WS 2026",
			attachments: [
				{
					filename: "Beitragsrechnung_WS_2026_Max_Muster.pdf",
					contentType: "application/pdf",
				},
			],
		});
		expect(mail?.text).toContain("28,00€");
		expect(mail?.text).toContain("Corps Testania");
		const pdf = mail?.attachments?.[0]?.content as Buffer;
		expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

		expect(await chargeRow(withMail.id)).toMatchObject({
			emailSentAt: NOW,
			deliveryMethod: "email",
		});
		expect(await chargeRow(noMail.id)).toMatchObject({
			emailSentAt: null,
			deliveryMethod: "letter",
		});
		expect((await chargeRow(alreadySent.id))?.emailSentAt).toEqual(PAST_DUE);
	});

	test("onlyUnsent: false sends again to everyone with an address", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp);
		await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
			{
				emailSentAt: PAST_DUE,
			},
		);

		const result = await sendBeitragEmails(run.id, { onlyUnsent: false });

		expect(result).toMatchObject({ emailed: 1 });
		expect(sendTenantMail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "a@example.test" }),
		);
	});

	test("without an active CC-Kasse account nothing is sent", async () => {
		const { kp } = await setup();
		await createKonto({ isActive: false });
		await createKonto({ kasseType: "Getränkekasse" });
		const run = await seedRun(kp);
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);

		const result = await sendBeitragEmails(run.id);

		expect(result).toEqual({
			success: true,
			emailed: 0,
			lettersPending: 0,
			failed: 1,
		});
		expect(sendTenantMail).not.toHaveBeenCalled();
		expect((await chargeRow(charge.id))?.emailSentAt).toBeNull();
	});

	test("a mail failure is counted and the charge stays unsent for a retry", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp);
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);
		vi.mocked(sendTenantMail).mockRejectedValueOnce(new Error("SMTP down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await sendBeitragEmails(run.id);

		expect(result).toMatchObject({ emailed: 0, failed: 1 });
		expect(await chargeRow(charge.id)).toMatchObject({
			emailSentAt: null,
			deliveryMethod: null,
		});
	});

	test("reports an unknown run", async () => {
		await setup();
		expect(await sendBeitragEmails("missing")).toEqual({
			success: false,
			error: "Lauf nicht gefunden",
		});
	});

	test("does not send an invoice for an already paid Beitrag (#151)", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp);
		const paid = await createCharge(
			run.id,
			await createMember({ email: "paid@example.test" }),
			{
				status: "Bezahlt",
				paidAt: PAST_DUE,
			},
		);

		const result = await sendBeitragEmails(run.id);

		expect(result).toEqual({
			success: true,
			emailed: 0,
			lettersPending: 0,
			failed: 0,
		});
		expect(sendTenantMail).not.toHaveBeenCalled();
		expect(await chargeRow(paid.id)).toMatchObject({
			emailSentAt: null,
			deliveryMethod: null,
		});
	});

	test("paid charges are skipped even when re-sending to everyone (#151)", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp);
		await createCharge(
			run.id,
			await createMember({ email: "paid@example.test" }),
			{ status: "Bezahlt", emailSentAt: PAST_DUE },
		);
		await createCharge(
			run.id,
			await createMember({ email: "deferred@example.test" }),
			{ status: "Gestundet", emailSentAt: PAST_DUE },
		);

		const result = await sendBeitragEmails(run.id, { onlyUnsent: false });

		expect(result).toMatchObject({ emailed: 1, failed: 0 });
		expect(sendTenantMail).toHaveBeenCalledTimes(1);
		expect(sendTenantMail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "deferred@example.test" }),
		);
	});
});

describe("sendMahnungen", () => {
	test("is refused before the due date", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, { dueDate: FUTURE_DUE });
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);

		expect(await sendMahnungen(run.id)).toEqual({
			success: false,
			error: "Fälligkeitsdatum noch nicht erreicht.",
		});
		expect((await chargeRow(charge.id))?.status).toBe("Offen");
		expect(sendTenantMail).not.toHaveBeenCalled();
	});

	test("reminds open charges only, adding the fee", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, {
			name: "SS 2026",
			dueDate: PAST_DUE,
			mahnungFee: 5,
		});
		const open = await createCharge(
			run.id,
			await createMember({
				firstName: "Max",
				lastName: "Muster",
				email: "max@example.test",
			}),
		);
		const openLetter = await createCharge(run.id, await createMember());
		const deferred = await createCharge(
			run.id,
			await createMember({ email: "d@example.test" }),
			{ status: "Gestundet" },
		);
		const paid = await createCharge(
			run.id,
			await createMember({ email: "p@example.test" }),
			{ status: "Bezahlt" },
		);

		const result = await sendMahnungen(run.id);

		expect(result).toEqual({
			success: true,
			processed: 2,
			emailed: 1,
			lettersPending: 1,
			failed: 0,
		});
		expect(await chargeRow(open.id)).toMatchObject({
			status: "Gemahnt",
			mahnungAmount: 5,
			mahnungSentAt: NOW,
			deliveryMethod: "email",
		});
		expect(await chargeRow(openLetter.id)).toMatchObject({
			status: "Gemahnt",
			deliveryMethod: "letter",
		});
		expect(await chargeRow(deferred.id)).toMatchObject({
			status: "Gestundet",
			mahnungAmount: 0,
		});
		expect((await chargeRow(paid.id))?.status).toBe("Bezahlt");
		expect(sendTenantMail).toHaveBeenCalledTimes(1);
		const mail = vi.mocked(sendTenantMail).mock.calls[0]?.[0];
		expect(mail).toMatchObject({
			to: "max@example.test",
			subject: "Zahlungserinnerung — SS 2026",
			attachments: [{ filename: "Mahnung_SS_2026_Max_Muster.pdf" }],
		});
		expect(mail?.text).toContain("33,00€");

		// A second run sends nothing new.
		vi.mocked(sendTenantMail).mockClear();
		expect(await sendMahnungen(run.id)).toMatchObject({ processed: 0 });
		expect(sendTenantMail).not.toHaveBeenCalled();
	});

	// The charge only becomes Gemahnt (+fee, mahnungSentAt) after the PDF and
	// mail succeeded; a failed reminder stays Offen and is picked up again.
	test("a failed reminder can be retried (#151)", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp, { dueDate: PAST_DUE });
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);

		// No CC-Kasse account yet: the PDF cannot be generated.
		const first = await sendMahnungen(run.id);
		expect(first).toMatchObject({ failed: 1, emailed: 0 });

		await createKonto();
		const retry = await sendMahnungen(run.id);

		expect(retry).toMatchObject({ emailed: 1 });
		expect(sendTenantMail).toHaveBeenCalledTimes(1);
		expect((await chargeRow(charge.id))?.mahnungSentAt).toEqual(NOW);
	});

	test("a failed PDF leaves the charge untouched (#151)", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp, { dueDate: PAST_DUE, mahnungFee: 5 });
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);

		expect(await sendMahnungen(run.id)).toEqual({
			success: true,
			processed: 1,
			emailed: 0,
			lettersPending: 0,
			failed: 1,
		});

		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Offen",
			mahnungAmount: 0,
			mahnungSentAt: null,
			deliveryMethod: null,
		});
		expect(sendTenantMail).not.toHaveBeenCalled();
	});

	test("after a mail failure the retry reminds with the fee once (#151)", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, {
			name: "SS 2026",
			dueDate: PAST_DUE,
			mahnungFee: 5,
		});
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);
		vi.mocked(sendTenantMail).mockRejectedValueOnce(new Error("SMTP down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await sendMahnungen(run.id)).toMatchObject({
			processed: 1,
			emailed: 0,
			failed: 1,
		});
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Offen",
			mahnungAmount: 0,
			mahnungSentAt: null,
		});

		expect(await sendMahnungen(run.id)).toMatchObject({
			processed: 1,
			emailed: 1,
			failed: 0,
		});
		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Gemahnt",
			mahnungAmount: 5,
			mahnungSentAt: NOW,
			deliveryMethod: "email",
		});
		expect(sendTenantMail).toHaveBeenCalledTimes(2);
		expect(vi.mocked(sendTenantMail).mock.calls[1]?.[0]?.text).toContain(
			"33,00€",
		);
	});

	test("un-paying a charge whose reminder failed returns it to Offen (#151)", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp, { dueDate: PAST_DUE });
		const charge = await createCharge(run.id, await createMember());

		// No CC-Kasse account: the reminder fails.
		expect(await sendMahnungen(run.id)).toMatchObject({ failed: 1 });
		await markChargePaid(charge.id);
		await markChargeUnpaid(charge.id);

		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Offen",
			mahnungAmount: 0,
			mahnungSentAt: null,
		});
	});

	test("a payment booked while the reminder is sent is kept (#151)", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, { dueDate: PAST_DUE });
		const charge = await createCharge(
			run.id,
			await createMember({ email: "a@example.test" }),
		);
		vi.mocked(sendTenantMail).mockImplementationOnce(async () => {
			await markChargePaid(charge.id);
		});

		await sendMahnungen(run.id);

		expect(await chargeRow(charge.id)).toMatchObject({
			status: "Bezahlt",
			mahnungAmount: 0,
			mahnungSentAt: null,
		});
	});
});

describe("downloadChargePdf", () => {
	test("returns the invoice or reminder as a base64 PDF", async () => {
		const { kp } = await setup();
		await createKonto({ paypalLink: "paypal.me/corps" });
		const run = await seedRun(kp, { name: "WS 2026/27" });
		const charge = await createCharge(
			run.id,
			await createMember({
				firstName: "Jörg",
				lastName: "Müller",
				street: "Hauptstr.",
				houseNumber: "1",
				addressLine2: "c/o Haus",
				postalCode: "70173",
				city: "Stuttgart",
			}),
		);

		const invoice = await downloadChargePdf(charge.id);
		const reminder = await downloadChargePdf(charge.id, { isMahnung: true });

		expect(invoice).toMatchObject({
			success: true,
			fileName: "Beitragsrechnung_WS_2026_27_J_rg_M_ller.pdf",
		});
		expect(reminder).toMatchObject({
			success: true,
			fileName: "Mahnung_WS_2026_27_J_rg_M_ller.pdf",
		});
		if (!invoice.success) {
			return;
		}
		expect(
			Buffer.from(invoice.base64, "base64").subarray(0, 5).toString(),
		).toBe("%PDF-");
	});

	test("a reminder not sent yet shows the run fee, a sent one the stored fee (#151)", async () => {
		const { kp } = await setup();
		await createKonto();
		const run = await seedRun(kp, { mahnungFee: 5 });
		const open = await createCharge(run.id, await createMember());
		const reminded = await createCharge(run.id, await createMember(), {
			status: "Gemahnt",
			mahnungAmount: 7,
			mahnungSentAt: PAST_DUE,
		});
		const pdfText = async (chargeId: string) => {
			const pdf = await downloadChargePdf(chargeId, { isMahnung: true });
			if (!pdf.success) {
				throw new Error(pdf.error);
			}
			return Buffer.from(pdf.base64, "base64").toString("latin1");
		};

		const openText = await pdfText(open.id);
		const remindedText = await pdfText(reminded.id);

		expect(openText).toContain("Gesamtbetrag: 33,00");
		expect(remindedText).toContain("Gesamtbetrag: 35,00");
	});

	test("explains a missing CC-Kasse account or charge", async () => {
		const { kp } = await setup();
		const run = await seedRun(kp);
		const charge = await createCharge(run.id, await createMember());

		expect(await downloadChargePdf(charge.id)).toEqual({
			success: false,
			error: "Kein aktives CC-Kasse-Konto hinterlegt.",
		});
		expect(await downloadChargePdf("missing")).toEqual({
			success: false,
			error: "Beitrag nicht gefunden",
		});
	});
});
