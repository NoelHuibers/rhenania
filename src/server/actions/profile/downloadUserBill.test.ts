import { beforeEach, describe, expect, test, vi } from "vitest";

import { saveUserBillPDF } from "~/server/actions/billings/saveUserBillPDF";
import { createBill } from "../../../../test/factories/platform";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { downloadUserBillPDF } from "./downloadUserBill";

// PDF rendering and blob storage are covered with the billing actions.
vi.mock("~/server/actions/billings/saveUserBillPDF", () => ({
	saveUserBillPDF: vi.fn(),
}));

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function memberWithBill() {
	await createTenant();
	const member = await createUser();
	signInAs(member);
	const { bill } = await createBill({ userId: member.id });
	return bill;
}

describe("downloadUserBillPDF", () => {
	test("returns the download link of the member's bill PDF", async () => {
		const bill = await memberWithBill();
		vi.mocked(saveUserBillPDF).mockResolvedValueOnce({
			success: true,
			downloadUrl: "https://blob.example/bill.pdf",
			fileName: "Rechnung.pdf",
			pdfId: "pdf-1",
		});

		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: true,
			downloadUrl: "https://blob.example/bill.pdf",
			fileName: "Rechnung.pdf",
		});
		expect(saveUserBillPDF).toHaveBeenCalledWith(bill.id);
	});

	test("passes on PDF errors, with a default message", async () => {
		const bill = await memberWithBill();
		vi.mocked(saveUserBillPDF)
			.mockResolvedValueOnce({ success: false, error: "Bill not found" })
			.mockResolvedValueOnce({ success: false })
			.mockRejectedValueOnce(new Error("blob down"));

		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "Bill not found",
		});
		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "Failed to generate PDF",
		});
		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "blob down",
		});
	});

	test("refuses anonymous callers without generating anything", async () => {
		await createTenant();

		expect(await downloadUserBillPDF("any")).toEqual({
			success: false,
			error: "User must be authenticated to download billing data",
		});
		expect(saveUserBillPDF).not.toHaveBeenCalled();
	});
});
