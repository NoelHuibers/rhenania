// server/actions/profile/downloadUserBillPDF.ts
"use server";

import { saveUserBillPDF } from "~/server/actions/billings/saveUserBillPDF";
import { auth } from "~/server/auth";

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

    // Generate or retrieve the PDF directly using billId
    const result = await saveUserBillPDF(billId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to generate PDF",
      };
    }

    return {
      success: true,
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
    };
  } catch (error) {
    console.error("Error downloading PDF:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to download PDF",
    };
  }
}
