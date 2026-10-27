// saveBillCSV.ts
"use server";

import { head, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getZonedParts } from "~/lib/time";
import { db } from "~/server/db";
import { billCSVs, billPeriods } from "~/server/db/schema";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { log } from "~/server/lib/log";
import { requireCurrentTenant } from "~/server/lib/tenant-context";
import { generateBillPeriodCSV } from "./createCSV";

export const saveBillPeriodCSV = defineAction(
	{
		schema: z.tuple([
			z.string(),
			z
				.object({
					paypalBaseUrl: z.string().optional(),
					delimiter: z.string().optional(),
				})
				.optional(),
		]),
		errorMessage: "Fehler beim Erstellen der CSV",
	},
	async ([billPeriodId, options]) => {
		const tenant = await requireCurrentTenant();
		const delimiter = options?.delimiter || ";";

		// Check if CSV already exists for this bill period
		const existingCSV = await db
			.select()
			.from(billCSVs)
			.where(eq(billCSVs.billPeriodId, billPeriodId))
			.limit(1);

		if (existingCSV.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: guarded by length check above
			const existing = existingCSV[0]!;
			try {
				await head(existing.blobUrl);
				return {
					csvId: existing.id,
					downloadUrl: existing.blobUrl,
					fileName: existing.fileName,
					wasExisting: true,
				};
			} catch (_blobError) {
				await log.warn("bill csv blob missing, regenerating", {
					csvId: existing.id,
				});
				await db.delete(billCSVs).where(eq(billCSVs.id, existing.id));
			}
		}

		// Generate new CSV since none exists or existing one was invalid
		// Generate with the delimiter that is recorded below, not createCSV's
		// own default.
		const result = await generateBillPeriodCSV(billPeriodId, {
			...options,
			delimiter,
		});
		if (!result.success || !result.csvContent) {
			// Unknown period or no bills; the details are logged there.
			throw new ActionError(
				"Für diese Abrechnung konnte keine CSV erstellt werden.",
				"CSV_FAILED",
			);
		}

		const csvContent = result.csvContent;

		const billPeriod = await db
			.select({ date: billPeriods.createdAt })
			.from(billPeriods)
			.where(eq(billPeriods.id, billPeriodId))
			.limit(1);

		const billDate = billPeriod[0]?.date;

		let fileName: string;
		if (billDate) {
			// The Berlin calendar day of the run, whatever the server's zone.
			const date = getZonedParts(new Date(billDate));
			const day = date.day.toString().padStart(2, "0");
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
			const month = monthNames[date.month - 1];
			const year = date.year;
			fileName = `tenants/${tenant.slug}/bills/Rechnung_${day}_${month}_${year}.csv`;
		} else {
			fileName = `tenants/${tenant.slug}/bills/Rechnung_${billPeriodId}.csv`;
		}

		const fileSize = new Blob([csvContent]).size;

		const blob = await put(fileName, csvContent, {
			access: "public",
			contentType: "text/csv;charset=utf-8",
			// Public blobs are readable by anyone with the URL: never make the
			// URL guessable from the period, date or member name.
			addRandomSuffix: true,
		});

		// Wait for blob to be available before proceeding
		let blobReady = false;
		let retries = 0;
		const maxRetries = 10;
		const retryDelay = 500;

		while (!blobReady && retries < maxRetries) {
			try {
				await head(blob.url);
				blobReady = true;
			} catch (_error) {
				retries++;
				if (retries < maxRetries) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				} else {
					throw new Error(
						"Blob upload timed out - file may not be immediately available",
					);
				}
			}
		}

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
			csvId: insertResult?.id,
			downloadUrl: blob.url,
			fileName: fileName,
			wasExisting: false,
		};
	},
);
