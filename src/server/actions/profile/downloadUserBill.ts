// server/actions/profile/downloadUserBillPDF.ts
"use server";

import { auth } from "~/server/auth";
import { log } from "~/server/lib/log";
import { scopeOf } from "~/server/lib/tenant-scope";
import { saveUserBillPdf } from "~/server/modules/billing/service";

export async function downloadUserBillPDF(billId: string): Promise<{
	success: boolean;
	downloadUrl?: string;
	fileName?: string;
	error?: string;
}> {
	try {
		// Authenticate user on server side
		const session = await auth();
		if (!session?.user?.id) {
			throw new Error("User must be authenticated to download billing data");
		}

		// Generate or retrieve the member's own bill PDF.
		const { downloadUrl, fileName } = await saveUserBillPdf(
			await scopeOf(session.tenantId),
			session.user,
			billId,
		);
		return { success: true, downloadUrl, fileName };
	} catch (error) {
		await log.error("Error downloading PDF", { err: error });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to download PDF",
		};
	}
}
