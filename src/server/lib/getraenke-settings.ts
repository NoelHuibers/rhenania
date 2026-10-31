// getraenke-settings.ts — the drink markup for code that has no
// TenantScope yet (orders, menu, challenges).
//
// The value lives in the tenant DB (`kasse_config`) and is only read while
// `drinks.markup` is on; see `drinkPricing` in the Getränkekasse service.

import "server-only";

import {
	type DrinkPricingConfig,
	drinkPricing,
} from "~/server/modules/getraenkekasse/service";
import { currentTenantScope } from "./tenant-scope";

/** The current tenant's markup; 0 while the feature is off. */
export async function getDrinkPricingConfig(): Promise<DrinkPricingConfig> {
	return drinkPricing(await currentTenantScope());
}
