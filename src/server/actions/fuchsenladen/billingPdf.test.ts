import { describe, expect, test, vi } from "vitest";

import { fuchsenBillItems } from "~/server/db/schema";
import { createFuchsenBillPeriod } from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import { updateFuchsenBillingConfig } from "./billingConfig";
import { generateFuchsenBillPDF } from "./billingPdf";

setupTestDatabases();

async function billFor(user: TestUser, total = 12.5) {
	const { bills } = await createFuchsenBillPeriod({
		billNumber: "KW-44-26",
		createdAt: new Date("2026-10-28T11:00:00Z"),
		bills: [{ user, itemsTotal: total - 2, oldBillingAmount: 2 }],
	});
	const bill = bills[0];
	if (!bill) {
		throw new Error("no bill");
	}
	await tenantDb().insert(fuchsenBillItems).values({
		billId: bill.id,
		itemName: "Mars",
		amount: 7,
		pricePerItem: 1.5,
		totalPrice: 10.5,
	});
	return bill;
}

/** jsPDF writes uncompressed content streams, so plain text is greppable. */
function pdfText(base64: string | undefined) {
	return Buffer.from(base64 ?? "", "base64").toString("latin1");
}

describe("generateFuchsenBillPDF", () => {
	test("members can download their own bill with the payment details", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Fuchs"] }));
		await updateFuchsenBillingConfig({
			senderName: "Fuchsenwart",
			senderStreet: "",
			senderCity: "",
			location: "Stuttgart",
			iban: "DE89370400440532013000",
			accountHolder: "Max Fux",
			paypalBaseUrl: "https://paypal.me/maxfux/",
			paymentDueDays: 14,
		});
		const member = await createUser({ name: "Jörg Müller" });
		const bill = await billFor(member);
		signInAs(member);

		const result = await generateFuchsenBillPDF(bill.id);

		expect(result).toMatchObject({
			success: true,
			fileName: "Fuchsenrechnung_KW-44-26_J_rg_M_ller.pdf",
		});
		const text = pdfText(result.base64);
		expect(text.startsWith("%PDF-")).toBe(true);
		expect(text).toContain("https://paypal.me/maxfux/012,50");
		expect(text).toContain("IBAN: DE89370400440532013000");
		expect(text).toContain("Stuttgart, den 28.10.26");
	});

	test("Fuchsenwart can download any member's bill", async () => {
		await createTenant();
		const bill = await billFor(await createUser());
		signInAs(await createUser({ roles: ["Fuchs"] }));

		expect((await generateFuchsenBillPDF(bill.id)).success).toBe(true);
	});

	test("refuses other members' bills, unknown bills and anonymous callers", async () => {
		await createTenant();
		const bill = await billFor(await createUser());
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await generateFuchsenBillPDF(bill.id)).toMatchObject({
			success: false,
		});
		signInAs(await createUser());
		expect(await generateFuchsenBillPDF(bill.id)).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect(await generateFuchsenBillPDF("missing")).toEqual({
			success: false,
			error: "Rechnung nicht gefunden",
		});
	});
});
