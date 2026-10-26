// createUserPDF.ts
// Server-only helpers, deliberately NOT "use server": the functions here
// must not be callable from the browser as server actions.
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "~/server/db/index";
import { billItems, billPeriods, bills } from "~/server/db/schema";
import {
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
} from "~/server/lib/getraenkekasse-payment";
import { buildUserBillData } from "~/server/lib/user-bill-data";
import {
	renderUserBillPDF,
	userBillPdfFileName,
} from "~/server/lib/user-bill-pdf";

interface PDFGenerationResult {
	success: boolean;
	pdfContent?: Buffer;
	fileName?: string;
	error?: string;
}

/**
 * Generates a PDF invoice for a specific bill
 * @param billId - The ID of the bill
 */
export async function generateUserBillPDF(
	billId: string,
): Promise<PDFGenerationResult> {
	try {
		// 1. Get the bill
		const [userBill] = await db
			.select()
			.from(bills)
			.where(eq(bills.id, billId))
			.limit(1);

		if (!userBill) {
			return {
				success: false,
				error: `Bill with ID ${billId} not found`,
			};
		}

		// 2. Get the bill period information
		const [billPeriod] = await db
			.select()
			.from(billPeriods)
			.where(eq(billPeriods.id, userBill.billPeriodId))
			.limit(1);

		if (!billPeriod) {
			return {
				success: false,
				error: `Bill period ${userBill.billPeriodId} not found`,
			};
		}

		// 3. Get all items for this bill
		const billItemsData = await db
			.select()
			.from(billItems)
			.where(eq(billItems.billId, billId))
			.orderBy(billItems.drinkName);

		// 4. What the PDF shows: the stored parts of the bill, Umlage included,
		// which add up to the stored total.
		const billData = buildUserBillData(userBill, billPeriod, billItemsData);

		// 6. Sender and payment target: the tenant's own Getränkekasse setup
		// (same data the profile page shows). No fallback to anybody else's.
		const resolved = await resolveGetraenkeBillSender();
		if (!resolved.ok) {
			return {
				success: false,
				error: incompleteBillingMessage(resolved.missing),
			};
		}
		return {
			success: true,
			pdfContent: renderUserBillPDF(billData, resolved.sender),
			fileName: userBillPdfFileName(billPeriod.billNumber, userBill.userName),
		};
	} catch (error) {
		console.error("Error generating PDF:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Unknown error generating PDF",
		};
	}
}
