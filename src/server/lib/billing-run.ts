// billing-run.ts — the Getränke billing run for the current request.
//
// The run itself is the billing service (server/modules/billing/run.ts);
// this entry point resolves the signed-in caller's tenant for "Inventur +
// Rechnung". A refused run throws its DomainError, whose message is meant
// for the user. Deliberately not a server action: `inventoryLoss` is charged
// as Umlage, and a value a browser can send must never decide that (#10).

import "server-only";

import { auth } from "~/server/auth";
import {
	type BillingRunResult,
	runGetraenkeBilling as runBilling,
} from "~/server/modules/billing/run";
import { scopeOf } from "./tenant-scope";

/**
 * Bills every unbilled order, carries open bills over and charges
 * `inventoryLoss` as Umlage to the active Hausbewohner, for the signed-in
 * caller's tenant. Only server code may pass a loss: the one read from the
 * inventory just closed.
 */
export async function runGetraenkeBilling({
	inventoryLoss,
}: {
	inventoryLoss: number;
}): Promise<BillingRunResult> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}
	return runBilling(await scopeOf(session.tenantId), session.user, {
		inventoryLoss,
	});
}
