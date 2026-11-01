// sempro.ts — data for the Semesterprogramm PDF (/api/sempro/pdf).

import "server-only";

import type { PDFData } from "~/server/domain/events/sempro";
import { scopeOf } from "~/server/lib/tenant-scope";
import { semproPdfData } from "~/server/modules/events/service";

/**
 * What the PDF of `tenantId` (the caller's Corps) shows, or null until the
 * semester's name and dates are saved.
 */
export async function loadSemproPdf(tenantId: string): Promise<PDFData | null> {
	return semproPdfData(await scopeOf(tenantId));
}
