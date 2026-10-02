// getraenke-settings.ts — tenant-chosen values behind the drink features.
//
// The values live in the tenant DB (`kasse_config` singleton) and are only
// read while the matching feature flag is on. With the flag off every helper
// returns the pre-feature behaviour without touching the config row.

import { eq } from "drizzle-orm";

import { isValidMarkupPercent } from "~/lib/pricing";
import { db } from "~/server/db";
import { kasseConfig } from "~/server/db/schema";
import { hasFeature } from "~/server/lib/features";

export type DrinkPricingConfig = {
	/** Whether the `drinks.markup` feature is on for this tenant. */
	enabled: boolean;
	/** Markup in percent; 0 while the feature is off. */
	markupPercent: number;
};

export async function getDrinkPricingConfig(): Promise<DrinkPricingConfig> {
	if (!(await hasFeature("drinks.markup"))) {
		return { enabled: false, markupPercent: 0 };
	}
	const [row] = await db
		.select({ markupPercent: kasseConfig.markupPercent })
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"))
		.limit(1);
	const value = Number(row?.markupPercent ?? 0);
	return {
		enabled: true,
		markupPercent: isValidMarkupPercent(value) ? value : 0,
	};
}

export type BillRecipient =
	| { mode: "members" }
	| { mode: "treasurer"; email: string };

/**
 * Who gets the mails for a new billing run. Falls back to the members when
 * the feature is off or no treasurer address has been saved.
 */
export async function getBillRecipient(): Promise<BillRecipient> {
	if (!(await hasFeature("billing.treasurerRecipient"))) {
		return { mode: "members" };
	}
	const [row] = await db
		.select({
			billRecipient: kasseConfig.billRecipient,
			treasurerEmail: kasseConfig.treasurerEmail,
		})
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"))
		.limit(1);
	const email = row?.treasurerEmail?.trim();
	if (row?.billRecipient === "treasurer" && email) {
		return { mode: "treasurer", email };
	}
	return { mode: "members" };
}
