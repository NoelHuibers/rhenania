import { head, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { billPDFs, bills } from "~/server/db/schema";
import { generateUserBillPDF } from "./createUserPDF";

/**
 * Saves a user's bill as PDF to blob storage
 * Gets the user ID from the server-side session
 * @param billId - The ID of the bill
 */
export async function saveUserBillPDF(billId: string): Promise<{
  success: boolean;
  pdfId?: string;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  wasExisting?: boolean;
}> {
  try {
    // Get current user
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("User must be authenticated to view billing data");
    }

    const userId = session.user.id;
    const userName = session.user.name;

    // Verify the bill belongs to this user
    const [bill] = await db
      .select({ userId: bills.userId })
      .from(bills)
      .where(eq(bills.id, billId))
      .limit(1);

    if (!bill) {
      return {
        success: false,
        error: "Bill not found",
      };
    }

    if (bill.userId !== userId) {
      return {
        success: false,
        error: "Unauthorized: This bill does not belong to you",
      };
    }

    // Check if PDF already exists for this bill
    const existingPDF = await db
      .select()
      .from(billPDFs)
      .where(eq(billPDFs.billId, billId))
      .limit(1);

    if (existingPDF.length > 0) {
      const existing = existingPDF[0]!;

      // Check if the blob still exists
      try {
        await head(existing.blobUrl);
        return {
          success: true,
          pdfId: existing.id,
          downloadUrl: existing.blobUrl,
          fileName: existing.fileName,
          wasExisting: true,
        };
      } catch (blobError) {
        console.warn(`Blob not found for PDF ${existing.id}, regenerating...`);
        // Delete the invalid record
        await db.delete(billPDFs).where(eq(billPDFs.id, existing.id));
      }
    }

    // Generate new PDF since none exists or existing one was invalid
    const result = await generateUserBillPDF(billId);

    if (!result.success || !result.pdfContent) {
      return {
        success: false,
        error: result.error || "Failed to generate PDF",
      };
    }

    // Upload to blob storage
    const fileName = `bills/${userName}/${result.fileName}`;
    const fileSize = result.pdfContent.length;

    const blob = await put(fileName, result.pdfContent, {
      access: "public",
      contentType: "application/pdf",
    });

    // Wait for blob to be available
    let blobReady = false;
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500;

    while (!blobReady && retries < maxRetries) {
      try {
        await head(blob.url);
        blobReady = true;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw new Error(
            "Blob upload timed out - file may not be immediately available"
          );
        }
      }
    }

    // Save to database
    const [insertResult] = await db
      .insert(billPDFs)
      .values({
        billId: billId,
        userId: userId,
        blobUrl: blob.url,
        fileName: result.fileName!,
        fileSize: fileSize,
      })
      .returning({ id: billPDFs.id });

    return {
      success: true,
      pdfId: insertResult?.id,
      downloadUrl: blob.url,
      fileName: result.fileName,
      wasExisting: false,
    };
  } catch (error) {
    console.error("Error saving PDF:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error saving PDF",
    };
  }
}
