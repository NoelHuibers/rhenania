"use server";
import { head, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { billCSVs, billPeriods } from "~/server/db/schema";
import { generateBillPeriodCSV } from "./createCSV";

/**
 * Save the generated CSV to Vercel Blob and database
 * Smart version that checks for existing CSV files before generating new ones
 * Returns download URL for client-side file download
 */
export async function saveBillPeriodCSV(
  billPeriodId: string,
  options?: {
    paypalBaseUrl?: string;
    delimiter?: string;
    includeEventBills?: boolean;
  }
): Promise<{
  success: boolean;
  csvId?: string;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  wasExisting?: boolean;
}> {
  try {
    const delimiter = options?.delimiter || ";";

    // Check if CSV already exists for this bill period
    const existingCSV = await db
      .select()
      .from(billCSVs)
      .where(eq(billCSVs.billPeriodId, billPeriodId))
      .limit(1);

    if (existingCSV.length > 0) {
      const existing = existingCSV[0]!;
      // Verify the blob actually exists in Vercel Blob storage
      try {
        await head(existing.blobUrl);
        // If we get here, the blob exists - return it
        return {
          success: true,
          csvId: existing.id,
          downloadUrl: existing.blobUrl,
          fileName: existing.fileName,
          wasExisting: true,
        };
      } catch (blobError) {
        // Blob doesn't exist anymore, clean up the database record
        console.warn(`Blob not found for CSV ${existing.id}, regenerating...`);
        await db.delete(billCSVs).where(eq(billCSVs.id, existing.id));
        // Continue to generate new CSV below
      }
    }

    // Generate new CSV since none exists or existing one was invalid
    const result = await generateBillPeriodCSV(billPeriodId, options);
    if (!result.success || !result.csvContent) {
      return {
        success: false,
        error: result.error || "Failed to generate CSV",
      };
    }

    const csvContent = result.csvContent;

    // Get the bill period to extract the date for filename
    const billPeriod = await db
      .select({ date: billPeriods.createdAt })
      .from(billPeriods)
      .where(eq(billPeriods.id, billPeriodId))
      .limit(1);

    const billDate = billPeriod[0]?.date;

    // Generate filename in German format: Rechnung_DD_MMM_YYYY.csv
    let fileName: string;
    if (billDate) {
      const date = new Date(billDate);
      const day = date.getDate().toString().padStart(2, "0");
      const monthNames = [
        "Jan",
        "Feb",
        "Mär",
        "Apr",
        "Mai",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Okt",
        "Nov",
        "Dez",
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      fileName = `bills/Rechnung_${day}_${month}_${year}.csv`;
    } else {
      fileName = `bills/Rechnung_${billPeriodId}.csv`; // fallback to ID if date not found
    }

    const fileSize = new Blob([csvContent]).size;

    // Upload to Vercel Blob
    const blob = await put(fileName, csvContent, {
      access: "public",
      contentType: "text/csv",
    });

    // Wait for blob to be available before proceeding
    let blobReady = false;
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500; // 500ms

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

    // Save new metadata to database
    const [insertResult] = await db
      .insert(billCSVs)
      .values({
        billPeriodId: billPeriodId,
        blobUrl: blob.url,
        fileName: fileName,
        delimiter: delimiter,
        fileSize: fileSize,
      })
      .returning({ id: billCSVs.id });

    return {
      success: true,
      csvId: insertResult?.id,
      downloadUrl: blob.url,
      fileName: fileName,
      wasExisting: false,
    };
  } catch (error) {
    console.error("Error saving CSV:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error saving CSV",
    };
  }
}
