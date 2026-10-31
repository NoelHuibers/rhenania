import { beforeEach, describe, expect, test, vi } from "vitest";

import { DomainError } from "~/server/lib/domain-error";
import { saveUserBillPdf } from "~/server/modules/billing/service";
import { createBill } from "../../../../test/factories/platform";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { downloadUserBillPDF } from "./downloadUserBill";

// PDF rendering and blob storage are covered with the billing actions.
vi.mock("~/server/modules/billing/service", () => ({
	saveUserBillPdf: vi.fn(),
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
		vi.mocked(saveUserBillPdf).mockResolvedValueOnce({
			downloadUrl: "https://blob.example/bill.pdf",
			fileName: "Rechnung.pdf",
			pdfId: "pdf-1",
			wasExisting: false,
		});

		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: true,
			downloadUrl: "https://blob.example/bill.pdf",
			fileName: "Rechnung.pdf",
		});
		expect(saveUserBillPdf).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId: expect.any(String) }),
			expect.objectContaining({ id: bill.userId }),
			bill.id,
		);
	});

	test("passes on PDF errors, with a default message", async () => {
		const bill = await memberWithBill();
		vi.mocked(saveUserBillPdf)
			.mockRejectedValueOnce(new DomainError("Bill not found", "NOT_FOUND"))
			.mockRejectedValueOnce("no error object")
			.mockRejectedValueOnce(new Error("blob down"));

		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "Bill not found",
		});
		expect(await downloadUserBillPDF(bill.id)).toEqual({
			success: false,
			error: "Failed to download PDF",
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
		expect(saveUserBillPdf).not.toHaveBeenCalled();
	});
});
