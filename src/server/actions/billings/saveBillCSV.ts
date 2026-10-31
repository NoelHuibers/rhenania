// saveBillCSV.ts
"use server";

import { z } from "zod";
import { defineAction } from "~/server/lib/define-action";
import { savePeriodCsv } from "~/server/modules/billing/service";

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
	async ([billPeriodId, options], { tenant }) =>
		savePeriodCsv(tenant, billPeriodId, options),
);
