// leaderboard.ts — data for the Literboard (/leaderboard).
//
// The page has no guard of its own (the middleware sends signed-out
// visitors to the sign-in page), so the reads use the request's tenant.

import "server-only";

import { currentTenantScope } from "~/server/lib/tenant-scope";
import * as orders from "~/server/modules/orders/service";

/** The top 20 drinkers, the chart per drink and month, the totals. */
export async function loadLeaderboard() {
	const tenant = await currentTenantScope();
	const rows = await orders.leaderboard(tenant, 20);
	const chart = await orders.consumptionByDrink(tenant);
	const total = await orders.totalConsumption(tenant);
	const growthRate = await orders.monthlyGrowthRate(tenant);
	return { rows, chart, total, growthRate };
}
