import { head, put } from "@vercel/blob";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { billPDFs } from "~/server/db/schema";
import {
	createBillPeriodRow,
	createBillRow,
	createKontoRow,
	pdfText,
	pdfValueAfter,
	setUpGetraenkeBilling,
} from "../../../../test/factories/billing";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { useServerTimeZone } from "../../../../test/server-tz";
import { generateUserBillPDF } from "./createUserPDF";
import { saveUserBillPDF } from "./saveUserBillPDF";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), head: vi.fn() }));

setupTestDatabases();

const putMock = vi.mocked(put);
const headMock = vi.mocked(head);

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	putMock.mockImplementation(async (pathname) => ({
		url: `https://blob.test/${pathname}`,
		downloadUrl: `https://blob.test/${pathname}?download=1`,
		pathname: String(pathname),
		contentType: "application/pdf",
		contentDisposition: "inline",
		etag: "etag",
	}));
	headMock.mockResolvedValue({} as Awaited<ReturnType<typeof head>>);
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function memberBill(
	opts: Partial<Parameters<typeof createBillRow>[0]> & { name?: string } = {},
) {
	const member = await createUser({ name: opts.name ?? "Max Muster" });
	const period = await createBillPeriodRow({
		billNumber: "KW-43-26",
		createdAt: new Date("2026-10-21T12:00:00Z"),
	});
	const bill = await createBillRow({
		periodId: period.id,
		user: member,
		drinksTotal: 3,
		oldBillingAmount: 20,
		fees: 2,
		items: [
			{ drinkName: "Wasser", amount: 1, pricePerDrink: 1 },
			{ drinkName: "Pils", amount: 2, pricePerDrink: 1 },
		],
		...opts,
	});
	return { member, period, bill };
}

describe("generateUserBillPDF", () => {
	test("reports unknown bills", async () => {
		await createTenant();

		expect(await generateUserBillPDF("missing")).toEqual({
			success: false,
			error: "Rechnung nicht gefunden",
		});
	});

	test("refuses without the tenant's sender and account (#9)", async () => {
		await createTenant();
		const { bill } = await memberBill();

		expect(await generateUserBillPDF(bill.id)).toEqual({
			success: false,
			error:
				"Bitte Absender und Konto in der Kasse hinterlegen (fehlt: Absender, Straße, PLZ und Ort, Kontoinhaber, Getränkekasse-Konto mit gültiger IBAN).",
		});

		// A konto alone is not enough either: the sender is missing.
		await createKontoRow();
		expect((await generateUserBillPDF(bill.id)).error).toBe(
			"Bitte Absender und Konto in der Kasse hinterlegen (fehlt: Absender, Straße, PLZ und Ort, Kontoinhaber).",
		);
	});

	test("prints the tenant's own sender and account holder (#9)", async () => {
		await createTenant();
		await setUpGetraenkeBilling({
			profile: {
				senderName: "Hans Hassia",
				senderStreet: "Am Markt 3",
				senderCity: "35390 Gießen",
				location: "",
				accountHolder: "Corps Hassia e.V.",
				paymentDueDays: 10,
			},
		});
		const { bill } = await memberBill();

		const text = pdfText(
			(await generateUserBillPDF(bill.id)).pdfContent as Buffer,
		);

		expect(text.slice(0, 4)).toEqual([
			"Hans Hassia",
			"Am Markt 3",
			"35390 Gießen",
			"Gießen den 21.10.26",
		]);
		expect(text.some((t) => t.endsWith("innerhalb von 10"))).toBe(true);
		expect(text.filter((t) => t === "Corps Hassia e.V.")).toHaveLength(2);
		expect(text).not.toContain("Noel Huibers");
	});

	test("leaves out the PayPal link when the tenant has none", async () => {
		await createTenant();
		await setUpGetraenkeBilling({ konto: { paypalLink: null } });
		const { bill } = await memberBill();

		const text = pdfText(
			(await generateUserBillPDF(bill.id)).pdfContent as Buffer,
		);

		expect(text.some((t) => t.includes("paypal"))).toBe(false);
		expect(text).toContain(
			"Bitte überweise mir den Betrag auf das genannte Konto innerhalb von 14",
		);
		expect(
			text.filter((t) => t === "DE89 3704 0044 0532 0130 00"),
		).toHaveLength(2);
	});

	test("renders the letter, items, summary and the Getränkekasse payment target", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const { bill } = await memberBill();

		const result = await generateUserBillPDF(bill.id);

		expect(result.success).toBe(true);
		expect(result.fileName).toBe("Rechnung_KW-43-26_Max_Muster.pdf");
		const pdf = result.pdfContent as Buffer;
		expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
		const text = pdfText(pdf);
		expect(text).toContain("Lieber Max Muster,");
		expect(text).toContain("Stuttgart den 21.10.26");
		expect(text.some((t) => t.startsWith("in Höhe von: 25,00"))).toBe(true);
		expect(text).toContain("https://paypal.me/corpskasse/025,00");
		expect(text).toContain("DE89 3704 0044 0532 0130 00");
		// Items sorted by drink name, one row each.
		const pils = text.indexOf("Pils");
		expect(pils).toBeGreaterThan(-1);
		expect(pils).toBeLessThan(text.indexOf("Wasser"));
		expect(text.slice(pils, pils + 4).map((t) => t.slice(0, 4))).toEqual([
			"Pils",
			"2",
			"1,00",
			"2,00",
		]);
		expect(pdfValueAfter(pdf, "Rechnungsbetrag:")).toMatch(/^3,00/);
		expect(pdfValueAfter(pdf, "Alte Rechnung:")).toMatch(/^20,00/);
		expect(pdfValueAfter(pdf, "Mahnung:")).toMatch(/^2,00/);
		expect(pdfValueAfter(pdf, "Gesamtbetrag:")).toMatch(/^25,00/);
	});

	test("marks paid and deferred bills", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const { bill: paid } = await memberBill({
			status: "Bezahlt",
			paidAt: new Date("2026-11-05T12:00:00Z"),
		});
		const deferred = await createBillRow({
			periodId: paid.billPeriodId,
			user: { id: "u2", name: "Moritz" },
			status: "Gestundet",
		});

		const paidText = pdfText(
			(await generateUserBillPDF(paid.id)).pdfContent as Buffer,
		);
		const deferredText = pdfText(
			(await generateUserBillPDF(deferred.id)).pdfContent as Buffer,
		);

		expect(paidText).toEqual(
			expect.arrayContaining(["BEZAHLT", "am 05.11.26"]),
		);
		expect(deferredText).toContain("GESTUNDET");
		expect(deferredText).not.toContain("BEZAHLT");
	});

	test("dates the letter and the payment by the Berlin day on a UTC server (#15)", async () => {
		useServerTimeZone("UTC");
		await createTenant();
		await setUpGetraenkeBilling();
		const member = await createUser({ name: "Max Muster" });
		// Thursday 22 Oct and Friday 6 Nov, both at 00:30 in Berlin.
		const period = await createBillPeriodRow({
			createdAt: new Date("2026-10-21T22:30:00Z"),
		});
		const bill = await createBillRow({
			periodId: period.id,
			user: member,
			status: "Bezahlt",
			paidAt: new Date("2026-11-05T23:30:00Z"),
		});

		const text = pdfText(
			(await generateUserBillPDF(bill.id)).pdfContent as Buffer,
		);

		expect(text).toContain("Stuttgart den 22.10.26");
		expect(text).toContain("am 06.11.26");
	});

	test("prints the bill's Umlage, so the lines add up to the total (#11)", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const { bill } = await memberBill({ umlage: 3.5 });

		const pdf = (await generateUserBillPDF(bill.id)).pdfContent as Buffer;

		expect(pdfValueAfter(pdf, "Umlage:")).toMatch(/^3,50/);
		const cents = (label: string) =>
			Math.round(
				Number.parseFloat((pdfValueAfter(pdf, label) ?? "").replace(",", ".")) *
					100,
			);
		expect(
			cents("Rechnungsbetrag:") +
				cents("Alte Rechnung:") +
				cents("Mahnung:") +
				cents("Umlage:"),
		).toBe(cents("Gesamtbetrag:"));
		expect(cents("Gesamtbetrag:")).toBe(2850);
	});

	test("states the 10% fee that billing actually charges (#11)", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const { bill } = await memberBill();

		const text = pdfText(
			(await generateUserBillPDF(bill.id)).pdfContent as Buffer,
		);

		expect(text.some((t) => t.includes("Mahnung in Höhe von 10%"))).toBe(true);
	});
});

describe("saveUserBillPDF", () => {
	test("uploads the member's own bill once and records it", async () => {
		const tenant = await createTenant();
		await setUpGetraenkeBilling();
		const { member, bill } = await memberBill();
		signInAs(member);

		const result = await saveUserBillPDF(bill.id);

		const path = `tenants/${tenant.slug}/bills/Max Muster/Rechnung_KW-43-26_Max_Muster.pdf`;
		expect(result).toMatchObject({
			success: true,
			downloadUrl: `https://blob.test/${path}`,
			fileName: "Rechnung_KW-43-26_Max_Muster.pdf",
			wasExisting: false,
		});
		expect(putMock).toHaveBeenCalledWith(path, expect.any(Buffer), {
			access: "public",
			contentType: "application/pdf",
			addRandomSuffix: true,
		});
		const [row] = await tenantDb().select().from(billPDFs);
		expect(row).toMatchObject({
			id: result.pdfId,
			billId: bill.id,
			userId: member.id,
			blobUrl: `https://blob.test/${path}`,
		});
		expect(row?.fileSize).toBeGreaterThan(1000);

		const again = await saveUserBillPDF(bill.id);

		expect(again).toMatchObject({
			success: true,
			wasExisting: true,
			pdfId: row?.id,
		});
		expect(putMock).toHaveBeenCalledTimes(1);
	});

	test("regenerates when the stored blob is gone", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const { member, bill } = await memberBill();
		signInAs(member);
		await saveUserBillPDF(bill.id);
		const [first] = await tenantDb().select().from(billPDFs);
		headMock.mockRejectedValueOnce(new Error("BlobNotFoundError"));

		const result = await saveUserBillPDF(bill.id);

		expect(result).toMatchObject({ success: true, wasExisting: false });
		expect(putMock).toHaveBeenCalledTimes(2);
		const rows = await tenantDb().select().from(billPDFs);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).not.toBe(first?.id);
	});

	test("refuses bills of other members and unknown bills", async () => {
		await createTenant();
		const { bill } = await memberBill();
		signInAs(await createUser({ name: "Someone Else" }));

		expect(await saveUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "Unauthorized: This bill does not belong to you",
		});
		expect(await saveUserBillPDF("missing")).toEqual({
			success: false,
			error: "Bill not found",
		});
		expect(putMock).not.toHaveBeenCalled();
		expect(await tenantDb().select().from(billPDFs)).toHaveLength(0);
	});
});
